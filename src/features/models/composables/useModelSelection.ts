import { computed, ref, type Ref } from 'vue'
import type { ModelEditorState } from '../types'

export function useModelSelection(options: {
  state: Ref<ModelEditorState>
}) {
  const selectedNodeId = ref<string | null>(null)
  const selectedDiagramId = ref<string | null>(null)
  const selectedModelNodeIds = ref<string[]>([])
  const selectedInstanceIds = ref<string[]>([])
  const selectedModelLinkId = ref<string | null>(null)
  const selectedEdgeInstanceId = ref<string | null>(null)
  const selectedCanvasElementId = ref<string | null>(null)

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
    clearDiagramSelection,
    clearCanvasSelection,
    applyDiagramSelection,
  }
}
