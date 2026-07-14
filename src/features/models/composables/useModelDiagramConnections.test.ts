import { computed, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { parseDiagramAttrs, parseLinkAttrs, parseNodeAttrs } from '../modelAttrs'
import type { EditorDiagram, ModelEditorState } from '../types'
import { useModelDiagramConnections } from './useModelDiagramConnections'

function createState(): ModelEditorState {
  return {
    modelId: 'model-1',
    ownerId: 'owner-1',
    nodes: [
      {
        id: 'source',
        name: 'Source',
        modelId: 'model-1',
        ownerId: 'owner-1',
        nodeTypeId: 'node-type',
        parentNodeId: null,
        parsedAttrs: {
          ...parseNodeAttrs(null),
          notationComponents: { notation: { componentId: 'source-component' } },
        },
      },
      {
        id: 'target',
        name: 'Target',
        modelId: 'model-1',
        ownerId: 'owner-1',
        nodeTypeId: 'node-type',
        parentNodeId: null,
        parsedAttrs: {
          ...parseNodeAttrs(null),
          notationComponents: { notation: { componentId: 'target-component' } },
        },
      },
    ],
    links: [],
    diagrams: [],
    notations: [],
    nodeTypes: [],
    linkTypes: [{ id: 'link-type', name: 'Influences' } as never],
    components: [
      { id: 'source-component', notationId: 'notation', nodeTypeId: 'node-type' } as never,
      { id: 'target-component', notationId: 'notation', nodeTypeId: 'node-type' } as never,
    ],
    relations: [
      {
        id: 'relation',
        name: 'Influences',
        notationId: 'notation',
        linkTypeId: 'link-type',
        attrs: null,
      } as never,
    ],
    relationRules: [{ fromComponentId: 'source-component', toComponentId: 'target-component', relationId: 'relation' } as never],
  }
}

function createHarness(stateValue = createState()) {
  const state = ref(stateValue)
  const isRelationRulesLoading = ref(false)
  const selectedModelLinkId = ref<string | null>(null)
  const selectedEdgeInstanceId = ref<string | null>(null)
  const selectedCanvasElementId = ref<string | null>(null)
  const historyCommands: Array<{ execute: () => void; undo: () => void }> = []
  const diagram = ref<EditorDiagram>({
    id: 'diagram',
    name: 'Diagram',
    version: '1.0.0',
    notationId: 'notation',
    modelId: 'model-1',
    ownerId: 'owner-1',
    nodeId: null,
    parsedAttrs: {
      ...parseDiagramAttrs(null),
      instances: {
        nodes: [
          { id: 'source-instance', modelNodeId: 'source', x: 0, y: 0 },
          { id: 'target-instance', modelNodeId: 'target', x: 100, y: 0 },
        ],
        edges: [],
      },
    },
  })
  const setUiError = vi.fn()
  const connections = useModelDiagramConnections({
    state,
    activeDiagram: computed(() => diagram.value),
    activeNotationId: computed(() => 'notation'),
    defaultEdgeType: computed(() => 'straight'),
    isRelationRulesLoading: computed(() => isRelationRulesLoading.value),
    isDiagramReadOnly: computed(() => false),
    isDiagramNoteModelNodeId: id => id.startsWith('__diagram-note__:'),
    isDirectoryNode: () => false,
    isDirectoryNoteInstanceId: () => false,
    executeDiagramHistoryCommand: command => {
      historyCommands.push(command)
      command.execute()
    },
    markDiagramDirty: vi.fn(),
    markLinkDirty: vi.fn(),
    bindLinkRelation: (link, relationId) => {
      link.parsedAttrs.notationRelations.notation = { relationId }
    },
    setUiError,
    t: key => `translated:${key}`,
    selectedModelLinkId,
    selectedEdgeInstanceId,
    selectedCanvasElementId,
  })

  return {
    state,
    diagram,
    setUiError,
    connections,
    isRelationRulesLoading,
    selectedModelLinkId,
    selectedEdgeInstanceId,
    selectedCanvasElementId,
    historyCommands,
  }
}

describe('useModelDiagramConnections', () => {
  it('creates a diagram-only edge for a note without creating a model link', () => {
    const { state, diagram, connections } = createHarness()

    connections.startConnectNodes(
      '__diagram-note__:note',
      'target',
      'note-instance',
      'target-instance'
    )

    expect(state.value.links).toHaveLength(0)
    expect(diagram.value.parsedAttrs.instances.edges).toHaveLength(1)
    expect(diagram.value.parsedAttrs.instances.edges[0]?.modelLinkId).toMatch(
      /^__diagram-note-edge__:/
    )
  })

  it('blocks typed connections when no relation rule allows the component pair', () => {
    const state = createState()
    state.relationRules = []
    const { diagram, setUiError, connections } = createHarness(state)

    connections.startConnectNodes('source', 'target', 'source-instance', 'target-instance')

    expect(setUiError).toHaveBeenCalledWith('translated:models.noAllowedRelationRules')
    expect(diagram.value.parsedAttrs.instances.edges).toHaveLength(0)
  })

  it('offers and reuses an existing matching model link', () => {
    const state = createState()
    state.links.push({
      id: 'existing-link',
      sourceId: 'source',
      targetId: 'target',
      modelId: 'model-1',
      ownerId: 'owner-1',
      linkTypeId: 'link-type',
      parsedAttrs: parseLinkAttrs(null),
    })
    const { diagram, connections } = createHarness(state)

    connections.startConnectNodes('source', 'target', 'source-instance', 'target-instance')

    expect(connections.showReuseLinkModal.value).toBe(true)
    expect(connections.reuseLinkOptions.value.map(link => link.id)).toEqual(['existing-link'])

    connections.handleSelectExistingLink('existing-link')

    expect(diagram.value.parsedAttrs.instances.edges[0]?.modelLinkId).toBe('existing-link')
    expect(connections.showReuseLinkModal.value).toBe(false)
  })

  it('creates a diagram-only edge from an untyped source component', () => {
    const state = createState()
    state.nodeTypes = [{ id: 'untyped-node', name: 'Diagram only' } as never]
    state.linkTypes = [{ id: 'untyped-link', name: 'Diagram only' } as never]
    state.components[0] = {
      id: 'source-component',
      notationId: 'notation',
      nodeTypeId: 'untyped-node',
    } as never
    state.relations[0] = {
      id: 'untyped-relation',
      name: 'Diagram only',
      notationId: 'notation',
      linkTypeId: 'untyped-link',
      attrs: null,
    } as never
    const { state: reactiveState, diagram, connections } = createHarness(state)

    connections.startConnectNodes('source', 'target', 'source-instance', 'target-instance')

    expect(reactiveState.value.links).toHaveLength(0)
    expect(diagram.value.parsedAttrs.instances.edges[0]?.modelLinkId).toMatch(
      /^__diagram-untyped-edge__:/
    )
  })

  it('blocks connection while relation rules are loading', () => {
    const { diagram, setUiError, connections, isRelationRulesLoading } = createHarness()
    isRelationRulesLoading.value = true

    connections.startConnectNodes('source', 'target', 'source-instance', 'target-instance')

    expect(setUiError).toHaveBeenCalledWith(
      'translated:models.relationRulesLoadingConnectBlocked'
    )
    expect(diagram.value.parsedAttrs.instances.edges).toHaveLength(0)
  })

  it('creates a typed model link when its only relation is allowed', () => {
    const { state, diagram, connections } = createHarness()

    connections.startConnectNodes('source', 'target', 'source-instance', 'target-instance')

    expect(state.value.links).toHaveLength(1)
    expect(state.value.links[0]).toMatchObject({ sourceId: 'source', targetId: 'target' })
    expect(diagram.value.parsedAttrs.instances.edges).toHaveLength(1)
  })

  it('opens relation choice for auto-link without an existing link', () => {
    const { connections } = createHarness()

    connections.handleRequestAutoLink(
      'source',
      'target',
      'source-instance',
      'target-instance',
      createState().relations,
      []
    )

    expect(connections.showRelationChoiceModal.value).toBe(true)
    expect(connections.relationChoiceOptions.value).toMatchObject([{ id: 'relation' }])
  })

  it('creates a new link after declining reuse', () => {
    const state = createState()
    state.links.push({
      id: 'existing-link',
      sourceId: 'source',
      targetId: 'target',
      modelId: 'model-1',
      ownerId: 'owner-1',
      linkTypeId: 'link-type',
      parsedAttrs: parseLinkAttrs(null),
    })
    const { state: reactiveState, connections } = createHarness(state)

    connections.startConnectNodes('source', 'target', 'source-instance', 'target-instance')
    connections.handleCreateNewLinkFromReuseModal()

    expect(reactiveState.value.links).toHaveLength(2)
    expect(reactiveState.value.links[1]?.id).not.toBe('existing-link')
  })

  it('clears note-edge selection when undoing its creation', () => {
    const {
      connections,
      selectedModelLinkId,
      selectedEdgeInstanceId,
      selectedCanvasElementId,
      historyCommands,
      diagram,
    } = createHarness()

    connections.startConnectNodes('__diagram-note__:note', 'target', 'note-instance', 'target-instance')
    const edge = diagram.value.parsedAttrs.instances.edges[0]!
    selectedModelLinkId.value = edge.modelLinkId
    selectedEdgeInstanceId.value = edge.id
    selectedCanvasElementId.value = `edge-${edge.id}`
    historyCommands[0]!.undo()

    expect(selectedModelLinkId.value).toBeNull()
    expect(selectedEdgeInstanceId.value).toBeNull()
    expect(selectedCanvasElementId.value).toBeNull()
  })
})
