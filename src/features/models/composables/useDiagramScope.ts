import { computed, onScopeDispose, ref, watch, type Ref } from 'vue'
import type { ApiError } from '@/composables/useApi'
import type { LinkResponse, NodeResponse } from '@/types/api'
import type { ModelEditorState } from '../types'
import { isEdgeAnchorModelNodeId } from '../utils/diagramOnlyInstances'
import { DiagramAttrsLoadError, ensureDiagramAttrsLoaded } from './ensureDiagramAttrs'
import { resolveModelLinks, resolveModelNodes } from './modelScopedApi'
import type { useModelPartialStore } from './useModelPartialStore'

const DIAGRAM_SCOPE_LINK_LIMIT = 5000
const LINK_LIMIT_ERROR_CODE = 'MODEL_LINK_RESOLVE_RESULT_LIMIT_EXCEEDED'

export type DiagramScopeProgress = {
  phase: 'diagram' | 'nodes' | 'links' | 'endpoints'
  loaded: number
  total: number
}

export type DiagramScopeError = {
  status: number
  message: string
  code?: string
}

type DiagramScopeSession = {
  modelId: string
  diagramId: string
  controller: AbortController
  guard: ReturnType<ReturnType<typeof useModelPartialStore>['store']['beginRequest']>
  releaseExternalAbort?: () => void
}

const uniqueIds = (ids: readonly string[]): string[] => {
  const seen = new Set<string>()
  const result: string[] = []
  for (const id of ids) {
    const normalized = id.trim()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
  }
  return result
}

const errorCode = (error: ApiError): string | undefined => {
  if (!error.details || typeof error.details !== 'object' || Array.isArray(error.details)) {
    return undefined
  }
  const code = (error.details as Record<string, unknown>).code
  return typeof code === 'string' && code ? code : undefined
}

const toScopeError = (error: ApiError): DiagramScopeError => ({
  status: error.status,
  message: error.message,
  ...(errorCode(error) ? { code: errorCode(error) } : {}),
})

