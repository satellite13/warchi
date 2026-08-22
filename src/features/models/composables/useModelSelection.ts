import { computed, onScopeDispose, ref, watch, type Ref } from 'vue'
import type { NodeResponse } from '@/types/api'
import type { ModelEditorState, ModelPartialRequestGuard } from '../types'
import { resolveModelNodes } from './modelScopedApi'

export function useModelSelection(options: {
  state: Ref<ModelEditorState>
  mergeNodes?: (nodes: readonly NodeResponse[], guard: ModelPartialRequestGuard) => boolean
  beginRequest?: () => ModelPartialRequestGuard
  isRequestCurrent?: (guard: ModelPartialRequestGuard) => boolean
}) {
  const selectedNodeId = ref<string | null>(null)
  const selectedDiagramId = ref<string | null>(null)
  const selectedModelNodeIds = ref<string[]>([])
  const selectedInstanceIds = ref<string[]>([])
  const selectedModelLinkId = ref<string | null>(null)
  const selectedEdgeInstanceId = ref<string | null>(null)
  const selectedCanvasElementId = ref<string | null>(null)
  const selectedNodeLoading = ref(false)
  const selectedNodeError = ref<string | null>(null)
  let materializeController: AbortController | null = null
  let materializeSequence = 0

  const selectedTreeNode = computed(() =>
    selectedNodeId.value
      ? (options.state.value.nodes.find(node => node.id === selectedNodeId.value && !node._isDeleted) ?? null)
      : null
  )
  const selectedDiagramNode = computed(() =>
    selectedModelNodeIds.value.length === 1
      ? (options.state.value.nodes.find(
          node => node.id === selectedModelNodeIds.value[0] && !node._isDeleted
        ) ?? null)
      : null
  )
  const selectedNode = computed(() => selectedDiagramNode.value ?? selectedTreeNode.value)

  const cancelNodeMaterialization = (): void => {
    materializeController?.abort()
    materializeController = null
    materializeSequence += 1
    selectedNodeLoading.value = false
  }

  const ensureNodeMaterialized = async (id: string): Promise<boolean> => {
    const existing = options.state.value.nodes.find(node => node.id === id && !node._isDeleted)
    if (existing) {
      selectedNodeError.value = null
      return true
    }
    const modelId = options.state.value.modelId
    if (
      !modelId ||
      !options.mergeNodes ||
      !options.beginRequest ||
      !options.isRequestCurrent
    ) {
      return false
    }

    cancelNodeMaterialization()
    const controller = new AbortController()
    materializeController = controller
    const sequence = materializeSequence
    const guard = options.beginRequest()
    selectedNodeLoading.value = true
    selectedNodeError.value = null
    try {
      const result = await resolveModelNodes(modelId, [id], controller.signal)
      if (
        controller.signal.aborted ||
        sequence !== materializeSequence ||
        options.state.value.modelId !== modelId ||
        !options.isRequestCurrent(guard)
      ) {
        return false
      }
      if (!result.success) {
        selectedNodeError.value = result.error.message
        return false
      }
      const resolved = result.data.nodes.find(node => node.id === id)
      if (!resolved) {
        selectedNodeError.value = 'Узел не найден.'
        return false
      }
      return options.mergeNodes([resolved], guard)
    } catch (error) {
      if (!controller.signal.aborted && sequence === materializeSequence) {
        selectedNodeError.value =
          error instanceof Error ? error.message : 'Не удалось загрузить выбранный узел.'
      }
      return false
    } finally {
      if (sequence === materializeSequence) {
        selectedNodeLoading.value = false
        if (materializeController === controller) materializeController = null
      }
    }
  }

  const fallbackSelectedNodeId = computed<string | null>(() => {
    if (selectedModelNodeIds.value.length === 1) return selectedModelNodeIds.value[0] ?? null
    if (selectedModelNodeIds.value.length > 1) return null
    return selectedNodeId.value
  })

  const retrySelectedNode = (): Promise<boolean> => {
    const id = fallbackSelectedNodeId.value
    return id ? ensureNodeMaterialized(id) : Promise.resolve(false)
  }

  watch(
    [fallbackSelectedNodeId, () => options.state.value.modelId],
    ([id]) => {
      cancelNodeMaterialization()
      selectedNodeError.value = null
      if (id && !options.state.value.nodes.some(node => node.id === id && !node._isDeleted)) {
        void ensureNodeMaterialized(id)
      }
    }
  )

  onScopeDispose(cancelNodeMaterialization)

  const selectedLink = computed(() =>
    selectedModelLinkId.value
      ? (options.state.value.links.find(link => link.id === selectedModelLinkId.value && !link._isDeleted) ??
        null)
      : null
  )

  const selectedNodeInstanceId = computed<string | null>(() => {
    const selectedElementId = selectedCanvasElementId.value
    if (selectedElementId?.startsWith('instance-')) {
      return selectedElementId.slice('instance-'.length)
    }
    if (selectedInstanceIds.value.length === 1) {
      return selectedInstanceIds.value[0] ?? null
    }
    const diagram = selectedDiagramId.value
      ? (options.state.value.diagrams.find(
          item => item.id === selectedDiagramId.value && !item._isDeleted
        ) ?? null)
      : null
    const modelNodeId = selectedNode.value?.id
    if (!diagram || !modelNodeId) return null
    return diagram.parsedAttrs.instances.nodes.find(item => item.modelNodeId === modelNodeId)?.id ?? null
  })

  const selectedLinkEdgeInstanceId = computed<string | null>(() => {
    if (selectedEdgeInstanceId.value) return selectedEdgeInstanceId.value
    const selectedElementId = selectedCanvasElementId.value
    if (selectedElementId?.startsWith('edge-')) {
      return selectedElementId.slice('edge-'.length)
    }
    return null
  })

  function clearDiagramSelection(): void {
    selectedModelNodeIds.value = []
    selectedInstanceIds.value = []
    selectedModelLinkId.value = null
    selectedEdgeInstanceId.value = null
  }

  function clearCanvasSelection(): void {
    clearDiagramSelection()
    selectedCanvasElementId.value = null
  }

  function applyDiagramSelection(diagramId: string): void {
    selectedDiagramId.value = diagramId
    clearDiagramSelection()
  }

  return {
    selectedNodeId,
    selectedDiagramId,
    selectedModelNodeIds,
    selectedInstanceIds,
    selectedModelLinkId,
    selectedEdgeInstanceId,
    selectedCanvasElementId,
    selectedTreeNode,
    selectedDiagramNode,
    selectedNode,
    selectedLink,
    selectedNodeInstanceId,
    selectedLinkEdgeInstanceId,
    selectedNodeLoading,
    selectedNodeError,
    ensureNodeMaterialized,
    retrySelectedNode,
    clearDiagramSelection,
    clearCanvasSelection,
    applyDiagramSelection,
  }
}
