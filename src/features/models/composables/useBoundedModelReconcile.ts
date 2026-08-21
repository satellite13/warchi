import { PAGE_SIZE_MODEL_DIAGRAMS, pagedListParams } from '@/api/queryHelpers'
import { apiFetch, type ApiResult } from '@/composables/useApi'
import type { DiagramResponse } from '@/types/api'
import type { ModelData, PaginatedResponse } from '@/types/entities'
import {
  paginatedContent,
  paginatedIsLastPage,
} from '@/utils/paginatedResponse'
import type { EditorDiagram, TreeParentScope } from '../types'
import {
  mergeEntityListFromRemote,
} from '../utils/modelEntityMerge'
import type { ModelLiveSyncPullReason } from '../utils/modelLiveSyncTelemetry'
import { toEditorDiagramPreservingLocalAttrs } from './modelEditorMappers'

export type BoundedModelReconcileFetchers = {
  fetchModel: (modelId: string, signal: AbortSignal) => Promise<ApiResult<ModelData>>
  fetchSlimDiagrams: (
    modelId: string,
    signal: AbortSignal
  ) => Promise<ApiResult<DiagramResponse[]>>
}

export type BoundedModelReconcile = {
  request: (reason: ModelLiveSyncPullReason) => void
  flush: () => Promise<void>
  invalidate: () => void
  dispose: () => void
}

type BoundedModelReconcileOptions = {
  modelId: () => string | null | undefined
  model: () => ModelData | null
  replaceModel: (model: ModelData) => void
  modelDirty: () => boolean
  diagrams: () => EditorDiagram[]
  replaceDiagrams: (diagrams: EditorDiagram[]) => void
  materializedScopes: () => TreeParentScope[]
  refreshVisibleChildrenScope: (scope: TreeParentScope) => Promise<void>
  openDiagramId?: () => string | null | undefined
  reloadOpenDiagramScope?: (diagramId: string, signal: AbortSignal) => Promise<void>
  fetchers?: BoundedModelReconcileFetchers
  onDetachedSnapshotInvalidated?: () => void
  onError?: (
    reason: ModelLiveSyncPullReason,
    error: unknown,
    retry: () => void
  ) => void
  onRecovered?: (reason: ModelLiveSyncPullReason) => void
  onModelUnavailable?: (status: number) => void
}

const errorResult = <T>(error: unknown): ApiResult<T> => ({
  success: false,
  error: {
    status: 0,
    message: error instanceof Error ? error.message : String(error),
  },
})

const defaultFetchers: BoundedModelReconcileFetchers = {
  fetchModel: (modelId, signal) =>
    apiFetch<ModelData>(`/models/${encodeURIComponent(modelId)}`, {
      method: 'GET',
      signal,
    }),
  fetchSlimDiagrams: async (modelId, signal) => {
    const diagrams: DiagramResponse[] = []
    try {
      for (let page = 0; ; page += 1) {
        const query = pagedListParams(page, PAGE_SIZE_MODEL_DIAGRAMS)
        query.set('modelId', modelId)
        query.set('includeAttrs', 'false')
        const result = await apiFetch<PaginatedResponse<DiagramResponse>>(
          `/diagrams?${query.toString()}`,
          { method: 'GET', signal }
        )
        if (!result.success) return result
        diagrams.push(...paginatedContent(result.data))
        if (paginatedIsLastPage(result.data, page)) return { success: true, data: diagrams }
      }
    } catch (error) {
      return errorResult(error)
    }
  },
}

const revision = (value: ModelData | null): string | null => value?.updatedAt ?? null

