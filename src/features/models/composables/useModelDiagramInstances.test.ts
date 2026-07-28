import { computed, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { parseDiagramAttrs, parseNodeAttrs } from '../modelAttrs'
import type { EditorDiagram, ModelEditorState } from '../types'
import { useModelDiagramInstances } from './useModelDiagramInstances'

function createState(): ModelEditorState {
  return {
    modelId: 'model-1',
    ownerId: 'owner-1',
    nodes: [
      {
        id: 'existing-node',
        name: 'Existing node',
        modelId: 'model-1',
        ownerId: 'owner-1',
        nodeTypeId: 'type-1',
        parentNodeId: null,
        parsedAttrs: parseNodeAttrs(null),
      },
    ],
    links: [],
    diagrams: [],
    notations: [],
    nodeTypes: [],
    linkTypes: [],
    components: [
      {
        id: 'component-1',
        name: 'Component 1',
        notationId: 'notation-1',
        nodeTypeId: 'type-1',
        attrs: JSON.stringify({ diagramStyle: { width: 200, height: 80 } }),
      } as never,
      {
        id: 'component-2',
        name: 'Component 2',
        notationId: 'notation-1',
        nodeTypeId: 'type-1',
        attrs: null,
      } as never,
    ],
    relations: [],
    relationRules: [],
  }
}

function createHarness(stateValue = createState()) {
  const state = ref(stateValue)
  const selectedModelNodeIds = ref<string[]>([])
  const selectedInstanceIds = ref<string[]>([])
  const selectedNodeId = ref<string | null>(null)
  const selectedModelLinkId = ref<string | null>(null)
  const selectedEdgeInstanceId = ref<string | null>(null)
  const selectedCanvasElementId = ref<string | null>(null)
  const editingNoteInstanceId = ref<string | null>(null)
  const showNoteEditorModal = ref(false)
  const historyCommands: Array<{ execute: () => void; undo: () => void }> = []
  const markDiagramDirty = vi.fn()
  const markNodeDirty = vi.fn()
  const setUiError = vi.fn()
  const diagram = ref<EditorDiagram>({
    id: 'diagram-1',
    name: 'Diagram',
    version: '1.0.0',
    notationId: 'notation-1',
    modelId: 'model-1',
    ownerId: 'owner-1',
    nodeId: 'parent-node',
    parsedAttrs: parseDiagramAttrs(null),
  })

  const instances = useModelDiagramInstances({
    state,
    activeDiagram: computed(() => diagram.value),
    activeNotationId: computed(() => 'notation-1'),
    isDiagramReadOnly: computed(() => false),
    directoryNodeType: computed(() => ({ id: 'directory-type' }) as never),
    nodeTypeDefaultDirectoryById: computed(() => new Map<string, string>()),
    selectedModelNodeIds,
    selectedInstanceIds,
    selectedNodeId,
    selectedModelLinkId,
    selectedEdgeInstanceId,
    selectedCanvasElementId,
    editingNoteInstanceId,
    showNoteEditorModal,
    isDirectoryNode: () => false,
    isNoteInstance: instance => instance.attrs?.isNote === true,
    ensureDirectoryPath: () => ({ parentNodeId: 'parent-node', createdDirectoryIds: [] }),
    getNextTreeOrderForParent: () => 0,
    executeDiagramHistoryCommand: command => {
      historyCommands.push(command)
      command.execute()
    },
    markDiagramDirty,
    markNodeDirty,
    setUiError,
    t: key => `translated:${key}`,
  })

  return {
    state,
    diagram,
    instances,
    historyCommands,
    markDiagramDirty,
    markNodeDirty,
    setUiError,
    selectedModelNodeIds,
    selectedInstanceIds,
  }
}

describe('useModelDiagramInstances', () => {
  it('creates a note with diagram attrs and an undoable history command', () => {
    const { diagram, instances, historyCommands, markDiagramDirty } = createHarness()

    instances.createDiagramNote(40, 60)

    const note = diagram.value.parsedAttrs.instances.nodes[0]!
    expect(note).toMatchObject({
      x: 40,
      y: 60,
      width: 220,
      height: 120,
      attrs: { isNote: true, noteText: 'translated:models.newNoteText' },
    })
    expect(note.modelNodeId).toMatch(/^__diagram-note__:/)
    expect(historyCommands).toHaveLength(1)
    expect(markDiagramDirty).toHaveBeenCalledWith('diagram-1')

    historyCommands[0]!.undo()
    expect(diagram.value.parsedAttrs.instances.nodes).toHaveLength(0)
  })

  it('creates a container with transparent dashed style', () => {
    const { diagram, instances } = createHarness()

    instances.createDiagramContainer(10, 20)

    const container = diagram.value.parsedAttrs.instances.nodes[0]!
    expect(container).toMatchObject({
      x: 10,
      y: 20,
      width: 240,
      height: 160,
      attrs: {
        isContainer: true,
        diagramStyle: {
          fillColor: 'rgba(0,0,0,0)',
          lineDash: [6, 4],
        },
      },
    })
    expect(container.modelNodeId).toMatch(/^__diagram-container__:/)
  })

  it('adds an existing node with its component dimensions', () => {
    const state = createState()
    state.components = [state.components[0]!]
    const { diagram, instances, markNodeDirty } = createHarness(state)

    instances.addExistingNodeToDiagram('existing-node', 15, 25)

    expect(diagram.value.parsedAttrs.instances.nodes[0]).toMatchObject({
      modelNodeId: 'existing-node',
      x: 15,
      y: 25,
      width: 200,
      height: 80,
      attrs: { notationComponentId: 'component-1' },
    })
    expect(markNodeDirty).toHaveBeenCalledWith('existing-node')
  })

  it('creates a palette node and its diagram instance in one history command', () => {
    const { state, diagram, instances, historyCommands } = createHarness()

    instances.createNodeFromPaletteComponent('component-1', 75, 95)

    expect(state.value.nodes).toHaveLength(2)
    expect(state.value.nodes[1]).toMatchObject({
      name: 'Component 1',
      nodeTypeId: 'type-1',
      parentNodeId: 'parent-node',
      _isNew: true,
      parsedAttrs: {
        notationComponents: { 'notation-1': { componentId: 'component-1' } },
      },
    })
    expect(diagram.value.parsedAttrs.instances.nodes[0]).toMatchObject({
      x: 75,
      y: 95,
      attrs: { notationComponentId: 'component-1' },
    })

    historyCommands[0]!.undo()
    expect(state.value.nodes).toHaveLength(1)
    expect(diagram.value.parsedAttrs.instances.nodes).toHaveLength(0)
  })

  it('defers an existing-node placement until the selected component is finalized', () => {
    const { diagram, instances } = createHarness()

    instances.addExistingNodeToDiagram('existing-node', 10, 20)

    expect(instances.showComponentChoiceModal.value).toBe(true)
    expect(diagram.value.parsedAttrs.instances.nodes).toHaveLength(0)

    instances.finalizeComponentChoiceForDiagram('component-2')

    expect(instances.showComponentChoiceModal.value).toBe(false)
    expect(diagram.value.parsedAttrs.instances.nodes).toHaveLength(1)
    expect(diagram.value.parsedAttrs.instances.nodes[0]?.modelNodeId).toBe('existing-node')
    expect(diagram.value.parsedAttrs.instances.nodes[0]?.attrs?.notationComponentId).toBe(
      'component-2',
    )
  })

  it('asks again on second drop so two instances can use different visuals', () => {
    const { state, diagram, instances } = createHarness()
    state.value.nodes[0]!.parsedAttrs.notationComponents['notation-1'] = {
      componentId: 'component-1',
    }

    instances.addExistingNodeToDiagram('existing-node', 10, 20)
    expect(instances.showComponentChoiceModal.value).toBe(true)
    instances.finalizeComponentChoiceForDiagram('component-1')

    instances.addExistingNodeToDiagram('existing-node', 40, 50)
    expect(instances.showComponentChoiceModal.value).toBe(true)
    instances.finalizeComponentChoiceForDiagram('component-2')

    expect(diagram.value.parsedAttrs.instances.nodes).toHaveLength(2)
    expect(diagram.value.parsedAttrs.instances.nodes[0]?.attrs?.notationComponentId).toBe(
      'component-1',
    )
    expect(diagram.value.parsedAttrs.instances.nodes[1]?.attrs?.notationComponentId).toBe(
      'component-2',
    )
  })

  it('bindInstanceComponent changes only the selected instance visual', () => {
    const { state, diagram, instances, markDiagramDirty } = createHarness()
    state.value.nodes[0]!.parsedAttrs.notationComponents['notation-1'] = {
      componentId: 'component-1',
    }
    diagram.value.parsedAttrs.instances.nodes.push(
      {
        id: 'inst-a',
        modelNodeId: 'existing-node',
        x: 0,
        y: 0,
        attrs: { notationComponentId: 'component-1' },
      },
      {
        id: 'inst-b',
        modelNodeId: 'existing-node',
        x: 20,
        y: 20,
        attrs: { notationComponentId: 'component-1' },
      },
    )

    instances.bindInstanceComponent('inst-b', 'component-2')

    expect(diagram.value.parsedAttrs.instances.nodes[0]?.attrs?.notationComponentId).toBe(
      'component-1',
    )
    expect(diagram.value.parsedAttrs.instances.nodes[1]?.attrs?.notationComponentId).toBe(
      'component-2',
    )
    expect(state.value.nodes[0]!.parsedAttrs.notationComponents['notation-1']?.componentId).toBe(
      'component-1',
    )
    expect(markDiagramDirty).toHaveBeenCalledWith('diagram-1')
  })

  it('copies selected notes and pastes independent offset instances', () => {
    const { diagram, instances, selectedInstanceIds, selectedModelNodeIds } = createHarness()
    diagram.value.parsedAttrs.instances.nodes.push({
      id: 'note-1',
      modelNodeId: '__diagram-note__:note-1',
      x: 10,
      y: 20,
      attrs: { isNote: true, noteText: 'Hello' },
    })
    selectedInstanceIds.value = ['note-1']

    expect(instances.copySelectedNotesToClipboard()).toBe(true)
    expect(instances.pasteCopiedNotes()).toBe(true)

    const pasted = diagram.value.parsedAttrs.instances.nodes[1]!
    expect(pasted).toMatchObject({ x: 34, y: 44, attrs: { isNote: true, noteText: 'Hello' } })
    expect(pasted.id).not.toBe('note-1')
    expect(pasted.modelNodeId).not.toBe('__diagram-note__:note-1')
    expect(selectedModelNodeIds.value).toEqual([pasted.modelNodeId])
    expect(selectedInstanceIds.value).toEqual([pasted.id])
  })
})
