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

const SEARCH_DEBOUNCE_MS = 200
const SEARCH_LIMIT = 50

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Не удалось выполнить поиск.'

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
  let lastSelectedNodeId: string | null = null

  const cancelSearch = (): void => {
    if (timer) clearTimeout(timer)
    timer = null
    controller?.abort()
    controller = null
    sequence += 1
    loading.value = false
  }

  const cancelSelection = (): void => {
    selectionController?.abort()
    selectionController = null
    selectionSequence += 1
    selectionLoading.value = false
    selectionError.value = null
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
      hits.value = result.data.hits.filter(hit => hit.kind === 'node')
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

  const selectHit = async (nodeId: string): Promise<string[]> => {
    selectionController?.abort()
    const requestController = new AbortController()
    selectionController = requestController
    const requestSequence = ++selectionSequence
    lastSelectedNodeId = nodeId
    const modelId = options.modelId.value
    const guard = options.beginRequest()
    if (!modelId) return []
    selectionLoading.value = true
    selectionError.value = null
    const isCurrent = (): boolean =>
      !requestController.signal.aborted &&
      requestSequence === selectionSequence &&
      options.modelId.value === modelId &&
      options.isRequestCurrent(guard)

    try {
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
    } catch (cause) {
      if (isCurrent()) selectionError.value = errorMessage(cause)
      return []
    } finally {
      if (requestSequence === selectionSequence) {
        selectionLoading.value = false
        if (selectionController === requestController) selectionController = null
      }
    }
  }

  const retrySelection = (): Promise<string[]> =>
    lastSelectedNodeId ? selectHit(lastSelectedNodeId) : Promise.resolve([])

  watch(
    [options.query, options.modelId],
    ([, modelId], [, previousModelId]) => {
      cancelSearch()
      if (previousModelId !== undefined && modelId !== previousModelId) cancelSelection()
      error.value = null
      const query = options.query.value.trim()
      if (!query || !options.modelId.value) {
        hits.value = []
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
    cancelSelection()
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
  }
}
