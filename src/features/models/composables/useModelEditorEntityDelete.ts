import { computed, ref, type ComputedRef, type Ref } from 'vue'
import {
  applyPendingDiagramSwitch,
  type PendingDiagramAction,
} from '../utils/applyPendingDiagramSwitch'
import { removeOrphanEdgeAnchors } from '../utils/edgeAnchorSync'
import type { EditorDiagram, ModelEditorState } from '../types'

type Translate = (key: string, params?: Record<string, unknown>) => string

type DiagramHistory = {
  execute?: (command: { execute: () => void; undo: () => void }) => void
  clear?: () => void
}

export function useModelEditorEntityDelete(options: {
  state: Ref<ModelEditorState>
  activeDiagram: ComputedRef<EditorDiagram | null>
  selectedDiagramId: Ref<string | null>
  isDiagramReadOnly: ComputedRef<boolean>
  t: Translate
  setUiError: (message: string) => void
  discardUnsavedChanges: () => Promise<boolean>
  applyDiagramSelection: (diagramId: string) => void
  markNodeDeleted: (nodeId: string) => void
  markDiagramDeleted: (diagramId: string) => void
  markLinkDeleted: (linkId: string) => void
  markDiagramDirty: (diagramId: string) => void
  removeNodesFromCurrentDiagram: (nodeIds: string[]) => void
  removeNodesFromCurrentDiagramByInstances: (instanceIds: string[]) => void
  isDiagramOnlyEdgeModelLinkId: (linkId: string) => boolean
  isUntypedModelLinkId: (linkId: string) => boolean
  selectedModelNodeIds: Ref<string[]>
  selectedInstanceIds: Ref<string[]>
  selectedModelLinkId: Ref<string | null>
  selectedEdgeInstanceId: Ref<string | null>
  selectedCanvasElementId: Ref<string | null>
  diagramInteractionManager: Ref<{ history?: DiagramHistory } | null>
  isNoteInstance: (instance: any) => boolean
  isContainerInstance: (instance: any) => boolean
  isEdgeAnchorInstance: (instance: any) => boolean
  isDiagramNoteModelNodeId: (nodeId: string) => boolean
  isDiagramContainerModelNodeId: (nodeId: string) => boolean
  isEdgeAnchorModelNodeId: (nodeId: string) => boolean
  copySelectedNotesToClipboard: () => boolean
  pasteCopiedNotes: () => boolean
}) {
  const showLinkDeleteModal = ref(false)
  const pendingDeleteLinkId = ref<string | null>(null)
  const pendingDeleteEdgeInstanceId = ref<string | null>(null)
  const showNodeDeleteModal = ref(false)
  const pendingDeleteNodeIds = ref<string[]>([])
  const pendingDeleteInstanceIds = ref<string[]>([])
  const pendingDeleteNodeSource = ref<'canvas' | 'tree'>('tree')
  const showDiagramDeleteModal = ref(false)
  const pendingDeleteDiagramId = ref<string | null>(null)
  const showDiagramSwitchModal = ref(false)
  const pendingDiagramSwitchId = ref<string | null>(null)
  const pendingDiagramAction = ref<'switch' | 'close' | null>(null)
  const pendingDeleteNodeCount = computed(() =>
    pendingDeleteInstanceIds.value.length > 0
      ? pendingDeleteInstanceIds.value.length
      : pendingDeleteNodeIds.value.length
  )
  const pendingDeleteNodeSingleName = computed(() => {
    const count = pendingDeleteNodeCount.value
    if (count !== 1) return ''
    if (pendingDeleteInstanceIds.value.length > 0) {
      const instanceId = pendingDeleteInstanceIds.value[0]
      if (!instanceId) return ''
      const instance = options.activeDiagram.value?.parsedAttrs.instances.nodes.find(
        item => item.id === instanceId
      )
      if (!instance) return ''
      if (options.isNoteInstance(instance)) return options.t('models.noteName')
      if (options.isContainerInstance(instance)) return options.t('models.containerName')
      if (options.isEdgeAnchorInstance(instance)) return options.t('models.edgeAnchorName')
      return options.state.value.nodes.find(item => item.id === instance.modelNodeId)?.name ?? ''
    }
    const nodeId = pendingDeleteNodeIds.value[0]
    if (!nodeId) return ''
    if (options.isDiagramNoteModelNodeId(nodeId)) return options.t('models.noteName')
    if (options.isDiagramContainerModelNodeId(nodeId)) return options.t('models.containerName')
    if (options.isEdgeAnchorModelNodeId(nodeId)) return options.t('models.edgeAnchorName')
    return options.state.value.nodes.find(item => item.id === nodeId)?.name ?? ''
  })
  const nodeDeleteConfirmMessage = computed(() => {
    const name = pendingDeleteNodeSingleName.value || options.t('common.unnamed')
    const count = pendingDeleteNodeCount.value
    if (pendingDeleteNodeSource.value === 'canvas') {
      return count === 1
        ? options.t('models.deleteNodeFromDiagramSingle', { name })
        : options.t('models.deleteNodeFromDiagramMultiple', { count })
    }
    return count === 1
      ? options.t('models.deleteNodeFromModelSingle', { name })
      : options.t('models.deleteNodeFromModelMultiple', { count })
  })
  const pendingDeleteDiagramName = computed(() => {
    const diagramId = pendingDeleteDiagramId.value
    if (!diagramId) return ''
    return options.state.value.diagrams.find(item => item.id === diagramId)?.name ?? ''
  })

  const openNodeDeleteDialog = (
    nodeIds: string[],
    source: 'canvas' | 'tree',
    instanceIds: string[] = []
  ) => {
    if (source === 'canvas' && instanceIds.length > 0) {
      pendingDeleteInstanceIds.value = [...new Set(instanceIds)]
      pendingDeleteNodeIds.value = []
    } else if (nodeIds.length > 0) {
      pendingDeleteNodeIds.value = [...new Set(nodeIds)]
      pendingDeleteInstanceIds.value = []
    } else {
      return
    }
    pendingDeleteNodeSource.value = source
    showNodeDeleteModal.value = true
  }

  const cancelNodeDelete = () => {
    pendingDeleteNodeIds.value = []
    pendingDeleteInstanceIds.value = []
    pendingDeleteNodeSource.value = 'tree'
    showNodeDeleteModal.value = false
  }

  const openDiagramDeleteDialog = (diagramId: string) => {
    pendingDeleteDiagramId.value = diagramId
    showDiagramDeleteModal.value = true
  }

  const cancelDiagramDelete = () => {
    pendingDeleteDiagramId.value = null
    showDiagramDeleteModal.value = false
  }

  const cancelDiagramSwitch = () => {
    pendingDiagramSwitchId.value = null
    pendingDiagramAction.value = null
    showDiagramSwitchModal.value = false
  }

  const switchDiagramWithoutSave = async () => {
    const action = pendingDiagramAction.value
    if (!action) return

    const targetDiagramId = pendingDiagramSwitchId.value
    // Close the modal immediately so the UI does not feel stuck on large models.
    cancelDiagramSwitch()

    const result = await applyPendingDiagramSwitch({
      discard: options.discardUnsavedChanges,
      action,
      targetDiagramId,
    })
    if (!result.ok) {
      options.setUiError(options.t('models.discardUnsavedFailed'))
      return
    }

    options.diagramInteractionManager.value?.history?.clear?.()

    if (result.effect === 'close') {
      options.selectedDiagramId.value = null
      options.selectedModelNodeIds.value = []
      options.selectedInstanceIds.value = []
      options.selectedModelLinkId.value = null
      options.selectedEdgeInstanceId.value = null
      return
    }

    if (result.effect !== 'switch') return
    const restoredTarget = options.state.value.diagrams.find(
      diagram => diagram.id === result.diagramId && !diagram._isDeleted
    )
    if (!restoredTarget) {
      options.setUiError(options.t('models.diagramSwitchFailed'))
      return
    }

    options.applyDiagramSelection(restoredTarget.id)
  }

  const cancelLinkDelete = () => {
    pendingDeleteLinkId.value = null
    pendingDeleteEdgeInstanceId.value = null
    showLinkDeleteModal.value = false
  }

  const openLinkDeleteDialog = (linkId: string, edgeInstanceId?: string) => {
    pendingDeleteLinkId.value = linkId
    pendingDeleteEdgeInstanceId.value = edgeInstanceId ?? null
    showLinkDeleteModal.value = true
  }

  const removeLinkFromCurrentDiagram = () => {
    const linkId = pendingDeleteLinkId.value
    const edgeInstanceId = pendingDeleteEdgeInstanceId.value
    const diagram = options.activeDiagram.value
    if (!linkId || !diagram) {
      cancelLinkDelete()
      return
    }

    const removedEdges = diagram.parsedAttrs.instances.edges
      .map((edge, index) => ({ index, edge: JSON.parse(JSON.stringify(edge)) }))
      .filter(
        entry =>
          entry.edge.modelLinkId === linkId &&
          (edgeInstanceId == null || entry.edge.id === edgeInstanceId)
      )
    if (removedEdges.length === 0) {
      cancelLinkDelete()
      return
    }

    const idsToRemove = new Set(removedEdges.map(e => e.edge.id))

    const applyRemoval = () => {
      diagram.parsedAttrs.instances.edges = diagram.parsedAttrs.instances.edges.filter(
        edge => !idsToRemove.has(edge.id)
      )
      const cleaned = removeOrphanEdgeAnchors(diagram.parsedAttrs)
      if (cleaned.changed) {
        diagram.parsedAttrs = cleaned.nextAttrs
      }
      if (options.selectedModelLinkId.value === linkId) {
        options.selectedModelLinkId.value = null
        options.selectedEdgeInstanceId.value = null
      }
      if (options.selectedCanvasElementId.value?.startsWith('edge-')) options.selectedCanvasElementId.value = null
      options.markDiagramDirty(diagram.id)
    }

    const restoreRemoved = () => {
      const currentEdges = [...diagram.parsedAttrs.instances.edges]
      for (const { index, edge } of removedEdges) {
        const alreadyExists = currentEdges.some(item => item.id === edge.id)
        if (alreadyExists) continue
        const safeIndex = Math.max(0, Math.min(index, currentEdges.length))
        currentEdges.splice(safeIndex, 0, JSON.parse(JSON.stringify(edge)))
      }
      diagram.parsedAttrs.instances.edges = currentEdges
      options.markDiagramDirty(diagram.id)
    }

    const history = options.diagramInteractionManager.value?.history
    if (history && typeof history.execute === 'function') {
      history.execute({
        execute: applyRemoval,
        undo: restoreRemoved,
      })
    } else {
      applyRemoval()
    }

    cancelLinkDelete()
  }

  const removeLinkFromModel = () => {
    const linkId = pendingDeleteLinkId.value
    if (!linkId) {
      cancelLinkDelete()
      return
    }

    if (options.isDiagramOnlyEdgeModelLinkId(linkId) || options.isUntypedModelLinkId(linkId)) {
      cancelLinkDelete()
      return
    }

    for (const diagram of options.state.value.diagrams) {
      if (diagram._isDeleted) continue
      const initial = diagram.parsedAttrs.instances.edges.length
      diagram.parsedAttrs.instances.edges = diagram.parsedAttrs.instances.edges.filter(
        edge => edge.modelLinkId !== linkId
      )
      if (diagram.parsedAttrs.instances.edges.length !== initial) {
        options.markDiagramDirty(diagram.id)
      }
    }

    options.markLinkDeleted(linkId)
    cancelLinkDelete()
  }

  const shouldSkipDeleteHotkey = (event: KeyboardEvent): boolean => {
    const target = event.target as HTMLElement | null
    if (!target) return false
    const tag = target.tagName
    return target.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
  }

  const onDeleteKeydown = (event: KeyboardEvent) => {
    const isCtrlOrMeta = event.ctrlKey || event.metaKey
    const key = event.code.startsWith('Key')
      ? event.code.slice(3).toLowerCase()
      : event.key.toLowerCase()
    const skipHotkeys = shouldSkipDeleteHotkey(event)

    if (isCtrlOrMeta && !event.shiftKey && key === 'c') {
      if (!skipHotkeys && options.copySelectedNotesToClipboard()) {
        event.preventDefault()
      }
      return
    }

    if (isCtrlOrMeta && !event.shiftKey && key === 'v') {
      if (!skipHotkeys && options.pasteCopiedNotes()) {
        event.preventDefault()
      }
      return
    }

    if (event.key !== 'Delete' && event.key !== 'Backspace') return
    if (!options.activeDiagram.value) return
    if (options.isDiagramReadOnly.value) return
    if (showLinkDeleteModal.value || showNodeDeleteModal.value || shouldSkipDeleteHotkey(event))
      return

    if (options.selectedModelNodeIds.value.length > 0 || options.selectedInstanceIds.value.length > 0) {
      event.preventDefault()
      openNodeDeleteDialog(
        options.selectedModelNodeIds.value,
        'canvas',
        options.selectedInstanceIds.value.length > 0 ? options.selectedInstanceIds.value : []
      )
      return
    }

    if (!options.selectedModelLinkId.value) return
    event.preventDefault()
    openLinkDeleteDialog(options.selectedModelLinkId.value, options.selectedEdgeInstanceId.value ?? undefined)
  }

  const handleRequestDeleteNodeFromDiagram = (instanceId: string) => {
    if (options.isDiagramReadOnly.value) return
    options.selectedModelLinkId.value = null
    options.selectedEdgeInstanceId.value = null
    openNodeDeleteDialog([], 'canvas', [instanceId])
  }

  const handleRequestDeleteLink = (linkId: string, edgeInstanceId?: string) => {
    if (options.isDiagramReadOnly.value) return
    options.selectedModelNodeIds.value = []
    options.selectedInstanceIds.value = []
    options.selectedModelLinkId.value = linkId
    options.selectedEdgeInstanceId.value = edgeInstanceId ?? null
    openLinkDeleteDialog(linkId, edgeInstanceId)
  }

  const confirmNodeDelete = () => {
    const nodeIds = pendingDeleteNodeIds.value
    const instanceIds = pendingDeleteInstanceIds.value
    const source = pendingDeleteNodeSource.value
    if (nodeIds.length === 0 && instanceIds.length === 0) {
      cancelNodeDelete()
      return
    }

    if (source === 'canvas') {
      if (instanceIds.length > 0) {
        options.removeNodesFromCurrentDiagramByInstances(instanceIds)
      } else {
        options.removeNodesFromCurrentDiagram(nodeIds)
      }
    } else {
      for (const nodeId of nodeIds) {
        options.markNodeDeleted(nodeId)
      }
    }
    cancelNodeDelete()
  }

  const confirmDiagramDelete = () => {
    const diagramId = pendingDeleteDiagramId.value
    if (!diagramId) {
      cancelDiagramDelete()
      return
    }
    options.markDiagramDeleted(diagramId)
    cancelDiagramDelete()
  }

  const requestDiagramSwitch = (
    action: PendingDiagramAction,
    targetDiagramId: string | null = null
  ) => {
    pendingDiagramAction.value = action
    pendingDiagramSwitchId.value = targetDiagramId
    showDiagramSwitchModal.value = true
  }

  const allowRemoveLinkFromModel = computed(() => {
    const linkId = pendingDeleteLinkId.value
    return (
      !!linkId &&
      !options.isDiagramOnlyEdgeModelLinkId(linkId) &&
      !options.isUntypedModelLinkId(linkId)
    )
  })

  return {
    showLinkDeleteModal,
    pendingDeleteLinkId,
    pendingDeleteEdgeInstanceId,
    showNodeDeleteModal,
    showDiagramDeleteModal,
    showDiagramSwitchModal,
    pendingDiagramSwitchId,
    pendingDiagramAction,
    nodeDeleteConfirmMessage,
    pendingDeleteDiagramName,
    allowRemoveLinkFromModel,
    openNodeDeleteDialog,
    cancelNodeDelete,
    confirmNodeDelete,
    openDiagramDeleteDialog,
    cancelDiagramDelete,
    confirmDiagramDelete,
    cancelLinkDelete,
    openLinkDeleteDialog,
    removeLinkFromCurrentDiagram,
    removeLinkFromModel,
    handleRequestDeleteNodeFromDiagram,
    handleRequestDeleteLink,
    cancelDiagramSwitch,
    requestDiagramSwitch,
    switchDiagramWithoutSave,
    shouldSkipDeleteHotkey,
    onDeleteKeydown,
  }
}
