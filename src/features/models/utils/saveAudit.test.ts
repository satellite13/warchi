import { describe, it, expect } from 'vitest'
import type { EditorDiagram, EditorLink, EditorNode, ModelEditorState } from '../types'
import type { DiagramAttrs, ModelLinkAttrs, ModelNodeAttrs } from '../modelAttrs'
import {
  applySaveAuditFix,
  isAutoCreatedNode,
  runModelSaveAudit,
  type SaveAuditFix,
} from './saveAudit'

const baseNodeAttrs = (): ModelNodeAttrs => ({
  treeOrder: 0,
  notationComponents: {},
  componentProperties: {},
  typeProperties: {},
})

const node = (overrides: Partial<EditorNode>): EditorNode => ({
  id: '',
  name: '',
  modelId: 'm1',
  ownerId: 'u1',
  nodeTypeId: 't1',
  parentNodeId: null,
  parsedAttrs: baseNodeAttrs(),
  ...overrides,
})

const link = (overrides: Partial<EditorLink>): EditorLink => ({
  id: '',
  sourceId: '',
  targetId: '',
  modelId: 'm1',
  ownerId: 'u1',
  linkTypeId: 'lt1',
  parsedAttrs: {
    notationRelations: {},
    relationProperties: {},
    typeProperties: {},
  } as ModelLinkAttrs,
  ...overrides,
})

const diagram = (overrides: Partial<EditorDiagram>): EditorDiagram => ({
  id: 'd1',
  name: 'Diagram',
  version: '1.0.0',
  modelId: 'm1',
  ownerId: 'u1',
  nodeId: null,
  notationId: 'n1',
  parsedAttrs: { instances: { nodes: [], edges: [] } } as DiagramAttrs,
  ...overrides,
})

const autoCreated = (overrides: Partial<EditorNode>): EditorNode =>
  node({
    parsedAttrs: {
      ...baseNodeAttrs(),
      dpc: { kind: 'appProduct', id: 'P1', autoCreated: true },
    },
    ...overrides,
  })

const makeState = (overrides: Partial<ModelEditorState>): ModelEditorState => ({
  modelId: 'm1',
  ownerId: 'u1',
  nodes: [],
  links: [],
  diagrams: [],
  notations: [],
  nodeTypes: [],
  linkTypes: [],
  components: [],
  relations: [],
  relationRules: [],
  ...overrides,
})

