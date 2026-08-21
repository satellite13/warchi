import { ref, type ComputedRef, type Ref } from 'vue'
import { applyDefaultCustomPropertyValuesFromAttrs } from '@/domain/attrs/customPropertyValues'
import { applyDefaultsToEditorNode } from '../utils/syncDefaultsOnLoad'
import { parseEntityAttrs } from '@/domain/attrs/notationAttrs'
import { clonePlainDeep } from '@/utils/clonePlainDeep'
import {
  createId,
  parseNodeAttrs,
  resolveCompatibleNotationComponents,
} from '../modelAttrs'
import type { DiagramNodeInstance } from '../modelAttrs'
import type { EditorDiagram, EditorNode, ModelEditorState, TreeParentScope } from '../types'
import {
  DEFAULT_CONTAINER_DIAGRAM_STYLE,
  DIAGRAM_CONTAINER_NODE_PREFIX,
  DIAGRAM_NOTE_NODE_PREFIX,
} from '../utils/diagramOnlyInstances'

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
  ensureDirectoryPath: (path: string) => Promise<DirectoryPathResult>
  ensureCompleteSiblingScope: (parentNodeId: string | null) => Promise<boolean>
  getNextTreeOrderForParent: (parentNodeId: string | null) => number
  treeScopeForParent: (parentNodeId: string | null) => TreeParentScope
  executeDiagramHistoryCommand: (command: DiagramHistoryCommand) => void
  markDiagramDirty: (diagramId: string) => void
  onDiagramInstancesChanged?: () => void
  markNodeDirty: (nodeId: string) => void
  reconcileMaterializedRows?: (
    affectedScopes?: readonly TreeParentScope[] | 'all'
  ) => void
  setUiError: (message: string) => void
  t: (key: string) => string
}

const deepClone = clonePlainDeep

