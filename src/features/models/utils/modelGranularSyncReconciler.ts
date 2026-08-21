import { apiFetch, type ApiResult } from '@/composables/useApi'
import type { DiagramResponse, LinkResponse, NodeResponse } from '@/types/api'
import type { ModelData } from '@/types/entities'
import type { EditorDiagram, ModelPartialRequestGuard, TreeParentScope } from '../types'
import { toEditorDiagram, toEditorLink, toEditorNode } from '../composables/modelEditorMappers'
import { ModelPartialStore } from './modelPartialStore'
import {
  reduceModelSyncGranularEvent,
  type GranularSyncEventPayload,
} from './modelSyncGranularCoalesce'

type GranularEntity = 'model' | 'node' | 'link' | 'diagram'
type GranularAction = 'created' | 'updated' | 'deleted'
const POINT_OPERATION_CONCURRENCY = 4
const POINT_RETRY_DELAY_MS = 100

export type ModelGranularSyncFetchers = {
  fetchNode: (id: string, signal: AbortSignal) => Promise<ApiResult<NodeResponse>>
  fetchLink: (id: string, signal: AbortSignal) => Promise<ApiResult<LinkResponse>>
  fetchDiagram: (id: string, signal: AbortSignal) => Promise<ApiResult<DiagramResponse>>
  fetchModel: (id: string, signal: AbortSignal) => Promise<ApiResult<ModelData>>
}

export type ModelGranularSyncReconciler = {
  enqueue: (events: readonly GranularSyncEventPayload[]) => void
  flush: () => Promise<void>
  invalidate: () => void
  dispose: () => void
}

type ReconcilerOptions = {
  modelId: () => string | null | undefined
  model: () => ModelData | null
  replaceModel: (model: ModelData) => void
  modelDirty: () => boolean
  store: ModelPartialStore
  diagrams: () => EditorDiagram[]
  openDiagramId?: () => string | null | undefined
  replaceDiagrams: (rows: EditorDiagram[]) => void
  publishMaterializedRows: () => void
  refreshVisibleChildrenScope: (scope: TreeParentScope) => Promise<void>
  invalidateChildrenScope?: (scope: TreeParentScope) => void
  fetchers?: ModelGranularSyncFetchers
  onDetachedSnapshotInvalidated?: () => void
  onUnknownEvent?: (event: GranularSyncEventPayload) => void
  onError?: (
    event: GranularSyncEventPayload,
    error: unknown,
    retry: () => void
  ) => void
  onRecovered?: (event: GranularSyncEventPayload) => void
  onModelRevisionApplied?: (revision: number | undefined) => void
}

const isProtectedLocal = (
  row: { _isNew?: boolean; _isDirty?: boolean; _isDeleted?: boolean } | undefined
): boolean => row?._isNew === true || row?._isDirty === true || row?._isDeleted === true

const eventKey = (event: GranularSyncEventPayload): string => `${event.entity}:${event.id}`

const parseOperation = (
  event: GranularSyncEventPayload
): { entity: GranularEntity; action: GranularAction } | null => {
  if (
    event.entity !== 'model' &&
    event.entity !== 'node' &&
    event.entity !== 'link' &&
    event.entity !== 'diagram'
  ) {
    return null
  }
  const prefix = `${event.entity}_`
  if (!event.type.startsWith(prefix)) return null
  const action = event.type.slice(prefix.length)
  if (action !== 'created' && action !== 'updated' && action !== 'deleted') return null
  if (event.entity === 'model' && action !== 'updated') return null
  return { entity: event.entity, action }
}

const defaultFetchers: ModelGranularSyncFetchers = {
  fetchNode: (id, signal) =>
    apiFetch<NodeResponse>(`/nodes/${encodeURIComponent(id)}`, { method: 'GET', signal }),
  fetchLink: (id, signal) =>
    apiFetch<LinkResponse>(`/links/${encodeURIComponent(id)}`, { method: 'GET', signal }),
  fetchDiagram: (id, signal) =>
    apiFetch<DiagramResponse>(`/diagrams/${encodeURIComponent(id)}`, { method: 'GET', signal }),
  fetchModel: (id, signal) =>
    apiFetch<ModelData>(`/models/${encodeURIComponent(id)}`, { method: 'GET', signal }),
}