export function createBoundedModelReconcile(
  options: BoundedModelReconcileOptions
): BoundedModelReconcile {
  const fetchers = options.fetchers ?? defaultFetchers
  let generation = 0
  let controller: AbortController | null = null
  let scheduled: Promise<void> | null = null
  let pendingReason: ModelLiveSyncPullReason | null = null
  let lastObservedModelId: string | null = null
  let lastObservedRevision: string | null = null
  let disposed = false
  let hasReportedError = false

  const isCurrent = (
    requestGeneration: number,
    requestModelId: string,
    requestController: AbortController
  ): boolean =>
    !disposed &&
    generation === requestGeneration &&
    options.modelId() === requestModelId &&
    controller === requestController &&
    !requestController.signal.aborted

  const replaceModelMetadata = (remote: ModelData): void => {
    const local = options.model()
    if (!local || options.modelDirty()) return
    if (local.id !== remote.id) {
      options.replaceModel(remote)
      return
    }
    options.replaceModel({
      ...local,
      name: remote.name,
      version: remote.version,
      ownerId: remote.ownerId,
      attrs: remote.attrs,
      sourceId: remote.sourceId,
      accessPermission: remote.accessPermission,
      createdAt: remote.createdAt,
      updatedAt: remote.updatedAt,
    })
  }

  const mergeSlimDiagrams = (
    remoteRows: DiagramResponse[],
    openDiagramId: string | null
  ): void => {
    const previous = options.diagrams()
    const merged = mergeEntityListFromRemote(
      previous,
      remoteRows,
      row => toEditorDiagramPreservingLocalAttrs(row, previous)
    ).items
    options.replaceDiagrams(
      merged.map(row =>
        row.id === openDiagramId && !row._isDirty && !row._isNew && !row._isDeleted
          ? { ...row, _attrsPending: true }
          : row
      )
    )
  }

  const runOnce = async (reason: ModelLiveSyncPullReason): Promise<void> => {
    const modelId = options.modelId()
    if (!modelId || typeof modelId !== 'string') return
    const requestGeneration = generation
    const requestController = new AbortController()
    controller = requestController

    if (lastObservedModelId !== modelId) {
      lastObservedModelId = modelId
      lastObservedRevision = revision(options.model())
    }
    const baselineRevision = lastObservedRevision

    try {
      const modelResult = await fetchers.fetchModel(modelId, requestController.signal)
      if (!isCurrent(requestGeneration, modelId, requestController)) return
      if (!modelResult.success) {
        if (modelResult.error.cancelled) return
        if (modelResult.error.status === 403 || modelResult.error.status === 404) {
          options.onModelUnavailable?.(modelResult.error.status)
          return
        }
        throw new Error(modelResult.error.message)
      }

      const remoteRevision = revision(modelResult.data)
      if (remoteRevision === baselineRevision) return

      const diagramsResult = await fetchers.fetchSlimDiagrams(modelId, requestController.signal)
      if (!isCurrent(requestGeneration, modelId, requestController)) return
      if (!diagramsResult.success) {
        if (diagramsResult.error.cancelled) return
        throw new Error(diagramsResult.error.message)
      }

      const openDiagramId = options.openDiagramId?.() ?? null
      mergeSlimDiagrams(diagramsResult.data, openDiagramId)

      const refreshes = options
        .materializedScopes()
        .map(scope => options.refreshVisibleChildrenScope(scope))
      const refreshResults = await Promise.allSettled(refreshes)
      if (!isCurrent(requestGeneration, modelId, requestController)) return
      const failedRefresh = refreshResults.find(
        (result): result is PromiseRejectedResult => result.status === 'rejected'
      )
      if (failedRefresh) throw failedRefresh.reason

      if (openDiagramId && options.reloadOpenDiagramScope) {
        await options.reloadOpenDiagramScope(openDiagramId, requestController.signal)
        if (!isCurrent(requestGeneration, modelId, requestController)) return
      }

      lastObservedRevision = remoteRevision
      replaceModelMetadata(modelResult.data)
      options.onDetachedSnapshotInvalidated?.()
      if (hasReportedError) {
        hasReportedError = false
        options.onRecovered?.(reason)
      }
    } catch (error) {
      if (!isCurrent(requestGeneration, modelId, requestController)) return
      hasReportedError = true
      options.onError?.(reason, error, () => request(reason))
    }
  }

  const drain = async (firstReason: ModelLiveSyncPullReason): Promise<void> => {
    let reason: ModelLiveSyncPullReason | null = firstReason
    while (reason && !disposed) {
      pendingReason = null
      await runOnce(reason)
      reason = pendingReason
    }
  }

  const request = (reason: ModelLiveSyncPullReason): void => {
    if (disposed) return
    if (scheduled) {
      pendingReason = reason
      return
    }
    scheduled = drain(reason).finally(() => {
      scheduled = null
      controller = null
      if (pendingReason && !disposed) {
        const followUp = pendingReason
        pendingReason = null
        request(followUp)
      }
    })
  }

  const invalidate = (): void => {
    generation += 1
    controller?.abort()
    pendingReason = null
    lastObservedModelId = null
    lastObservedRevision = null
    hasReportedError = false
  }

  const dispose = (): void => {
    disposed = true
    invalidate()
  }

  return {
    request,
    flush: async () => {
      while (scheduled) await scheduled
    },
    invalidate,
    dispose,
  }
}