export function useModelDiagramInstances(options: UseModelDiagramInstancesOptions) {
  const showComponentChoiceModal = ref(false)
  const componentChoiceOptions = ref<{ id: string; name: string }[]>([])
  const componentChoiceNodeId = ref<string | null>(null)
  const pendingTreeNodeDiagramDrop = ref<{ modelNodeId: string; x: number; y: number } | null>(null)
  const noteClipboard = ref<DiagramNodeInstance[] | null>(null)
  const notePasteCount = ref(0)

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
      applyDefaultCustomPropertyValuesFromAttrs(
        node.parsedAttrs.componentProperties[notationId][componentId]!,
        component.attrs,
      )
    }
    options.markNodeDirty(node.id)
  }

  const ensureNodeDefaultBinding = (node: EditorNode, componentId: string): void => {
    const notationId = options.activeNotationId.value
    if (!notationId) return
    if (node.parsedAttrs.notationComponents[notationId]?.componentId) return
    bindNodeComponent(node, componentId)
  }

  const getComponentDiagramStyle = (componentId: string) => {
    const notationId = options.activeNotationId.value
    const component = options.state.value.components.find(
      item => item.id === componentId && (!notationId || item.notationId === notationId),
    )
    return component ? parseEntityAttrs(component.attrs ?? null).diagramStyle : undefined
  }

  const bindInstanceComponent = (instanceId: string, componentId: string): void => {
    const diagram = options.activeDiagram.value
    const notationId = options.activeNotationId.value
    if (!diagram || !notationId) return
    const instance = diagram.parsedAttrs.instances.nodes.find(item => item.id === instanceId)
    if (!instance) return
    const node = options.state.value.nodes.find(
      item => item.id === instance.modelNodeId && !item._isDeleted,
    )
    if (!node) return

    ensureNodeDefaultBinding(node, componentId)

    if (!instance.attrs) instance.attrs = {}
    instance.attrs.notationComponentId = componentId
    const diagramStyle = getComponentDiagramStyle(componentId)
    if (diagramStyle) {
      instance.attrs.diagramStyle = deepClone(diagramStyle)
      if (typeof diagramStyle.width === 'number') instance.width = diagramStyle.width
      if (typeof diagramStyle.height === 'number') instance.height = diagramStyle.height
    } else {
      delete instance.attrs.diagramStyle
    }
    options.markDiagramDirty(diagram.id)
  }

  const handleComponentChoiceModalClose = (): void => {
    showComponentChoiceModal.value = false
    pendingTreeNodeDiagramDrop.value = null
    componentChoiceNodeId.value = null
    componentChoiceOptions.value = []
  }

  const placeExistingNodeInstance = (
    node: EditorNode,
    x: number,
    y: number,
    componentId: string,
  ): void => {
    const diagram = options.activeDiagram.value
    if (!diagram) return
    ensureNodeDefaultBinding(node, componentId)
    const diagramStyle = getComponentDiagramStyle(componentId)
    const nodeInstance: DiagramNodeInstance = {
      id: createId(),
      modelNodeId: node.id,
      x,
      y,
      width: typeof diagramStyle?.width === 'number' ? diagramStyle.width : 160,
      height: typeof diagramStyle?.height === 'number' ? diagramStyle.height : 56,
      attrs: {
        notationComponentId: componentId,
        ...(diagramStyle ? { diagramStyle: deepClone(diagramStyle) } : {}),
      },
    }
    options.executeDiagramHistoryCommand({
      execute: () => {
        if (!diagram.parsedAttrs.instances.nodes.some(item => item.id === nodeInstance.id)) {
          diagram.parsedAttrs.instances.nodes.push(deepClone(nodeInstance))
        }
        options.markDiagramDirty(diagram.id)
        options.onDiagramInstancesChanged?.()
      },
      undo: () => {
        diagram.parsedAttrs.instances.nodes = diagram.parsedAttrs.instances.nodes.filter(
          item => item.id !== nodeInstance.id,
        )
        options.markDiagramDirty(diagram.id)
        options.onDiagramInstancesChanged?.()
      },
    })
  }

  /** Ensures node has a default binding when there is exactly one matching component. */
  const ensureNodeBindingByNodeType = (node: EditorNode): boolean => {
    const notationId = options.activeNotationId.value
    if (!notationId) return false
    if (node.parsedAttrs.notationComponents[notationId]?.componentId) return true

    const matchingComponents = resolveCompatibleNotationComponents({
      node,
      notationId,
      components: options.state.value.components,
    })
    if (matchingComponents.length === 1) {
      bindNodeComponent(node, matchingComponents[0]!.id)
      return true
    }
    if (matchingComponents.length > 1) {
      componentChoiceNodeId.value = node.id
      componentChoiceOptions.value = matchingComponents.map(item => ({
        id: item.id,
        name: item.name,
      }))
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
        options.onDiagramInstancesChanged?.()
        },
        undo: () => {
          diagram.parsedAttrs.instances.nodes = diagram.parsedAttrs.instances.nodes.filter(
            item => item.id !== directoryNoteInstance.id,
          )
          diagram.parsedAttrs.instances.edges = diagram.parsedAttrs.instances.edges.filter(
            edge =>
              edge.sourceInstanceId !== directoryNoteInstance.id &&
              edge.targetInstanceId !== directoryNoteInstance.id,
          )
          options.markDiagramDirty(diagram.id)
        options.onDiagramInstancesChanged?.()
        },
      })
      return
    }

    const notationId = options.activeNotationId.value
    if (!notationId) {
      options.setUiError(options.t('models.noMatchingComponent'))
      return
    }
    const matchingComponents = resolveCompatibleNotationComponents({
      node,
      notationId,
      components: options.state.value.components,
    })
    if (matchingComponents.length === 0) {
      options.setUiError(options.t('models.noMatchingComponent'))
      return
    }
    if (matchingComponents.length > 1) {
      componentChoiceNodeId.value = node.id
      componentChoiceOptions.value = matchingComponents.map(item => ({
        id: item.id,
        name: item.name,
      }))
      pendingTreeNodeDiagramDrop.value = { modelNodeId, x, y }
      showComponentChoiceModal.value = true
      return
    }

    placeExistingNodeInstance(node, x, y, matchingComponents[0]!.id)
  }

  const finalizeComponentChoiceForDiagram = (componentId: string): void => {
    const nodeId = componentChoiceNodeId.value
    const pending = pendingTreeNodeDiagramDrop.value
    const node =
      nodeId !== null
        ? options.state.value.nodes.find(item => item.id === nodeId && !item._isDeleted)
        : undefined
    showComponentChoiceModal.value = false
    componentChoiceNodeId.value = null
    componentChoiceOptions.value = []
    pendingTreeNodeDiagramDrop.value = null
    if (pending && pending.modelNodeId === nodeId && node) {
      placeExistingNodeInstance(node, pending.x, pending.y, componentId)
    } else if (node) {
      ensureNodeDefaultBinding(node, componentId)
    }
  }

  const createNodeFromPaletteComponent = async (
    componentId: string,
    x: number,
    y: number
  ): Promise<void> => {
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

    let parentNodeId: string | null = diagram.nodeId ?? null
    let createdDirectoryIds: string[] = []
    if (defaultDirectoryPath) {
      const ensuredPath = await options.ensureDirectoryPath(defaultDirectoryPath)
      if (!ensuredPath.parentNodeId) return
      parentNodeId = ensuredPath.parentNodeId
      createdDirectoryIds = ensuredPath.createdDirectoryIds
    } else if (!(await options.ensureCompleteSiblingScope(parentNodeId))) {
      return
    }

    const createdDirectoryNodes = options.state.value.nodes
      .filter(item => createdDirectoryIds.includes(item.id))
      .map(item => deepClone(item))
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
      attrs: {
        notationComponentId: componentId,
        ...(diagramStyle ? { diagramStyle: deepClone(diagramStyle) } : {}),
      },
    }
    options.executeDiagramHistoryCommand({
      execute: () => {
        for (const directory of createdDirectoryNodes) {
          if (!options.state.value.nodes.some(item => item.id === directory.id)) {
            options.state.value.nodes.push(deepClone(directory))
          }
        }
        const parsedAttrs = parseNodeAttrs(null)
        const treeOrder = options.getNextTreeOrderForParent(parentNodeId)
        parsedAttrs.treeOrder = treeOrder
        if (notationId) {
          parsedAttrs.notationComponents[notationId] = { componentId }
          const scopedDefaults: Record<string, unknown> = {}
          applyDefaultCustomPropertyValuesFromAttrs(scopedDefaults, component.attrs)
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
        applyDefaultsToEditorNode(newNode, options.state.value)
        if (!options.state.value.nodes.some(item => item.id === nodeId)) {
          options.state.value.nodes.push(deepClone(newNode))
          const parent = options.state.value.nodes.find(item => item.id === parentNodeId)
          if (parent) parent.hasChildren = true
          options.reconcileMaterializedRows?.([options.treeScopeForParent(parentNodeId)])
        }
        if (!diagram.parsedAttrs.instances.nodes.some(item => item.id === newInstance.id)) {
          diagram.parsedAttrs.instances.nodes.push(deepClone(newInstance))
        }
        options.markDiagramDirty(diagram.id)
        options.onDiagramInstancesChanged?.()
      },
      undo: () => {
        const removedNodes = options.state.value.nodes.filter(
          item => item.id === nodeId || createdDirectoryIds.includes(item.id)
        )
        const removedNodeScopes = removedNodes.map(item =>
          options.treeScopeForParent(item.parentNodeId ?? null)
        )
        const removedParentIds = new Set(
          removedNodes.flatMap(item => (item.parentNodeId ? [item.parentNodeId] : []))
        )
        options.state.value.nodes = options.state.value.nodes.filter(
          item => item.id !== nodeId && !createdDirectoryIds.includes(item.id)
        )
        for (const parentId of removedParentIds) {
          const parent = options.state.value.nodes.find(item => item.id === parentId)
          if (parent) {
            parent.hasChildren = options.state.value.nodes.some(
              item => !item._isDeleted && item.parentNodeId === parentId
            )
          }
        }
        options.reconcileMaterializedRows?.(removedNodeScopes)
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
        options.onDiagramInstancesChanged?.()
      },
    })
  }

  const createDiagramNote = (x: number, y: number): void => {
    const diagram = options.activeDiagram.value
    if (!diagram) return
    const instanceId = createId()
    const modelNodeId = `${DIAGRAM_NOTE_NODE_PREFIX}${instanceId}`
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

  const createDiagramContainer = (x: number, y: number): void => {
    const diagram = options.activeDiagram.value
    if (!diagram) return
    const instanceId = createId()
    const modelNodeId = `${DIAGRAM_CONTAINER_NODE_PREFIX}${instanceId}`
    const containerInstance: DiagramNodeInstance = {
      id: instanceId,
      modelNodeId,
      x,
      y,
      width: 240,
      height: 160,
      attrs: {
        isContainer: true,
        containerLabel: options.t('models.newContainerText'),
        diagramStyle: { ...DEFAULT_CONTAINER_DIAGRAM_STYLE },
      },
    }
    options.executeDiagramHistoryCommand({
      execute: () => {
        if (!diagram.parsedAttrs.instances.nodes.some(item => item.id === containerInstance.id)) {
          diagram.parsedAttrs.instances.nodes.push(deepClone(containerInstance))
        }
        options.markDiagramDirty(diagram.id)
      },
      undo: () => {
        diagram.parsedAttrs.instances.nodes = diagram.parsedAttrs.instances.nodes.filter(
          item => item.id !== containerInstance.id
        )
        diagram.parsedAttrs.instances.edges = diagram.parsedAttrs.instances.edges.filter(
          edge =>
            edge.sourceInstanceId !== containerInstance.id &&
            edge.targetInstanceId !== containerInstance.id
        )
        options.selectedModelNodeIds.value = options.selectedModelNodeIds.value.filter(
          id => id !== modelNodeId
        )
        if (options.selectedCanvasElementId.value === `instance-${containerInstance.id}`) {
          options.selectedCanvasElementId.value = null
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
        modelNodeId: isDirectoryNote ? source.modelNodeId : `${DIAGRAM_NOTE_NODE_PREFIX}${id}`,
        x: source.x + pasteOffset,
        y: source.y + pasteOffset,
      } satisfies DiagramNodeInstance
    })
    const pastedInstanceIds = pastedNotes.map(note => note.id)
    const pastedModelNodeIds = pastedNotes.map(note => note.modelNodeId)
    const affectsTraceability = pastedNotes.some(note => note.attrs?.isDirectoryNote === true)
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
        if (affectsTraceability) options.onDiagramInstancesChanged?.()
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
        if (affectsTraceability) options.onDiagramInstancesChanged?.()
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
    bindInstanceComponent,
    ensureNodeBindingByNodeType,
    addExistingNodeToDiagram,
    createNodeFromPaletteComponent,
    createDiagramNote,
    createDiagramContainer,
    copySelectedNotesToClipboard,
    pasteCopiedNotes,
  }
}