export function useDiagramScope(options: {
  state: Ref<ModelEditorState>
  selectedDiagramId: Ref<string | null>
  partialStore: ReturnType<typeof useModelPartialStore>
  autoOpen?: boolean
  beforeOpen?: () => Promise<void>
}) {
  const progress = ref<DiagramScopeProgress | null>(null)
  const error = ref<DiagramScopeError | null>(null)
  const ready = ref<Pick<DiagramScopeSession, 'modelId' | 'diagramId' | 'guard'> | null>(null)
  let active: DiagramScopeSession | null = null

  const isReady = (): boolean => {
    // State replacement makes the computed refs observe partial-store resets even though
    // ModelPartialStore itself is intentionally not a reactive proxy.
    void options.state.value.nodes
    return (
      ready.value !== null &&
      options.state.value.modelId === ready.value.modelId &&
      options.selectedDiagramId.value === ready.value.diagramId &&
      options.partialStore.store.isRequestCurrent(ready.value.guard)
    )
  }
  const diagramScopeReady = computed(isReady)
  const readyDiagramId = computed(() => (isReady() ? (ready.value?.diagramId ?? null) : null))

  const isCurrent = (session: DiagramScopeSession): boolean =>
    active === session &&
    !session.controller.signal.aborted &&
    options.state.value.modelId === session.modelId &&
    options.selectedDiagramId.value === session.diagramId &&
    options.partialStore.store.isRequestCurrent(session.guard)

  const updateProgress = (
    session: DiagramScopeSession,
    phase: DiagramScopeProgress['phase'],
    loaded: number,
    total: number
  ): void => {
    if (isCurrent(session)) progress.value = { phase, loaded, total }
  }

  const cancel = (): void => {
    active?.releaseExternalAbort?.()
    active?.controller.abort()
    active = null
    progress.value = null
    error.value = null
    ready.value = null
  }

  const open = async (diagramId: string, externalSignal?: AbortSignal): Promise<void> => {
    cancel()
    const modelId = options.state.value.modelId
    if (!modelId || options.selectedDiagramId.value !== diagramId || externalSignal?.aborted) return
    const session: DiagramScopeSession = {
      modelId,
      diagramId,
      controller: new AbortController(),
      guard: options.partialStore.store.beginRequest('diagram-scope'),
    }
    active = session
    if (externalSignal) {
      const abortFromExternal = (): void => {
        if (active === session) cancel()
        else session.controller.abort()
      }
      externalSignal.addEventListener('abort', abortFromExternal, { once: true })
      session.releaseExternalAbort = () =>
        externalSignal.removeEventListener('abort', abortFromExternal)
    }
    updateProgress(session, 'diagram', 0, 1)

    try {
      const diagram = await ensureDiagramAttrsLoaded(() => options.state.value, diagramId, {
        expectedModelId: modelId,
        shouldApply: () => isCurrent(session),
        signal: session.controller.signal,
      })
      if (!diagram || !isCurrent(session)) return
      updateProgress(session, 'diagram', 1, 1)

      const nodeIds = uniqueIds(
        diagram.parsedAttrs.instances.nodes.map(instance => instance.modelNodeId)
      ).filter(modelNodeId => !isEdgeAnchorModelNodeId(modelNodeId))
      const linkIds = uniqueIds(
        diagram.parsedAttrs.instances.edges.map(instance => instance.modelLinkId)
      )

      updateProgress(session, 'nodes', 0, nodeIds.length)
      const nodesResult = await resolveModelNodes(modelId, nodeIds, session.controller.signal)
      if (!isCurrent(session)) return
      if (!nodesResult.success) {
        error.value = toScopeError(nodesResult.error)
        return
      }
      updateProgress(session, 'nodes', nodeIds.length, nodeIds.length)

      updateProgress(session, 'links', 0, nodeIds.length + linkIds.length)
      const linksResult = await resolveModelLinks(
        modelId,
        { linkIds, endpointNodeIds: nodeIds },
        session.controller.signal
      )
      if (!isCurrent(session)) return
      if (!linksResult.success) {
        error.value = toScopeError(linksResult.error)
        return
      }
      if (linksResult.data.links.length > DIAGRAM_SCOPE_LINK_LIMIT) {
        error.value = {
          status: 413,
          code: LINK_LIMIT_ERROR_CODE,
          message: `Resolved diagram scope exceeds ${DIAGRAM_SCOPE_LINK_LIMIT} links.`,
        }
        return
      }
      updateProgress(
        session,
        'links',
        nodeIds.length + linkIds.length,
        nodeIds.length + linkIds.length
      )

      const nodes: NodeResponse[] = [...nodesResult.data.nodes]
      const links: LinkResponse[] = linksResult.data.links
      const knownNodeIds = new Set([
        ...options.partialStore.store.nodeById.keys(),
        ...nodes.map(node => node.id),
      ])
      const endpointIds = uniqueIds(links.flatMap(link => [link.sourceId, link.targetId])).filter(
        id => !knownNodeIds.has(id) && !isEdgeAnchorModelNodeId(id)
      )

      if (endpointIds.length > 0) {
        updateProgress(session, 'endpoints', 0, endpointIds.length)
        const endpointsResult = await resolveModelNodes(
          modelId,
          endpointIds,
          session.controller.signal
        )
        if (!isCurrent(session)) return
        if (!endpointsResult.success) {
          error.value = toScopeError(endpointsResult.error)
          return
        }
        nodes.push(...endpointsResult.data.nodes)
        updateProgress(session, 'endpoints', endpointIds.length, endpointIds.length)
      }

      if (!isCurrent(session)) return
      if (!options.partialStore.mergePartialEntities(nodes, links, session.guard)) return
      if (!isCurrent(session)) return
      ready.value = {
        modelId,
        diagramId,
        guard: session.guard,
      }
      error.value = null
    } catch (caught) {
      if (!isCurrent(session)) return
      error.value =
        caught instanceof DiagramAttrsLoadError
          ? {
              status: caught.status,
              message: caught.message,
              ...(caught.code ? { code: caught.code } : {}),
            }
          : {
              status: 0,
              message:
                caught instanceof Error ? caught.message : 'Не удалось загрузить данные диаграммы.',
            }
    } finally {
      session.releaseExternalAbort?.()
      if (isCurrent(session)) progress.value = null
    }
  }

  const reload = async (signal?: AbortSignal): Promise<void> => {
    const diagramId = options.selectedDiagramId.value
    if (!diagramId) {
      cancel()
      return
    }
    await open(diagramId, signal)
  }

  if (options.autoOpen) {
    let watchToken = 0
    watch(
      [
        options.selectedDiagramId,
        () => options.state.value.modelId,
        options.partialStore.generation,
      ],
      async ([diagramId]) => {
        const token = ++watchToken
        cancel()
        if (typeof diagramId !== 'string' || !diagramId) return
        await options.beforeOpen?.()
        if (token !== watchToken || options.selectedDiagramId.value !== diagramId) return
        await open(diagramId)
      },
      { immediate: true }
    )
  }

  onScopeDispose(cancel)

  return { open, reload, cancel, progress, error, readyDiagramId, diagramScopeReady }
}
