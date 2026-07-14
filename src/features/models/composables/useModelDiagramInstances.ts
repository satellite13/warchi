import { ref, type ComputedRef, type Ref } from 'vue'
import { parseEntityAttrs } from '@/domain/attrs/notationAttrs'
import { createId, parseNodeAttrs, resolveComponentByNodeType } from '../modelAttrs'
import type { DiagramNodeInstance } from '../modelAttrs'
import type { EditorDiagram, EditorNode, ModelEditorState } from '../types'

const NOTE_NODE_PREFIX = '__diagram-note__:'
const NOTE_PASTE_STEP = 24

type DiagramHistoryCommand = {
  execute: () => void
  undo: () => void
}

type DirectoryPathResult = {
  parentNodeId: string | null
  createdDirectoryIds: string[]
}

export type UseModelDiagramInstancesOptions = {
  state: Ref<ModelEditorState>
  activeDiagram: ComputedRef<EditorDiagram | null>
  activeNotationId: ComputedRef<string | null>
  isDiagramReadOnly: ComputedRef<boolean>
  directoryNodeType: ComputedRef<unknown | null>
  nodeTypeDefaultDirectoryById: ComputedRef<Map<string, string>>
  selectedModelNodeIds: Ref<string[]>
  selectedInstanceIds: Ref<string[]>
  selectedNodeId: Ref<string | null>
  selectedModelLinkId: Ref<string | null>
  selectedEdgeInstanceId: Ref<string | null>
  selectedCanvasElementId: Ref<string | null>
  editingNoteInstanceId: Ref<string | null>
  showNoteEditorModal: Ref<boolean>
  isDirectoryNode: (modelNodeId: string) => boolean
  isNoteInstance: (instance: DiagramNodeInstance) => boolean
  ensureDirectoryPath: (path: string) => DirectoryPathResult
  getNextTreeOrderForParent: (parentNodeId: string | null) => number
  executeDiagramHistoryCommand: (command: DiagramHistoryCommand) => void
  markDiagramDirty: (diagramId: string) => void
  markNodeDirty: (nodeId: string) => void
  setUiError: (message: string) => void
  t: (key: string) => string
}

const deepClone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T