describe('runModelSaveAudit', () => {
  it('flags duplicate node names among siblings', () => {
    const state = makeState({
      nodes: [
        node({ id: 'n1', name: 'Service', parentNodeId: 'p1', _isNew: true }),
        node({ id: 'n2', name: 'service', parentNodeId: 'p1' }),
        node({ id: 'n3', name: 'Service', parentNodeId: 'p2' }),
      ],
    })
    const audit = runModelSaveAudit(state)
    const dupes = audit.issues.filter(i => i.kind === 'duplicateNodeName')
    expect(dupes).toHaveLength(1)
    expect(dupes[0]!.severity).toBe('block')
    expect(dupes[0]!.entityIds).toEqual(['n1'])
    expect(dupes[0]!.fix).toEqual({ kind: 'deleteNodes', nodeIds: ['n1'] })
  })

  it('does not flag same-name nodes under different parents', () => {
    const state = makeState({
      nodes: [
        node({ id: 'n1', name: 'Service', parentNodeId: 'p1', _isNew: true }),
        node({ id: 'n2', name: 'Service', parentNodeId: 'p2' }),
      ],
    })
    const audit = runModelSaveAudit(state)
    expect(audit.issues.filter(i => i.kind === 'duplicateNodeName')).toHaveLength(0)
  })

  it('does not flag untouched existing duplicates', () => {
    const state = makeState({
      nodes: [
        node({ id: 'n1', name: 'Service', parentNodeId: 'p1' }),
        node({ id: 'n2', name: 'service', parentNodeId: 'p1' }),
      ],
    })
    expect(runModelSaveAudit(state).issues).toHaveLength(0)
  })

  it('flags an auto-created conflict when a manual node matches the auto-created name', () => {
    const state = makeState({
      nodes: [
        autoCreated({ id: 'a1', name: 'Product', parentNodeId: 'p1' }),
        node({ id: 'm1', name: 'product', parentNodeId: 'p1', _isNew: true }),
      ],
    })
    const audit = runModelSaveAudit(state)
    const conflicts = audit.issues.filter(i => i.kind === 'autoCreatedConflict')
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]!.fix).toEqual({
      kind: 'reuseAutoCreated',
      keepNodeId: 'a1',
      dropNodeId: 'm1',
    })
    // The manual duplicate is NOT also reported as a generic duplicate node name.
    expect(audit.issues.filter(i => i.kind === 'duplicateNodeName')).toHaveLength(0)
  })

  it('prefers a non-archived auto-created node as the survivor across the model', () => {
    const state = makeState({
      nodes: [
        node({ id: 'arch', name: 'Archive', parentNodeId: null }),
        autoCreated({ id: 'live', name: 'Product', parentNodeId: 'folder' }),
        autoCreated({ id: 'archived', name: 'Product', parentNodeId: 'arch' }),
        node({ id: 'man', name: 'Product', parentNodeId: 'folder', _isNew: true }),
      ],
    })
    const audit = runModelSaveAudit(state)
    const conflicts = audit.issues.filter(i => i.kind === 'autoCreatedConflict')
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]!.fix).toEqual({
      kind: 'reuseAutoCreated',
      keepNodeId: 'live',
      dropNodeId: 'man',
    })
  })

  it('matches an auto-created node by sync id and by name part despite formatting', () => {
    const auto = (overrides: Partial<EditorNode>): EditorNode =>
      autoCreated({
        name: 'P0860 - QCMS',
        parsedAttrs: {
          ...baseNodeAttrs(),
          dpc: { kind: 'appProduct', id: 'p0860', autoCreated: true },
        },
        ...overrides,
      })

    // id + name separated by a space ("p0860 qcms")
    let state = makeState({
      nodes: [
        auto({ id: 'a1', parentNodeId: 'p1' }),
        node({ id: 'm1', name: 'p0860 qcms', _isNew: true }),
      ],
    })
    let conflicts = runModelSaveAudit(state).issues.filter(i => i.kind === 'autoCreatedConflict')
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]!.fix).toEqual({
      kind: 'reuseAutoCreated',
      keepNodeId: 'a1',
      dropNodeId: 'm1',
    })

    // just the sync id
    state = makeState({
      nodes: [
        auto({ id: 'a1', parentNodeId: 'p1' }),
        node({ id: 'm2', name: 'p0860', _isNew: true }),
      ],
    })
    conflicts = runModelSaveAudit(state).issues.filter(i => i.kind === 'autoCreatedConflict')
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]!.fix).toEqual({
      kind: 'reuseAutoCreated',
      keepNodeId: 'a1',
      dropNodeId: 'm2',
    })

    // just the display-name part
    state = makeState({
      nodes: [
        auto({ id: 'a1', parentNodeId: 'p1' }),
        node({ id: 'm3', name: 'QCMS', _isNew: true }),
      ],
    })
    conflicts = runModelSaveAudit(state).issues.filter(i => i.kind === 'autoCreatedConflict')
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]!.fix).toEqual({
      kind: 'reuseAutoCreated',
      keepNodeId: 'a1',
      dropNodeId: 'm3',
    })

    // unrelated manual node is NOT a conflict
    state = makeState({
      nodes: [
        auto({ id: 'a1', parentNodeId: 'p1' }),
        node({ id: 'm4', name: 'Order Service', _isNew: true }),
      ],
    })
    expect(
      runModelSaveAudit(state).issues.filter(i => i.kind === 'autoCreatedConflict')
    ).toHaveLength(0)
  })

  it('flags duplicate links (parallel edges)', () => {
    const state = makeState({
      nodes: [node({ id: 'a' }), node({ id: 'b' })],
      links: [
        link({ id: 'l1', sourceId: 'a', targetId: 'b', linkTypeId: 'lt1', _isNew: true }),
        link({ id: 'l2', sourceId: 'a', targetId: 'b', linkTypeId: 'lt1' }),
      ],
    })
    const audit = runModelSaveAudit(state)
    const dupes = audit.issues.filter(i => i.kind === 'duplicateLink')
    expect(dupes).toHaveLength(1)
    expect(dupes[0]!.fix).toEqual({ kind: 'deleteLinks', linkIds: ['l1'] })
  })

  it('flags a tree cycle', () => {
    const state = makeState({
      nodes: [
        node({ id: 'n1', name: 'A', parentNodeId: 'n3', _isDirty: true }),
        node({ id: 'n2', name: 'B', parentNodeId: 'n1' }),
        node({ id: 'n3', name: 'C', parentNodeId: 'n2' }),
      ],
    })
    const audit = runModelSaveAudit(state)
    expect(audit.issues.filter(i => i.kind === 'treeCycle')).toHaveLength(1)
  })

  it('flags broken link references', () => {
    const state = makeState({
      nodes: [node({ id: 'a' })],
      links: [link({ id: 'l1', sourceId: 'a', targetId: 'missing', _isNew: true })],
    })
    const audit = runModelSaveAudit(state)
    expect(audit.issues.filter(i => i.kind === 'brokenLinkRef')).toHaveLength(1)
  })

  it('flags stale diagram instances', () => {
    const state = makeState({
      nodes: [node({ id: 'a' })],
      diagrams: [
        diagram({
          id: 'd1',
          _isDirty: true,
          parsedAttrs: {
            instances: {
              nodes: [
                { id: 'i1', modelNodeId: 'a', x: 0, y: 0 },
                { id: 'i2', modelNodeId: 'ghost', x: 0, y: 0 },
              ],
              edges: [],
            },
          },
        }),
      ],
    })
    const audit = runModelSaveAudit(state)
    const stale = audit.issues.filter(i => i.kind === 'staleDiagramInstance')
    expect(stale).toHaveLength(1)
    expect(stale[0]!.fix).toEqual({
      kind: 'dropStaleInstances',
      diagramId: 'd1',
      nodeInstanceIds: ['i2'],
      edgeInstanceIds: [],
    })
  })

  it('does not flag diagram-only note/container/anchor instances or note edges as stale', () => {
    const state = makeState({
      nodes: [node({ id: 'a' })],
      diagrams: [
        diagram({
          id: 'd1',
          _isDirty: true,
          parsedAttrs: {
            instances: {
              nodes: [
                {
                  id: 'i-note',
                  modelNodeId: '__diagram-note__:n1',
                  x: 0,
                  y: 0,
                  attrs: { isNote: true },
                },
                {
                  id: 'i-container',
                  modelNodeId: '__diagram-container__:c1',
                  x: 0,
                  y: 0,
                  attrs: { isContainer: true },
                },
                {
                  id: 'i-anchor',
                  modelNodeId: '__diagram-edge-anchor__:e1',
                  x: 0,
                  y: 0,
                  attrs: { isEdgeAnchor: true },
                },
                { id: 'i-real', modelNodeId: 'a', x: 0, y: 0 },
                { id: 'i-ghost', modelNodeId: 'ghost', x: 0, y: 0 },
              ],
              edges: [
                {
                  id: 'e-note',
                  modelLinkId: '__diagram-note-edge__:x1',
                  sourceInstanceId: 'i-note',
                  targetInstanceId: 'i-real',
                },
                {
                  id: 'e-real',
                  modelLinkId: 'missing-link',
                  sourceInstanceId: 'i-real',
                  targetInstanceId: 'a',
                },
              ],
            },
          },
        }),
      ],
    })
    const audit = runModelSaveAudit(state)
    const stale = audit.issues.filter(i => i.kind === 'staleDiagramInstance')
    expect(stale).toHaveLength(1)
    expect(stale[0]!.params).toEqual({ name: 'Diagram', count: 2 })
    expect(stale[0]!.fix).toEqual({
      kind: 'dropStaleInstances',
      diagramId: 'd1',
      nodeInstanceIds: ['i-ghost'],
      edgeInstanceIds: ['e-real'],
    })
  })
})

