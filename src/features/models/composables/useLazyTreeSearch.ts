import { onScopeDispose, ref, watch, type Ref } from 'vue'
import type { ModelPartialRequestGuard } from '../types'
import type { ModelSearchHit, NodeResponse } from '@/types/api'
import { fetchNodeAncestors, resolveModelNodes, searchModelNodes } from './modelScopedApi'

type LazyTreeSearchOptions = {
  modelId: Ref<string>
  treeRootNodeId: Ref<string | null | undefined>
  query: Ref<string>
  mergeNodes: (nodes: readonly NodeResponse[], guard: ModelPartialRequestGuard) => boolean
  beginRequest: () => ModelPartialRequestGuard
  isRequestCurrent: (guard: ModelPartialRequestGuard) => boolean
}

export type LazyTreeSearchSelection = {
  nodePath: string[]
  diagramId: string | null
}

const SEARCH_DEBOUNCE_MS = 200
const SEARCH_LIMIT = 50
const SEARCH_KINDS = ['nodes', 'diagrams'] as const

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Не удалось выполнить поиск.'

const isTreeSearchHit = (hit: ModelSearchHit): hit is ModelSearchHit & { kind: 'node' | 'diagram' } =>
  hit.kind === 'node' || hit.kind === 'diagram'

export function useLazyTreeSearch(options: LazyTreeSearchOptions) {
  const hits = ref<ModelSearchHit[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const selectionLoading = ref(false)
  const selectionError = ref<string | null>(null)
  let timer: ReturnType<typeof setTimeout> | null = null
  let controller: AbortController | null = null
  let selectionController: AbortController | null = null
  let sequence = 0
  let selectionSequence = 0
  let lastSelectedHit: ModelSearchHit | null = null

  const cancelSearch = (): void => {
    if (timer) clearTimeout(timer)
    timer = null
    controller?.abort()
    controller = null
    sequence += 1
    loading.value = false
  }

  const cancelSelection = (forgetLastSelection = false): void => {
    selectionController?.abort()
    selectionController = null
    selectionSequence += 1
    selectionLoading.value = false
    selectionError.value = null
    if (forgetLastSelection) lastSelectedHit = null
  }

  const runSearch = async (): Promise<void> => {
    const query = options.query.value.trim()
    const modelId = options.modelId.value
    if (!query || !modelId) {
      hits.value = []
      error.value = null
      loading.value = false
      return
    }

    controller?.abort()
    const requestController = new AbortController()
    controller = requestController
    const requestSequence = ++sequence
    loading.value = true
    error.value = null
    try {
      const result = await searchModelNodes(modelId, query, {
        limit: SEARCH_LIMIT,
        kinds: [...SEARCH_KINDS],
        signal: requestController.signal,
      })
      if (
        requestController.signal.aborted ||
        requestSequence !== sequence ||
        options.modelId.value !== modelId ||
        options.query.value.trim() !== query
      ) {
        return
      }
      if (!result.success) {
        error.value = result.error.message
        hits.value = []
        return
      }
      hits.value = result.data.hits.filter(isTreeSearchHit)
    } catch (cause) {
      if (!requestController.signal.aborted && requestSequence === sequence) {
        error.value = errorMessage(cause)
        hits.value = []
      }
    } finally {
      if (requestSequence === sequence) {
        loading.value = false
        if (controller === requestController) controller = null
      }
    }
  }

  const retry = (): Promise<void> => runSearch()

  const materializeNodePath = async (
    nodeId: string,
    requestController: AbortController,
    requestSequence: number,
    modelId: string,
    guard: ModelPartialRequestGuard,
    externalGuard: () => boolean
  ): Promise<string[]> => {
    const isCurrent = (): boolean =>
      !requestController.signal.aborted &&
      requestSequence === selectionSequence &&
      options.modelId.value === modelId &&
      options.isRequestCurrent(guard) &&
      externalGuard()

    const ancestorsResult = await fetchNodeAncestors(modelId, nodeId, requestController.signal)
    if (!isCurrent()) return []
    if (!ancestorsResult.success) {
      selectionError.value = ancestorsResult.error.message
      return []
    }
    const nodeResult = await resolveModelNodes(modelId, [nodeId], requestController.signal)
    if (!isCurrent()) return []
    if (!nodeResult.success) {
      selectionError.value = nodeResult.error.message
      return []
    }

    const hiddenRootId = options.treeRootNodeId.value
    const ancestors = ancestorsResult.data.filter(node => node.id !== hiddenRootId)
    const selectedNode = nodeResult.data.nodes.find(node => node.id === nodeId)
    if (!selectedNode) {
      selectionError.value = 'Узел не найден.'
      return []
    }
    const rows = [...ancestors, selectedNode]
    if (!options.mergeNodes(rows, guard)) return []
    return rows.map(node => node.id)
  }

  const selectHit = async (
    hit: ModelSearchHit,
    externalGuard: () => boolean = () => true
  ): Promise<LazyTreeSearchSelection> => {
    if (!isTreeSearchHit(hit)) {
      return { nodePath: [], diagramId: null }
    }

    selectionController?.abort()
    const requestController = new AbortController()
    selectionController = requestController
    const requestSequence = ++selectionSequence
    lastSelectedHit = hit
    const modelId = options.modelId.value
    const guard = options.beginRequest()
    if (!modelId) return { nodePath: [], diagramId: null }
    selectionLoading.value = true
    selectionError.value = null

    try {
      if (hit.kind === 'node') {
        const nodePath = await materializeNodePath(
          hit.id,
          requestController,
          requestSequence,
          modelId,
          guard,
          externalGuard
        )
        return { nodePath, diagramId: null }
      }

      const parentId = hit.parentId
      if (!parentId) {
        return { nodePath: [], diagramId: hit.id }
      }

      const nodePath = await materializeNodePath(
        parentId,
        requestController,
        requestSequence,
        modelId,
        guard,
        externalGuard
      )
      if (nodePath.length === 0) {
        return { nodePath: [], diagramId: null }
      }
      return { nodePath, diagramId: hit.id }
    } catch (cause) {
      if (
        !requestController.signal.aborted &&
        requestSequence === selectionSequence &&
        options.modelId.value === modelId &&
        options.isRequestCurrent(guard) &&
        externalGuard()
      ) {
        selectionError.value = errorMessage(cause)
      }
      return { nodePath: [], diagramId: null }
    } finally {
      if (requestSequence === selectionSequence) {
        selectionLoading.value = false
        if (selectionController === requestController) selectionController = null
      }
    }
  }

  const retrySelection = (): Promise<LazyTreeSearchSelection> =>
    lastSelectedHit ? selectHit(lastSelectedHit) : Promise.resolve({ nodePath: [], diagramId: null })

  const cancel = (): void => {
    cancelSearch()
    cancelSelection(true)
  }

  watch(
    [options.query, options.modelId],
    () => {
      cancelSearch()
      cancelSelection(true)
      error.value = null
      hits.value = []
      const query = options.query.value.trim()
      if (!query || !options.modelId.value) {
        return
      }
      timer = setTimeout(() => {
        timer = null
        void runSearch()
      }, SEARCH_DEBOUNCE_MS)
    },
    { immediate: true }
  )

  onScopeDispose(() => {
    cancelSearch()
    cancelSelection(true)
  })

  return {
    hits,
    loading,
    error,
    selectionLoading,
    selectionError,
    retry,
    selectHit,
    retrySelection,
    cancel,
  }
}