export function useModelDiagramInstances(options: UseModelDiagramInstancesOptions) {
  const showComponentChoiceModal = ref(false)
  const componentChoiceOptions = ref<{ id: string; name: string }[]>([])
  const componentChoiceNodeId = ref<string | null>(null)
  const pendingTreeNodeDiagramDrop = ref<{ modelNodeId: string; x: number; y: number } | null>(null)
  const noteClipboard = ref<DiagramNodeInstance[] | null>(null)
  const notePasteCount = ref(0)

  const applyDefaultCustomValues = (
    target: Record<string, unknown>,
    attrsRaw: string | null | undefined
  ): void => {
    const customProperties = parseEntityAttrs(attrsRaw ?? null).customProperties
    for (const property of customProperties) {
      if (Object.hasOwn(target, property.name) || property.defaultValue === undefined) continue
      target[property.name] = property.defaultValue
    }
  }

  const bindNodeComponent = (node: EditorNode, componentId: string): void => {
    const notationId = options.activeNotationId.value
    if (!notationId) return
    node.parsedAttrs.notationComponents[notationId] = { componentId }
    if (!node.parsedAttrs.componentProperties[notationId]) {
      node.parsedAttrs.componentProperties[notationId] = {}
    }
    if (!node.parsedAttrs.componentProperties[notationId][componentId]) {
      node.parsedAttrs.componentProperties[notationId][componentId] = {}
    }
    const component = options.state.value.components.find(
      item => item.id === componentId && item.notationId === notationId
    )
    if (component) {
      applyDefaultCustomValues(
        node.parsedAttrs.componentProperties[notationId][componentId]!,
        component.attrs
      )
    }
    options.markNodeDirty(node.id)
  }

  const handleComponentChoiceModalClose = (): void => {
    showComponentChoiceModal.value = false
    pendingTreeNodeDiagramDrop.value = null
    componentChoiceNodeId.value = null
    componentChoiceOptions.value = []
  }

  const ensureNodeBindingByNodeType = (node: EditorNode): boolean => {
    const notationId = options.activeNotationId.value
    if (!notationId) return false
    if (node.parsedAttrs.notationComponents[notationId]?.componentId) return true

    const matchingComponents = resolveComponentByNodeType(
      options.state.value.components,
      notationId,
      node.nodeTypeId
    )
    if (matchingComponents.length === 1) {
      bindNodeComponent(node, matchingComponents[0]!.id)
      return true
    }
    if (matchingComponents.length > 1) {
      componentChoiceNodeId.value = node.id
      componentChoiceOptions.value = matchingComponents.map(item => ({ id: item.id, name: item.name }))
      showComponentChoiceModal.value = true
      return false
    }
    options.setUiError(options.t('models.noMatchingComponent'))
    return false
  }

  const addExistingNodeToDiagram = (modelNodeId: string, x: number, y: number): void => {
    const diagram = options.activeDiagram.value
    if (!diagram) return
    const node = options.state.value.nodes.find(item => item.id === modelNodeId && !item._isDeleted)
    if (!node) return

    if (options.isDirectoryNode(modelNodeId)) {
      const directoryNoteInstance: DiagramNodeInstance = {
        id: createId(),
        modelNodeId,
        x,
        y,
        width: 230,
        height: 126,
        attrs: {
          isNote: true,
          isDirectoryNote: true,
          noteText: node.name,
          diagramStyle: {
            nodeShape: 'rectangle',
            fillColor: '#eaf2ff',
            strokeColor: '#6f94ff',
            strokeWidth: 1.5,
            labelColor: '#233a80',
            labelFontSize: 13,
            labelAlign: 'left',
            labelInset: 12,
            labelPlacement: 'center',
          },
        },
      }
      options.executeDiagramHistoryCommand({
        execute: () => {
          if (!diagram.parsedAttrs.instances.nodes.some(item => item.id === directoryNoteInstance.id)) {
            diagram.parsedAttrs.instances.nodes.push(deepClone(directoryNoteInstance))
          }
          options.markDiagramDirty(diagram.id)
        },
        undo: () => {
          diagram.parsedAttrs.instances.nodes = diagram.parsedAttrs.instances.nodes.filter(
            item => item.id !== directoryNoteInstance.id
          )
          diagram.parsedAttrs.instances.edges = diagram.parsedAttrs.instances.edges.filter(
            edge =>
              edge.sourceInstanceId !== directoryNoteInstance.id &&
              edge.targetInstanceId !== directoryNoteInstance.id
          )
          options.markDiagramDirty(diagram.id)
        },
      })
      return
    }

    const notationId = options.activeNotationId.value
    const matchingComponents = notationId
      ? resolveComponentByNodeType(options.state.value.components, notationId, node.nodeTypeId)
      : []
    const opensChoice = !node.parsedAttrs.notationComponents[notationId ?? '']?.componentId &&
      matchingComponents.length > 1
    if (!ensureNodeBindingByNodeType(node)) {
      if (opensChoice) pendingTreeNodeDiagramDrop.value = { modelNodeId, x, y }
      return
    }

    const componentId = notationId
      ? (node.parsedAttrs.notationComponents[notationId]?.componentId ?? null)
      : null
    const component = componentId
      ? options.state.value.components.find(item => item.id === componentId && item.notationId === notationId)
      : null
    const diagramStyle = component ? parseEntityAttrs(component.attrs ?? null).diagramStyle : undefined
    const nodeInstance: DiagramNodeInstance = {
      id: createId(),
      modelNodeId,
      x,
      y,
      width: typeof diagramStyle?.width === 'number' ? diagramStyle.width : 160,
      height: typeof diagramStyle?.height === 'number' ? diagramStyle.height : 56,
      attrs: diagramStyle ? { diagramStyle: deepClone(diagramStyle) } : undefined,
    }
    options.executeDiagramHistoryCommand({
      execute: () => {
        if (!diagram.parsedAttrs.instances.nodes.some(item => item.id === nodeInstance.id)) {
          diagram.parsedAttrs.instances.nodes.push(deepClone(nodeInstance))
        }
        options.markDiagramDirty(diagram.id)
      },
      undo: () => {
        diagram.parsedAttrs.instances.nodes = diagram.parsedAttrs.instances.nodes.filter(
          item => item.id !== nodeInstance.id
        )
        options.markDiagramDirty(diagram.id)
      },
    })
  }

  const finalizeComponentChoiceForDiagram = (componentId: string): void => {
    const nodeId = componentChoiceNodeId.value
    const pending = pendingTreeNodeDiagramDrop.value
    const node =
      nodeId !== null
        ? options.state.value.nodes.find(item => item.id === nodeId && !item._isDeleted)
        : undefined
    if (node) bindNodeComponent(node, componentId)
    showComponentChoiceModal.value = false
    componentChoiceNodeId.value = null
    componentChoiceOptions.value = []
    pendingTreeNodeDiagramDrop.value = null
    if (pending && pending.modelNodeId === nodeId && node) {
      addExistingNodeToDiagram(pending.modelNodeId, pending.x, pending.y)
    }
  }

  const createNodeFromPaletteComponent = (componentId: string, x: number, y: number): void => {
    if (options.isDiagramReadOnly.value) return
    const diagram = options.activeDiagram.value
    if (!diagram || !diagram.nodeId) {
      options.setUiError(options.t('models.cannotCreateNodeWithoutDirectory'))
      return
    }
    const component = options.state.value.components.find(item => item.id === componentId)
    if (!component) return
    const defaultDirectoryPath =
      options.nodeTypeDefaultDirectoryById.value.get(component.nodeTypeId) ?? ''
    if (defaultDirectoryPath && !options.directoryNodeType.value) {
      options.setUiError(options.t('models.directoryTypeRequiredForAutoPath'))
      return
    }

    const nodeId = createId()
    const instanceId = createId()
    const notationId = options.activeNotationId.value
    const diagramStyle = parseEntityAttrs(component.attrs ?? null).diagramStyle
    const newInstance: DiagramNodeInstance = {
      id: instanceId,
      modelNodeId: nodeId,
      x,
      y,
      width: typeof diagramStyle?.width === 'number' ? diagramStyle.width : 160,
      height: typeof diagramStyle?.height === 'number' ? diagramStyle.height : 56,
      attrs: diagramStyle ? { diagramStyle: deepClone(diagramStyle) } : undefined,
    }
    let createdDirectoryIds: string[] = []

    options.executeDiagramHistoryCommand({
      execute: () => {
        createdDirectoryIds = []
        let parentNodeId: string | null = diagram.nodeId ?? null
        if (defaultDirectoryPath) {
          const ensuredPath = options.ensureDirectoryPath(defaultDirectoryPath)
          if (!ensuredPath.parentNodeId) return
          parentNodeId = ensuredPath.parentNodeId
          createdDirectoryIds = ensuredPath.createdDirectoryIds
        }
        const parsedAttrs = parseNodeAttrs(null)
        parsedAttrs.treeOrder = options.getNextTreeOrderForParent(parentNodeId)
        if (notationId) {
          parsedAttrs.notationComponents[notationId] = { componentId }
          const scopedDefaults: Record<string, unknown> = {}
          applyDefaultCustomValues(scopedDefaults, component.attrs)
          parsedAttrs.componentProperties[notationId] = { [componentId]: scopedDefaults }
        }
        const newNode: EditorNode = {
          id: nodeId,
          name: component.name,
          modelId: options.state.value.modelId,
          ownerId: options.state.value.ownerId,
          nodeTypeId: component.nodeTypeId,
          parentNodeId,
          createdAt: null,
          updatedAt: null,
          parsedAttrs,
          _isNew: true,
        }
        if (!options.state.value.nodes.some(item => item.id === nodeId)) {
          options.state.value.nodes.push(deepClone(newNode))
        }
        if (!diagram.parsedAttrs.instances.nodes.some(item => item.id === newInstance.id)) {
          diagram.parsedAttrs.instances.nodes.push(deepClone(newInstance))
        }
        options.markDiagramDirty(diagram.id)
      },
      undo: () => {
        options.state.value.nodes = options.state.value.nodes.filter(
          item => item.id !== nodeId && !createdDirectoryIds.includes(item.id)
        )
        diagram.parsedAttrs.instances.nodes = diagram.parsedAttrs.instances.nodes.filter(
          item => item.id !== newInstance.id
        )
        diagram.parsedAttrs.instances.edges = diagram.parsedAttrs.instances.edges.filter(
          edge => edge.sourceInstanceId !== newInstance.id && edge.targetInstanceId !== newInstance.id
        )
        options.selectedModelNodeIds.value = options.selectedModelNodeIds.value.filter(id => id !== nodeId)
        if (
          options.selectedNodeId.value === nodeId ||
          createdDirectoryIds.includes(options.selectedNodeId.value ?? '')
        ) {
          options.selectedNodeId.value = null
        }
        options.markDiagramDirty(diagram.id)
      },
    })
  }

  const createDiagramNote = (x: number, y: number): void => {
    const diagram = options.activeDiagram.value
    if (!diagram) return
    const instanceId = createId()
    const modelNodeId = `${NOTE_NODE_PREFIX}${instanceId}`
    const noteInstance: DiagramNodeInstance = {
      id: instanceId,
      modelNodeId,
      x,
      y,
      width: 220,
      height: 120,
      attrs: {
        isNote: true,
        noteText: options.t('models.newNoteText'),
        diagramStyle: {
          nodeShape: 'rectangle',
          fillColor: '#fff9c4',
          strokeColor: '#e6c85b',
          strokeWidth: 1.5,
          labelColor: '#5a4600',
          labelFontSize: 13,
          labelAlign: 'left',
          labelInset: 10,
          labelPlacement: 'center',
        },
      },
    }
    options.executeDiagramHistoryCommand({
      execute: () => {
        if (!diagram.parsedAttrs.instances.nodes.some(item => item.id === noteInstance.id)) {
          diagram.parsedAttrs.instances.nodes.push(deepClone(noteInstance))
        }
        options.markDiagramDirty(diagram.id)
      },
      undo: () => {
        diagram.parsedAttrs.instances.nodes = diagram.parsedAttrs.instances.nodes.filter(
          item => item.id !== noteInstance.id
        )
        diagram.parsedAttrs.instances.edges = diagram.parsedAttrs.instances.edges.filter(
          edge => edge.sourceInstanceId !== noteInstance.id && edge.targetInstanceId !== noteInstance.id
        )
        options.selectedModelNodeIds.value = options.selectedModelNodeIds.value.filter(
          id => id !== modelNodeId
        )
        if (options.selectedCanvasElementId.value === `instance-${noteInstance.id}`) {
          options.selectedCanvasElementId.value = null
        }
        if (options.editingNoteInstanceId.value === noteInstance.id) {
          options.showNoteEditorModal.value = false
          options.editingNoteInstanceId.value = null
        }
        options.markDiagramDirty(diagram.id)
      },
    })
  }

  const getSelectedDiagramInstances = (): DiagramNodeInstance[] => {
    const diagram = options.activeDiagram.value
    if (!diagram) return []
    const selected = new Map<string, DiagramNodeInstance>()
    if (options.selectedInstanceIds.value.length > 0) {
      const ids = new Set(options.selectedInstanceIds.value)
      for (const instance of diagram.parsedAttrs.instances.nodes) {
        if (ids.has(instance.id)) selected.set(instance.id, instance)
      }
    } else if (options.selectedModelNodeIds.value.length > 0) {
      const modelNodeIds = new Set(options.selectedModelNodeIds.value)
      for (const instance of diagram.parsedAttrs.instances.nodes) {
        if (modelNodeIds.has(instance.modelNodeId)) selected.set(instance.id, instance)
      }
    }
    return Array.from(selected.values())
  }

  const copySelectedNotesToClipboard = (): boolean => {
    if (!options.activeDiagram.value) return false
    const selectedNotes = getSelectedDiagramInstances()
      .filter(options.isNoteInstance)
      .map(instance => deepClone(instance))
    if (selectedNotes.length === 0) return false
    noteClipboard.value = selectedNotes
    notePasteCount.value = 0
    return true
  }

  const pasteCopiedNotes = (): boolean => {
    const diagram = options.activeDiagram.value
    if (!diagram || options.isDiagramReadOnly.value || !noteClipboard.value?.length) return false
    const pasteOffset = NOTE_PASTE_STEP * (notePasteCount.value + 1)
    const pastedNotes = noteClipboard.value.map(source => {
      const id = createId()
      const isDirectoryNote = source.attrs?.isDirectoryNote === true
      return {
        ...deepClone(source),
        id,
        modelNodeId: isDirectoryNote ? source.modelNodeId : `${NOTE_NODE_PREFIX}${id}`,
        x: source.x + pasteOffset,
        y: source.y + pasteOffset,
      } satisfies DiagramNodeInstance
    })
    const pastedInstanceIds = pastedNotes.map(note => note.id)
    const pastedModelNodeIds = pastedNotes.map(note => note.modelNodeId)
    options.executeDiagramHistoryCommand({
      execute: () => {
        const existingIds = new Set(diagram.parsedAttrs.instances.nodes.map(item => item.id))
        for (const note of pastedNotes) {
          if (!existingIds.has(note.id)) diagram.parsedAttrs.instances.nodes.push(deepClone(note))
        }
        options.selectedModelNodeIds.value = pastedModelNodeIds
        options.selectedInstanceIds.value = pastedInstanceIds
        options.selectedModelLinkId.value = null
        options.selectedEdgeInstanceId.value = null
        options.selectedCanvasElementId.value =
          pastedInstanceIds.length === 1 ? `instance-${pastedInstanceIds[0]}` : null
        options.markDiagramDirty(diagram.id)
      },
      undo: () => {
        const pastedIds = new Set(pastedInstanceIds)
        diagram.parsedAttrs.instances.nodes = diagram.parsedAttrs.instances.nodes.filter(
          item => !pastedIds.has(item.id)
        )
        diagram.parsedAttrs.instances.edges = diagram.parsedAttrs.instances.edges.filter(
          edge => !pastedIds.has(edge.sourceInstanceId) && !pastedIds.has(edge.targetInstanceId)
        )
        options.selectedModelNodeIds.value = []
        options.selectedInstanceIds.value = []
        options.selectedModelLinkId.value = null
        options.selectedEdgeInstanceId.value = null
        options.selectedCanvasElementId.value = null
        options.markDiagramDirty(diagram.id)
      },
    })
    notePasteCount.value += 1
    return true
  }

  return {
    showComponentChoiceModal,
    componentChoiceOptions,
    handleComponentChoiceModalClose,
    finalizeComponentChoiceForDiagram,
    bindNodeComponent,
    ensureNodeBindingByNodeType,
    addExistingNodeToDiagram,
    createNodeFromPaletteComponent,
    createDiagramNote,
    copySelectedNotesToClipboard,
    pasteCopiedNotes,
  }
}