export function createModelGranularSyncReconciler(
  options: ReconcilerOptions
): ModelGranularSyncReconciler {
  const fetchers = options.fetchers ?? defaultFetchers
  const pending = new Map<string, GranularSyncEventPayload>()
  const activeEvents = new Map<string, GranularSyncEventPayload>()
  const controllers = new Map<string, AbortController>()
  const remoteDeletedDiagramIds = new Set<string>()
  let scheduled: Promise<void> | null = null
  let disposed = false

  const waitForPointRetry = (signal: AbortSignal): Promise<void> =>
    new Promise(resolve => {
      if (signal.aborted) {
        resolve()
        return
      }
      const timer = setTimeout(done, POINT_RETRY_DELAY_MS)
      function done(): void {
        clearTimeout(timer)
        signal.removeEventListener('abort', done)
        resolve()
      }
      signal.addEventListener('abort', done, { once: true })
    })

  const invalidateKnownScope = (scope: TreeParentScope | null): void => {
    if (scope && options.store.isChildrenScopeKnown(scope)) {
      if (options.invalidateChildrenScope) options.invalidateChildrenScope(scope)
      else options.store.invalidateChildrenScope(scope)
    }
  }

  const beginPointRequest = (
    event: GranularSyncEventPayload
  ): {
    controller: AbortController
    generation: number
    guard: ModelPartialRequestGuard
    modelId: string | null | undefined
  } => {
    const key = eventKey(event)
    controllers.get(key)?.abort()
    const controller = new AbortController()
    controllers.set(key, controller)
    return {
      controller,
      generation: options.store.generation,
      guard: options.store.beginRequest(`granular:${key}`),
      modelId: options.modelId(),
    }
  }

  const isPointRequestCurrent = (
    event: GranularSyncEventPayload,
    request: ReturnType<typeof beginPointRequest>
  ): boolean =>
    !disposed &&
    !request.controller.signal.aborted &&
    options.modelId() === request.modelId &&
    options.store.generation === request.generation &&
    options.store.isRequestCurrent(request.guard) &&
    controllers.get(eventKey(event)) === request.controller

  const finishPointRequest = (
    event: GranularSyncEventPayload,
    request: ReturnType<typeof beginPointRequest>
  ): void => {
    if (controllers.get(eventKey(event)) === request.controller) {
      controllers.delete(eventKey(event))
    }
  }

  const reportPointError = (event: GranularSyncEventPayload, error: unknown): void => {
    if (event.entity === 'node') {
      invalidateKnownScope(options.store.treeScopeForNode(event.id))
    } else if (event.entity === 'link') {
      options.store.markLinkStale(event.id)
    } else if (event.entity === 'diagram') {
      options.replaceDiagrams(
        options.diagrams().map(row =>
          row.id === event.id ? { ...row, _attrsPending: true } : row
        )
      )
    }
    options.onError?.(event, error, () => enqueue([event]))
  }

  const clearPointError = (event: GranularSyncEventPayload): void => {
    if (event.entity === 'link') options.store.clearLinkStale(event.id)
    options.onRecovered?.(event)
  }

  const fetchPoint = async <T>(
    event: GranularSyncEventPayload,
    request: ReturnType<typeof beginPointRequest>,
    fetch: (signal: AbortSignal) => Promise<ApiResult<T>>
  ): Promise<ApiResult<T> | null> => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const result = await fetch(request.controller.signal)
        if (!isPointRequestCurrent(event, request)) return null
        if (result.success || result.error.status === 404 || result.error.cancelled) {
          return result
        }
        const transient =
          result.error.status === 0 ||
          result.error.status === 408 ||
          result.error.status === 429 ||
          result.error.status >= 500
        if (attempt === 0 && transient) {
          await waitForPointRetry(request.controller.signal)
          if (!isPointRequestCurrent(event, request)) return null
          continue
        }
        reportPointError(event, new Error(result.error.message))
        return result
      } catch (error) {
        if (!isPointRequestCurrent(event, request)) return null
        if (attempt === 0) {
          await waitForPointRetry(request.controller.signal)
          if (!isPointRequestCurrent(event, request)) return null
          continue
        }
        reportPointError(event, error)
        return null
      }
    }
    return null
  }

  const invalidatePointRequest = (event: GranularSyncEventPayload): void => {
    const key = eventKey(event)
    controllers.get(key)?.abort()
    controllers.delete(key)
    options.store.beginRequest(`granular:${key}`)
  }

  const handleNodeDelete = (event: GranularSyncEventPayload): void => {
    invalidatePointRequest(event)
    const scope = options.store.treeScopeForNode(event.id)
    options.store.deleteRemoteIncidentLinks(event.id)
    options.store.deleteRemoteNode(event.id)
    options.publishMaterializedRows()
    invalidateKnownScope(scope)
    clearPointError(event)
  }

  const handleLinkDelete = (event: GranularSyncEventPayload): void => {
    invalidatePointRequest(event)
    options.store.deleteRemoteLink(event.id)
    options.publishMaterializedRows()
    clearPointError(event)
  }

  const handleDiagramDelete = (event: GranularSyncEventPayload): void => {
    invalidatePointRequest(event)
    remoteDeletedDiagramIds.add(event.id)
    const local = options.diagrams().find(row => row.id === event.id)
    if (!isProtectedLocal(local)) {
      options.replaceDiagrams(options.diagrams().filter(row => row.id !== event.id))
    }
    clearPointError(event)
  }

  const handleNodeUpdate = async (event: GranularSyncEventPayload): Promise<void> => {
    const local = options.store.nodeById.get(event.id)
    if (!local || isProtectedLocal(local)) return
    const oldScope = options.store.treeScopeForNode(event.id)
    const request = beginPointRequest(event)
    try {
      const result = await fetchPoint(event, request, signal =>
        fetchers.fetchNode(event.id, signal)
      )
      if (!result) return
      if (!result.success) {
        if (result.error.status === 404) handleNodeDelete(event)
        return
      }
      if (options.store.remoteDeletedNodeIds.has(event.id)) return
      options.store.mergeNodes(
        [toEditorNode(result.data)],
        { kind: 'partial' },
        request.guard
      )
      options.publishMaterializedRows()
      clearPointError(event)
      invalidateKnownScope(oldScope)
      invalidateKnownScope(options.store.treeScopeForNode(event.id))
    } finally {
      finishPointRequest(event, request)
    }
  }

  const handleLinkUpdate = async (event: GranularSyncEventPayload): Promise<void> => {
    const local = options.store.linkById.get(event.id)
    if (!local || isProtectedLocal(local)) return
    const request = beginPointRequest(event)
    try {
      const result = await fetchPoint(event, request, signal =>
        fetchers.fetchLink(event.id, signal)
      )
      if (!result) return
      if (!result.success) {
        if (result.error.status === 404) handleLinkDelete(event)
        return
      }
      if (options.store.remoteDeletedLinkIds.has(event.id)) return
      options.store.mergeLinks(
        [toEditorLink(result.data)],
        { kind: 'partial' },
        request.guard
      )
      options.publishMaterializedRows()
      clearPointError(event)
    } finally {
      finishPointRequest(event, request)
    }
  }

  const handleNodeCreate = async (event: GranularSyncEventPayload): Promise<void> => {
    const wasMaterialized = options.store.nodeById.has(event.id)
    const oldScope = wasMaterialized ? options.store.treeScopeForNode(event.id) : null
    options.store.clearRemoteNodeTombstone(event.id)
    const request = beginPointRequest(event)
    try {
      const result = await fetchPoint(event, request, signal =>
        fetchers.fetchNode(event.id, signal)
      )
      if (!result) return
      if (!result.success) {
        if (result.error.status === 404) handleNodeDelete(event)
        return
      }
      if (wasMaterialized) {
        options.store.mergeNodes(
          [toEditorNode(result.data)],
          { kind: 'partial' },
          request.guard
        )
        options.publishMaterializedRows()
      }
      clearPointError(event)
      const scope = options.store.treeScopeForParentNodeId(result.data.parentNodeId)
      if (oldScope && options.store.scopeKey(oldScope) !== options.store.scopeKey(scope)) {
        invalidateKnownScope(oldScope)
      }
      if (options.store.isChildrenScopeLoaded(scope)) {
        await options.refreshVisibleChildrenScope(scope)
      } else {
        invalidateKnownScope(scope)
      }
    } finally {
      finishPointRequest(event, request)
    }
  }

  const handleLinkCreate = async (event: GranularSyncEventPayload): Promise<void> => {
    if (!options.store.linkById.has(event.id)) return
    options.store.clearRemoteLinkTombstone(event.id)
    const request = beginPointRequest(event)
    try {
      const result = await fetchPoint(event, request, signal =>
        fetchers.fetchLink(event.id, signal)
      )
      if (!result) return
      if (!result.success) {
        if (result.error.status === 404) handleLinkDelete(event)
        return
      }
      options.store.mergeLinks(
        [toEditorLink(result.data)],
        { kind: 'partial' },
        request.guard
      )
      options.publishMaterializedRows()
      clearPointError(event)
    } finally {
      finishPointRequest(event, request)
    }
  }

  const handleModelUpdate = async (event: GranularSyncEventPayload): Promise<void> => {
    const modelId = options.modelId()
    const local = options.model()
    if (!modelId || !local || event.id !== modelId) return
    const request = beginPointRequest(event)
    try {
      const result = await fetchPoint(event, request, signal =>
        fetchers.fetchModel(modelId, signal)
      )
      if (!result?.success) return
      options.onModelRevisionApplied?.(event.revision)
      options.replaceModel(
        options.modelDirty()
          ? {
              ...result.data,
              name: local.name,
              version: local.version,
              attrs: local.attrs,
            }
          : result.data
      )
      clearPointError(event)
    } finally {
      finishPointRequest(event, request)
    }
  }

  const mergeDiagramMetadata = (
    local: EditorDiagram,
    remote: DiagramResponse
  ): EditorDiagram => {
    const preserveHydratedAttrs = options.openDiagramId?.() === local.id
    const mapped = toEditorDiagram(
      { ...remote, attrs: null },
      { attrsPending: preserveHydratedAttrs ? local._attrsPending : true }
    )
    return {
      ...mapped,
      parsedAttrs: preserveHydratedAttrs ? local.parsedAttrs : mapped.parsedAttrs,
      _attrsPending: preserveHydratedAttrs ? local._attrsPending : true,
      _isNew: local._isNew,
      _isDirty: local._isDirty,
      _isDeleted: local._isDeleted,
    }
  }

  const handleDiagramPoint = async (
    event: GranularSyncEventPayload,
    action: 'created' | 'updated'
  ): Promise<void> => {
    const local = options.diagrams().find(row => row.id === event.id)
    if (action === 'updated' && (!local || isProtectedLocal(local))) return
    if (action === 'created' && local && isProtectedLocal(local)) return
    remoteDeletedDiagramIds.delete(event.id)
    const request = beginPointRequest(event)
    try {
      const result = await fetchPoint(event, request, signal =>
        fetchers.fetchDiagram(event.id, signal)
      )
      if (!result) return
      if (!result.success) {
        if (result.error.status === 404) handleDiagramDelete(event)
        return
      }
      if (remoteDeletedDiagramIds.has(event.id)) return
      const currentRows = options.diagrams()
      const currentIndex = currentRows.findIndex(row => row.id === event.id)
      if (currentIndex < 0) {
        if (action === 'created') {
          options.replaceDiagrams([
            ...currentRows,
            toEditorDiagram({ ...result.data, attrs: null }, { attrsPending: true }),
          ])
        }
        clearPointError(event)
        return
      }
      const current = currentRows[currentIndex]
      if (!current || isProtectedLocal(current)) return
      const next = [...currentRows]
      next[currentIndex] = mergeDiagramMetadata(current, result.data)
      options.replaceDiagrams(next)
      clearPointError(event)
    } finally {
      finishPointRequest(event, request)
    }
  }

  const handleUnknown = (event: GranularSyncEventPayload): void => {
    if (event.entity === 'node') {
      invalidateKnownScope(options.store.treeScopeForNode(event.id))
    }
    options.onUnknownEvent?.(event)
  }

  const applyEvent = async (event: GranularSyncEventPayload): Promise<void> => {
    const operation = parseOperation(event)
    if (!operation) {
      handleUnknown(event)
      return
    }
    if (operation.action === 'deleted') {
      if (operation.entity === 'node') handleNodeDelete(event)
      if (operation.entity === 'link') handleLinkDelete(event)
      if (operation.entity === 'diagram') handleDiagramDelete(event)
      return
    }
    if (operation.entity === 'model') {
      await handleModelUpdate(event)
      return
    }
    if (operation.entity === 'node') {
      if (operation.action === 'created') await handleNodeCreate(event)
      else await handleNodeUpdate(event)
      return
    }
    if (operation.entity === 'link') {
      if (operation.action === 'created') await handleLinkCreate(event)
      else await handleLinkUpdate(event)
      return
    }
    await handleDiagramPoint(event, operation.action)
  }

  const drain = async (): Promise<void> => {
    while (!disposed && pending.size > 0) {
      const batch = [...pending.values()]
      pending.clear()
      if (
        batch.some(
          event =>
            event.entity === 'link' ||
            (event.entity === 'node' && event.type === 'node_deleted')
        )
      ) {
        options.onDetachedSnapshotInvalidated?.()
      }
      const results: PromiseSettledResult<void>[] = new Array(batch.length)
      let nextIndex = 0
      const workers = Array.from(
        { length: Math.min(POINT_OPERATION_CONCURRENCY, batch.length) },
        async () => {
          while (nextIndex < batch.length) {
            const index = nextIndex
            nextIndex += 1
            const event = batch[index]!
            const key = eventKey(event)
            activeEvents.set(key, event)
            try {
              await applyEvent(event)
              results[index] = { status: 'fulfilled', value: undefined }
            } catch (reason) {
              results[index] = { status: 'rejected', reason }
            } finally {
              if (activeEvents.get(key) === event) activeEvents.delete(key)
            }
          }
        }
      )
      await Promise.all(workers)
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          const event = batch[index]
          if (event) reportPointError(event, result.reason)
        }
      })
    }
  }

  const scheduleDrain = (): void => {
    if (scheduled || disposed) return
    scheduled = new Promise(resolve => {
      queueMicrotask(() => {
        void drain().finally(() => {
          scheduled = null
          resolve()
          if (pending.size > 0) scheduleDrain()
        })
      })
    })
  }

  const enqueue = (events: readonly GranularSyncEventPayload[]): void => {
    if (disposed) return
    for (const event of events) {
      const key = eventKey(event)
      const active = activeEvents.get(key)
      const previous = pending.get(key) ?? active
      pending.set(key, previous ? reduceModelSyncGranularEvent(previous, event) : event)
      if (active && pending.get(key)?.type.endsWith('_deleted')) {
        controllers.get(key)?.abort()
      }
    }
    if (pending.size > 0) scheduleDrain()
  }

  const invalidate = (): void => {
    pending.clear()
    for (const controller of controllers.values()) controller.abort()
    controllers.clear()
  }

  return {
    enqueue,
    flush: async () => {
      while (scheduled) await scheduled
    },
    invalidate,
    dispose: () => {
      disposed = true
      invalidate()
    },
  }
}