describe('applySaveAuditFix', () => {
  it('reuseAutoCreated rebinds links and diagram instances, then drops the manual node', () => {
    const state = makeState({
      nodes: [
        autoCreated({ id: 'a1', name: 'Product', parentNodeId: 'p1' }),
        node({ id: 'm1', name: 'product', parentNodeId: 'p1' }),
      ],
      links: [link({ id: 'l1', sourceId: 'm1', targetId: 'x' })],
      diagrams: [
        diagram({
          parsedAttrs: {
            instances: {
              nodes: [{ id: 'i1', modelNodeId: 'm1', x: 0, y: 0 }],
              edges: [],
            },
          },
        }),
      ],
    })
    const fix: SaveAuditFix = { kind: 'reuseAutoCreated', keepNodeId: 'a1', dropNodeId: 'm1' }
    applySaveAuditFix(state, fix)
    expect(state.links[0]!.sourceId).toBe('a1')
    expect(state.diagrams[0]!.parsedAttrs.instances.nodes[0]!.modelNodeId).toBe('a1')
    expect(state.nodes.find(n => n.id === 'm1')!._isDeleted).toBe(true)
  })

  it('renameNode updates the node name and marks it dirty', () => {
    const state = makeState({ nodes: [node({ id: 'n1', name: 'Old' })] })
    applySaveAuditFix(state, { kind: 'renameNode', nodeId: 'n1', toName: 'New' })
    expect(state.nodes[0]!.name).toBe('New')
    expect(state.nodes[0]!._isDirty).toBe(true)
  })

  it('deleteNodes marks the node deleted', () => {
    const state = makeState({ nodes: [node({ id: 'n1' })] })
    applySaveAuditFix(state, { kind: 'deleteNodes', nodeIds: ['n1'] })
    expect(state.nodes[0]!._isDeleted).toBe(true)
  })

  it('dropStaleInstances removes only the stale instance', () => {
    const state = makeState({
      diagrams: [
        diagram({
          parsedAttrs: {
            instances: {
              nodes: [
                { id: 'i1', modelNodeId: 'a', x: 0, y: 0 },
                { id: 'i2', modelNodeId: 'ghost', x: 0, y: 0 },
              ],
              edges: [],
            },
          },
        }),
      ],
    })
    applySaveAuditFix(state, {
      kind: 'dropStaleInstances',
      diagramId: 'd1',
      nodeInstanceIds: ['i2'],
      edgeInstanceIds: [],
    })
    const nodes = state.diagrams[0]!.parsedAttrs.instances.nodes
    expect(nodes.map(n => n.id)).toEqual(['i1'])
  })
})

describe('isAutoCreatedNode', () => {
  it('detects auto-created via dpc or typeProperties marker', () => {
    expect(isAutoCreatedNode(autoCreated({ id: 'a1' }))).toBe(true)
    expect(
      isAutoCreatedNode(
        node({
          parsedAttrs: {
            ...baseNodeAttrs(),
            typeProperties: { autoCreated: true },
          },
        })
      )
    ).toBe(true)
    expect(isAutoCreatedNode(node({ id: 'n1' }))).toBe(false)
  })
})
