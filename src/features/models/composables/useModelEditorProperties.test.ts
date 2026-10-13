import { computed, effectScope, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseDiagramAttrs, parseLinkAttrs, parseNodeAttrs } from '../modelAttrs'
import { createEmptyModelEditorState, type EditorLink, type EditorNode } from '../types'
import { useModelEditorProperties } from './useModelEditorProperties'

function createNode(overrides: Partial<EditorNode> = {}): EditorNode {
  return {
    id: 'n-1',
    name: 'Node',
    modelId: 'm-1',
    ownerId: 'o-1',
    nodeTypeId: 'nt-1',
    parentNodeId: null,
    parsedAttrs: parseNodeAttrs(null),
    ...overrides,
  }
}

function createLink(overrides: Partial<EditorLink> = {}): EditorLink {
  return {
    id: 'l-1',
    sourceId: 'n-1',
    targetId: 'n-2',
    modelId: 'm-1',
    ownerId: 'o-1',
    linkTypeId: 'lt-1',
    parsedAttrs: parseLinkAttrs(null),
    ...overrides,
  }
}

describe('useModelEditorProperties', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('setNodeTypePropertyValue updates typeProperties and records history', () => {
    const scope = effectScope()
    scope.run(() => {
      const node = createNode()
      node.parsedAttrs.typeProperties = { status: 'draft' }
      const state = ref({
        ...createEmptyModelEditorState(),
        modelId: 'm-1',
        nodes: [node],
      })
      const markNodeDirty = vi.fn()
      const recordDiagramHistory = vi.fn()

      const api = useModelEditorProperties({
        state,
        activeDiagram: computed(() => null),
        activeNotationId: computed(() => null),
        selectedNode: computed(() => node),
        selectedLink: computed(() => null),
        selectedNodeInstanceId: ref(null),
        selectedLinkEdgeInstanceId: ref(null),
        markNodeDirty,
        markLinkDirty: vi.fn(),
        markDiagramDirty: vi.fn(),
        recordDiagramHistory,
        applyEdgeInstanceStyleSnapshot: vi.fn(),
      })

      api.setNodeTypePropertyValue('status', 'published')

      expect(node.parsedAttrs.typeProperties.status).toBe('published')
      expect(markNodeDirty).toHaveBeenCalledWith('n-1')
      expect(recordDiagramHistory).toHaveBeenCalledWith(
        'nodeType:n-1',
        expect.objectContaining({ execute: expect.any(Function), undo: expect.any(Function) })
      )
    })
    scope.stop()
  })

  it('setLinkTypePropertyValue is a no-op when value is unchanged', () => {
    const scope = effectScope()
    scope.run(() => {
      const link = createLink()
      link.parsedAttrs.typeProperties = { weight: 1 }
      const state = ref({
        ...createEmptyModelEditorState(),
        links: [link],
      })
      const markLinkDirty = vi.fn()
      const recordDiagramHistory = vi.fn()

      const api = useModelEditorProperties({
        state,
        activeDiagram: computed(() => null),
        activeNotationId: computed(() => null),
        selectedNode: computed(() => null),
        selectedLink: computed(() => link),
        selectedNodeInstanceId: ref(null),
        selectedLinkEdgeInstanceId: ref(null),
        markNodeDirty: vi.fn(),
        markLinkDirty,
        markDiagramDirty: vi.fn(),
        recordDiagramHistory,
        applyEdgeInstanceStyleSnapshot: vi.fn(),
      })

      api.setLinkTypePropertyValue('weight', 1)

      expect(markLinkDirty).not.toHaveBeenCalled()
      expect(recordDiagramHistory).not.toHaveBeenCalled()
    })
    scope.stop()
  })

  it('diagramsForProps lists non-deleted diagrams with labels', () => {
    const scope = effectScope()
    scope.run(() => {
      const state = ref({
        ...createEmptyModelEditorState(),
        diagrams: [
          {
            id: 'd-1',
            name: 'Main',
            version: '1.0.0',
            notationId: 'n-1',
            modelId: 'm-1',
            ownerId: 'o-1',
            nodeId: null,
            parsedAttrs: parseDiagramAttrs(null),
          },
          {
            id: 'd-2',
            name: 'Trash',
            version: '0.1.0',
            notationId: 'n-1',
            modelId: 'm-1',
            ownerId: 'o-1',
            nodeId: null,
            parsedAttrs: parseDiagramAttrs(null),
            _isDeleted: true,
          },
        ],
      })

      const api = useModelEditorProperties({
        state,
        activeDiagram: computed(() => null),
        activeNotationId: computed(() => null),
        selectedNode: computed(() => null),
        selectedLink: computed(() => null),
        selectedNodeInstanceId: ref(null),
        selectedLinkEdgeInstanceId: ref(null),
        markNodeDirty: vi.fn(),
        markLinkDirty: vi.fn(),
        markDiagramDirty: vi.fn(),
        recordDiagramHistory: vi.fn(),
        applyEdgeInstanceStyleSnapshot: vi.fn(),
      })

      expect(api.diagramsForProps.value).toEqual([{ id: 'd-1', label: 'Main 1.0.0' }])
    })
    scope.stop()
  })

  it('writes notation properties of auto-created nodes onto the diagram instance, not node attrs', () => {
    const scope = effectScope()
    scope.run(() => {
      const node = createNode({
        parsedAttrs: parseNodeAttrs(
          JSON.stringify({
            dpc: { autoCreated: true },
            typeProperties: { autoCreated: true, Owner: 'ACME' },
            notationComponents: { 'not-1': { componentId: 'cmp-1' } },
          })
        ),
      })
      const diagram = {
        id: 'd-1',
        name: 'Main',
        version: '1.0.0',
        notationId: 'not-1',
        modelId: 'm-1',
        ownerId: 'o-1',
        nodeId: null,
        parsedAttrs: parseDiagramAttrs(
          JSON.stringify({
            instances: {
              nodes: [{ id: 'inst-1', modelNodeId: 'n-1', x: 0, y: 0 }],
              edges: [],
            },
          })
        ),
      }
      const state = ref({
        ...createEmptyModelEditorState(),
        modelId: 'm-1',
        nodes: [node],
        diagrams: [diagram],
        components: [
          {
            id: 'cmp-1',
            name: 'Application',
            notationId: 'not-1',
            nodeTypeId: 'nt-1',
            version: '1.0.0',
            ownerId: 'o-1',
          },
        ],
      })
      const markDiagramDirty = vi.fn()
      const markNodeDirty = vi.fn()

      const api = useModelEditorProperties({
        state,
        activeDiagram: computed(() => diagram),
        activeNotationId: computed(() => 'not-1'),
        selectedNode: computed(() => node),
        selectedLink: computed(() => null),
        selectedNodeInstanceId: ref('inst-1'),
        selectedLinkEdgeInstanceId: ref(null),
        markNodeDirty,
        markLinkDirty: vi.fn(),
        markDiagramDirty,
        recordDiagramHistory: vi.fn(),
        applyEdgeInstanceStyleSnapshot: vi.fn(),
      })

      api.setNodeScopedValue('Alias', 'shown')

      expect(markDiagramDirty).toHaveBeenCalledWith('d-1')
      expect(markNodeDirty).not.toHaveBeenCalled()
      expect(node.parsedAttrs.componentProperties).toEqual({})
      expect(diagram.parsedAttrs.instances.nodes[0]?.attrs?.componentProperties).toMatchObject({
        'not-1': { 'cmp-1': { Alias: 'shown' } },
      })
    })
    scope.stop()
  })

  it('does not fall back to writing notation properties onto auto-created node attrs', () => {
    const scope = effectScope()
    scope.run(() => {
      const node = createNode({
        parsedAttrs: parseNodeAttrs(
          JSON.stringify({
            typeProperties: { autoCreated: true },
            notationComponents: { 'not-1': { componentId: 'cmp-1' } },
          })
        ),
      })
      const state = ref({
        ...createEmptyModelEditorState(),
        nodes: [node],
        components: [
          {
            id: 'cmp-1',
            name: 'Application',
            notationId: 'not-1',
            nodeTypeId: 'nt-1',
            version: '1.0.0',
            ownerId: 'o-1',
          },
        ],
      })
      const markNodeDirty = vi.fn()

      const api = useModelEditorProperties({
        state,
        activeDiagram: computed(() => null),
        activeNotationId: computed(() => 'not-1'),
        selectedNode: computed(() => node),
        selectedLink: computed(() => null),
        selectedNodeInstanceId: ref(null),
        selectedLinkEdgeInstanceId: ref(null),
        markNodeDirty,
        markLinkDirty: vi.fn(),
        markDiagramDirty: vi.fn(),
        recordDiagramHistory: vi.fn(),
        applyEdgeInstanceStyleSnapshot: vi.fn(),
      })

      api.setNodeScopedValue('Alias', 'shown')

      expect(markNodeDirty).not.toHaveBeenCalled()
      expect(node.parsedAttrs.componentProperties).toEqual({})
    })
    scope.stop()
  })
})
