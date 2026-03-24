import { describe, expect, it } from 'vitest'
import type { BatchConflictItem } from '../composables'
import { createEmptyModelEditorState } from '../types'
import {
  buildConflictCompareRows,
  computeMissingServerLinksOnCanvas,
  filterConflictCompareRowsForUi,
} from './batchSaveConflictDisplay'

describe('buildConflictCompareRows', () => {
  it('builds node field rows with pending server', () => {
    const st = createEmptyModelEditorState()
    const nodeId = '11111111-1111-1111-1111-111111111111'
    st.nodes.push({
      id: nodeId,
      name: 'Local',
      modelId: 'm',
      ownerId: 'o',
      nodeTypeId: 't1',
      parentNodeId: null,
      parsedAttrs: {
        treeOrder: 0,
        typeProperties: { a: 1 },
        componentProperties: {},
        notationComponents: {},
      },
      updatedAt: '2020-01-02T00:00:00Z',
    })
    const c: BatchConflictItem = {
      kind: 'node',
      id: nodeId,
      serverUpdatedAt: '2020-01-03T00:00:00Z',
      clientBaseUpdatedAt: '2020-01-01T00:00:00Z',
    }
    const rows = buildConflictCompareRows(c, st, null, true, null)
    expect(rows.some(r => r.field === 'name' && r.local === 'Local' && r.server === '…')).toBe(true)
    expect(rows.some(r => r.field.startsWith('attrs.') && r.differs)).toBe(true)
  })

  it('differs name when server loaded', () => {
    const st = createEmptyModelEditorState()
    const nodeId = '22222222-2222-2222-2222-222222222222'
    st.nodes.push({
      id: nodeId,
      name: 'Local',
      modelId: 'm',
      ownerId: 'o',
      nodeTypeId: 't1',
      parentNodeId: null,
      parsedAttrs: {
        treeOrder: 0,
        typeProperties: {},
        componentProperties: {},
        notationComponents: {},
      },
    })
    const c: BatchConflictItem = {
      kind: 'node',
      id: nodeId,
      serverUpdatedAt: '2020-01-03T00:00:00Z',
      clientBaseUpdatedAt: '2020-01-01T00:00:00Z',
    }
    const server = {
      id: nodeId,
      name: 'Server',
      modelId: 'm',
      ownerId: 'o',
      nodeTypeId: 't1',
      parentNodeId: null as string | null,
      attrs: '{}',
    }
    const rows = buildConflictCompareRows(c, st, server, false, null)
    const nameRow = rows.find(r => r.field === 'name')
    expect(nameRow?.local).toBe('Local')
    expect(nameRow?.server).toBe('Server')
    expect(nameRow?.differs).toBe(true)
  })
})

describe('diagram conflict semantic canvas rows', () => {
  it('shows position row instead of raw attrs.instances JSON', () => {
    const st = createEmptyModelEditorState()
    const nodeId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    const diagramId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    st.nodes.push({
      id: nodeId,
      name: 'Alpha',
      modelId: 'm',
      ownerId: 'o',
      nodeTypeId: 't1',
      parentNodeId: null,
      parsedAttrs: {
        treeOrder: 0,
        typeProperties: {},
        componentProperties: {},
        notationComponents: {},
      },
    })
    st.diagrams.push({
      id: diagramId,
      name: 'D',
      version: '1.0.0',
      ownerId: 'o',
      modelId: 'm',
      notationId: 'n1',
      nodeId: null,
      parsedAttrs: {
        instances: {
          nodes: [
            { id: 'i1', modelNodeId: nodeId, x: 1, y: 2, width: 10, height: 10 },
          ],
          edges: [],
        },
      },
    })
    const c: BatchConflictItem = {
      kind: 'diagram',
      id: diagramId,
      serverUpdatedAt: '2020-01-03T00:00:00Z',
      clientBaseUpdatedAt: '2020-01-01T00:00:00Z',
    }
    const server = {
      id: diagramId,
      name: 'D',
      version: '1.0.0',
      ownerId: 'o',
      modelId: 'm',
      notationId: 'n1',
      nodeId: null as string | null,
      attrs: JSON.stringify({
        instances: {
          nodes: [
            { id: 'i1', modelNodeId: nodeId, x: 9, y: 9, width: 10, height: 10 },
          ],
          edges: [],
        },
      }),
    }
    const rows = buildConflictCompareRows(c, st, server, false, null, (key: string) => key)
    const geom = rows.find(r => r.field.endsWith('.geom'))
    expect(geom?.local).toContain('(1, 2)')
    expect(geom?.server).toContain('(9, 9)')
    expect(rows.some(r => r.field.startsWith('attrs.instances'))).toBe(false)
  })

  it('when model link was dropped from state, edge row label uses canvas endpoints and missing-link hint', () => {
    const st = createEmptyModelEditorState()
    const na = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    const nb = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    const linkId = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
    const diagramId = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
    const node = (id: string, name: string) => ({
      id,
      name,
      modelId: 'm',
      ownerId: 'o',
      nodeTypeId: 't1',
      parentNodeId: null as string | null,
      parsedAttrs: {
        treeOrder: 0,
        typeProperties: {},
        componentProperties: {},
        notationComponents: {},
      },
    })
    st.nodes.push(node(na, 'Alpha'), node(nb, 'Beta'))
    st.diagrams.push({
      id: diagramId,
      name: 'D',
      version: '1.0.0',
      ownerId: 'o',
      modelId: 'm',
      notationId: 'n1',
      nodeId: null,
      parsedAttrs: {
        instances: {
          nodes: [
            { id: 'i1', modelNodeId: na, x: 0, y: 0, width: 10, height: 10 },
            { id: 'i2', modelNodeId: nb, x: 50, y: 0, width: 10, height: 10 },
          ],
          edges: [
            {
              id: 'e1',
              modelLinkId: linkId,
              sourceInstanceId: 'i1',
              targetInstanceId: 'i2',
            },
          ],
        },
      },
    })
    const c: BatchConflictItem = {
      kind: 'diagram',
      id: diagramId,
      serverUpdatedAt: '2020-01-03T00:00:00Z',
      clientBaseUpdatedAt: '2020-01-01T00:00:00Z',
    }
    const server = {
      id: diagramId,
      name: 'D',
      version: '1.0.0',
      ownerId: 'o',
      modelId: 'm',
      notationId: 'n1',
      nodeId: null as string | null,
      attrs: JSON.stringify({
        instances: {
          nodes: [
            { id: 'i1', modelNodeId: na, x: 0, y: 0, width: 10, height: 10 },
            { id: 'i2', modelNodeId: nb, x: 50, y: 0, width: 10, height: 10 },
          ],
          edges: [],
        },
      }),
    }
    const fakeT = (key: string, params?: Record<string, string | number>): string => {
      if (key === 'models.batchSaveConflictDiagramEdgeOnlyLocal' && params?.link != null) {
        return `ONLY_LOCAL|${String(params.link)}`
      }
      if (params && Object.keys(params).length > 0) {
        return `${key}|${JSON.stringify(params)}`
      }
      return key
    }
    const rows = buildConflictCompareRows(c, st, server, false, null, fakeT)
    const edgeRow = rows.find(r => r.field.endsWith('.onlyLocal'))
    expect(edgeRow?.fieldLabel).toContain('ONLY_LOCAL')
    expect(edgeRow?.fieldLabel).toContain('Alpha')
    expect(edgeRow?.fieldLabel).toContain('Beta')
    expect(edgeRow?.fieldLabel).toContain('batchSaveConflictDiagramEdgeLinkMissingHint')
  })

  it('when edge exists in both diagram JSON copies but model link is gone from state, shows orphan row', () => {
    const st = createEmptyModelEditorState()
    const na = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    const nb = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    const linkId = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
    const diagramId = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
    const node = (id: string, name: string) => ({
      id,
      name,
      modelId: 'm',
      ownerId: 'o',
      nodeTypeId: 't1',
      parentNodeId: null as string | null,
      parsedAttrs: {
        treeOrder: 0,
        typeProperties: {},
        componentProperties: {},
        notationComponents: {},
      },
    })
    st.nodes.push(node(na, 'Alpha'), node(nb, 'Beta'))
    const sharedEdge = {
      id: 'e1',
      modelLinkId: linkId,
      sourceInstanceId: 'i1',
      targetInstanceId: 'i2',
    }
    const instances = {
      nodes: [
        { id: 'i1', modelNodeId: na, x: 0, y: 0, width: 10, height: 10 },
        { id: 'i2', modelNodeId: nb, x: 50, y: 0, width: 10, height: 10 },
      ],
      edges: [sharedEdge],
    }
    st.diagrams.push({
      id: diagramId,
      name: 'D',
      version: '1.0.0',
      ownerId: 'o',
      modelId: 'm',
      notationId: 'n1',
      nodeId: null,
      parsedAttrs: { instances },
    })
    const c: BatchConflictItem = {
      kind: 'diagram',
      id: diagramId,
      serverUpdatedAt: '2020-01-03T00:00:00Z',
      clientBaseUpdatedAt: '2020-01-01T00:00:00Z',
    }
    const server = {
      id: diagramId,
      name: 'D',
      version: '1.0.0',
      ownerId: 'o',
      modelId: 'm',
      notationId: 'n1',
      nodeId: null as string | null,
      attrs: JSON.stringify({ instances }),
    }
    const rows = buildConflictCompareRows(c, st, server, false, null, (key: string) => key)
    expect(rows.some(r => r.field.endsWith('.orphanNoModelLink'))).toBe(true)
    expect(rows.some(r => r.field.endsWith('.onlyLocal'))).toBe(false)
  })
})

describe('computeMissingServerLinksOnCanvas', () => {
  it('lists diagram edges whose modelLinkId is not on server', () => {
    const st = createEmptyModelEditorState()
    const na = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    const nb = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    const linkId = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
    const diagramId = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
    st.nodes.push(
      {
        id: na,
        name: 'A',
        modelId: 'm',
        ownerId: 'o',
        nodeTypeId: 't',
        parentNodeId: null,
        parsedAttrs: {
          treeOrder: 0,
          typeProperties: {},
          componentProperties: {},
          notationComponents: {},
        },
      },
      {
        id: nb,
        name: 'B',
        modelId: 'm',
        ownerId: 'o',
        nodeTypeId: 't',
        parentNodeId: null,
        parsedAttrs: {
          treeOrder: 0,
          typeProperties: {},
          componentProperties: {},
          notationComponents: {},
        },
      }
    )
    st.diagrams.push({
      id: diagramId,
      name: 'D1',
      version: '1.0.0',
      ownerId: 'o',
      modelId: 'm',
      notationId: 'n1',
      nodeId: null,
      parsedAttrs: {
        instances: {
          nodes: [
            { id: 'i1', modelNodeId: na, x: 0, y: 0, width: 10, height: 10 },
            { id: 'i2', modelNodeId: nb, x: 50, y: 0, width: 10, height: 10 },
          ],
          edges: [{ id: 'e1', modelLinkId: linkId, sourceInstanceId: 'i1', targetInstanceId: 'i2' }],
        },
      },
    })
    st.links.push({
      id: linkId,
      sourceId: na,
      targetId: nb,
      modelId: 'm',
      ownerId: 'o',
      linkTypeId: 'lt1',
      parsedAttrs: { notationRelations: {}, relationProperties: {} },
    })
    const serverIds = new Set<string>()
    const rows = computeMissingServerLinksOnCanvas(st, serverIds)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.diagramNames).toEqual(['D1'])
    expect(rows[0]?.edgeSummary).toContain('A')
    expect(rows[0]?.edgeSummary).toContain('B')
  })

  it('merges the same missing modelLinkId across several diagrams into one row', () => {
    const st = createEmptyModelEditorState()
    const na = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    const nb = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    const linkId = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
    const mkDiagram = (id: string, name: string, i1: string, i2: string) => ({
      id,
      name,
      version: '1.0.0',
      ownerId: 'o',
      modelId: 'm',
      notationId: 'n1',
      nodeId: null as string | null,
      parsedAttrs: {
        instances: {
          nodes: [
            { id: i1, modelNodeId: na, x: 0, y: 0, width: 10, height: 10 },
            { id: i2, modelNodeId: nb, x: 50, y: 0, width: 10, height: 10 },
          ],
          edges: [
            {
              id: `e-${id}`,
              modelLinkId: linkId,
              sourceInstanceId: i1,
              targetInstanceId: i2,
            },
          ],
        },
      },
    })
    st.nodes.push(
      {
        id: na,
        name: 'A',
        modelId: 'm',
        ownerId: 'o',
        nodeTypeId: 't',
        parentNodeId: null,
        parsedAttrs: {
          treeOrder: 0,
          typeProperties: {},
          componentProperties: {},
          notationComponents: {},
        },
      },
      {
        id: nb,
        name: 'B',
        modelId: 'm',
        ownerId: 'o',
        nodeTypeId: 't',
        parentNodeId: null,
        parsedAttrs: {
          treeOrder: 0,
          typeProperties: {},
          componentProperties: {},
          notationComponents: {},
        },
      }
    )
    st.diagrams.push(
      mkDiagram('d1111111-1111-1111-1111-111111111111', 'Diag2', 'ia1', 'ia2'),
      mkDiagram('d2222222-2222-2222-2222-222222222222', 'Diag1', 'ib1', 'ib2')
    )
    st.links.push({
      id: linkId,
      sourceId: na,
      targetId: nb,
      modelId: 'm',
      ownerId: 'o',
      linkTypeId: 'lt1',
      parsedAttrs: { notationRelations: {}, relationProperties: {} },
    })
    const rows = computeMissingServerLinksOnCanvas(st, new Set())
    expect(rows).toHaveLength(1)
    expect(rows[0]?.diagramNames).toEqual(['Diag1', 'Diag2'])
    expect(rows[0]?.modelLinkId).toBe(linkId)
  })

  it('onlyDiagramId limits the row to edges on that diagram', () => {
    const st = createEmptyModelEditorState()
    const na = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    const nb = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    const linkId = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
    const mkDiagram = (id: string, name: string, i1: string, i2: string) => ({
      id,
      name,
      version: '1.0.0',
      ownerId: 'o',
      modelId: 'm',
      notationId: 'n1',
      nodeId: null as string | null,
      parsedAttrs: {
        instances: {
          nodes: [
            { id: i1, modelNodeId: na, x: 0, y: 0, width: 10, height: 10 },
            { id: i2, modelNodeId: nb, x: 50, y: 0, width: 10, height: 10 },
          ],
          edges: [
            {
              id: `e-${id}`,
              modelLinkId: linkId,
              sourceInstanceId: i1,
              targetInstanceId: i2,
            },
          ],
        },
      },
    })
    st.nodes.push(
      {
        id: na,
        name: 'A',
        modelId: 'm',
        ownerId: 'o',
        nodeTypeId: 't',
        parentNodeId: null,
        parsedAttrs: {
          treeOrder: 0,
          typeProperties: {},
          componentProperties: {},
          notationComponents: {},
        },
      },
      {
        id: nb,
        name: 'B',
        modelId: 'm',
        ownerId: 'o',
        nodeTypeId: 't',
        parentNodeId: null,
        parsedAttrs: {
          treeOrder: 0,
          typeProperties: {},
          componentProperties: {},
          notationComponents: {},
        },
      }
    )
    st.diagrams.push(
      mkDiagram('d1111111-1111-1111-1111-111111111111', 'Diag2', 'ia1', 'ia2'),
      mkDiagram('d2222222-2222-2222-2222-222222222222', 'Diag1', 'ib1', 'ib2')
    )
    st.links.push({
      id: linkId,
      sourceId: na,
      targetId: nb,
      modelId: 'm',
      ownerId: 'o',
      linkTypeId: 'lt1',
      parsedAttrs: { notationRelations: {}, relationProperties: {} },
    })
    const diag1Id = 'd2222222-2222-2222-2222-222222222222'
    const rows = computeMissingServerLinksOnCanvas(st, new Set(), undefined, diag1Id)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.diagramNames).toEqual(['Diag1'])
    expect(rows[0]?.modelLinkId).toBe(linkId)
  })

  it('uses node type for empty name and adds type in parens for short names', () => {
    const st = createEmptyModelEditorState()
    const na = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    const nb = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    const linkId = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
    const diagramId = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
    st.nodeTypes.push(
      { id: 'nt-comp', name: 'Компонент', ownerId: 'o' },
      { id: 'nt-srv', name: 'Сервис', ownerId: 'o' }
    )
    st.linkTypes.push({ id: 'lt-dep', name: 'Зависимость', ownerId: 'o' })
    st.nodes.push(
      {
        id: na,
        name: '',
        modelId: 'm',
        ownerId: 'o',
        nodeTypeId: 'nt-comp',
        parentNodeId: null,
        parsedAttrs: {
          treeOrder: 0,
          typeProperties: {},
          componentProperties: {},
          notationComponents: {},
        },
      },
      {
        id: nb,
        name: '45',
        modelId: 'm',
        ownerId: 'o',
        nodeTypeId: 'nt-srv',
        parentNodeId: null,
        parsedAttrs: {
          treeOrder: 0,
          typeProperties: {},
          componentProperties: {},
          notationComponents: {},
        },
      }
    )
    st.diagrams.push({
      id: diagramId,
      name: 'D1',
      version: '1.0.0',
      ownerId: 'o',
      modelId: 'm',
      notationId: 'n1',
      nodeId: null,
      parsedAttrs: {
        instances: {
          nodes: [
            { id: 'i1', modelNodeId: na, x: 0, y: 0, width: 10, height: 10 },
            { id: 'i2', modelNodeId: nb, x: 50, y: 0, width: 10, height: 10 },
          ],
          edges: [{ id: 'e1', modelLinkId: linkId, sourceInstanceId: 'i1', targetInstanceId: 'i2' }],
        },
      },
    })
    st.links.push({
      id: linkId,
      sourceId: na,
      targetId: nb,
      modelId: 'm',
      ownerId: 'o',
      linkTypeId: 'lt-dep',
      parsedAttrs: { notationRelations: {}, relationProperties: {} },
    })
    const rows = computeMissingServerLinksOnCanvas(st, new Set())
    expect(rows).toHaveLength(1)
    expect(rows[0]?.edgeSummary).toContain('Компонент')
    expect(rows[0]?.edgeSummary).toContain('45')
    expect(rows[0]?.edgeSummary).toContain('Сервис')
    expect(rows[0]?.edgeSummary).toContain('Зависимость')
  })

  it('skips edges when an instance endpoint is not a current model tree node (stale canvas JSON)', () => {
    const st = createEmptyModelEditorState()
    const na = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    const nb = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    const ghost = '99999999-9999-9999-9999-999999999999'
    const linkOk = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
    const linkJunk = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
    const linkMixed = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
    st.nodes.push(
      {
        id: na,
        name: 'A',
        modelId: 'm',
        ownerId: 'o',
        nodeTypeId: 't',
        parentNodeId: null,
        parsedAttrs: {
          treeOrder: 0,
          typeProperties: {},
          componentProperties: {},
          notationComponents: {},
        },
      },
      {
        id: nb,
        name: 'B',
        modelId: 'm',
        ownerId: 'o',
        nodeTypeId: 't',
        parentNodeId: null,
        parsedAttrs: {
          treeOrder: 0,
          typeProperties: {},
          componentProperties: {},
          notationComponents: {},
        },
      }
    )
    st.diagrams.push({
      id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
      name: 'D',
      version: '1.0.0',
      ownerId: 'o',
      modelId: 'm',
      notationId: 'n1',
      nodeId: null,
      parsedAttrs: {
        instances: {
          nodes: [
            { id: 'i1', modelNodeId: na, x: 0, y: 0, width: 10, height: 10 },
            { id: 'i2', modelNodeId: nb, x: 50, y: 0, width: 10, height: 10 },
            { id: 'ig', modelNodeId: ghost, x: 0, y: 0, width: 10, height: 10 },
          ],
          edges: [
            { id: 'e1', modelLinkId: linkOk, sourceInstanceId: 'i1', targetInstanceId: 'i2' },
            { id: 'e2', modelLinkId: linkJunk, sourceInstanceId: 'ig', targetInstanceId: 'ig' },
            { id: 'e3', modelLinkId: linkMixed, sourceInstanceId: 'i1', targetInstanceId: 'ig' },
          ],
        },
      },
    })
    st.links.push({
      id: linkOk,
      sourceId: na,
      targetId: nb,
      modelId: 'm',
      ownerId: 'o',
      linkTypeId: 'lt',
      parsedAttrs: { notationRelations: {}, relationProperties: {} },
    })
    const rows = computeMissingServerLinksOnCanvas(st, new Set())
    expect(rows).toHaveLength(1)
    expect(rows[0]?.edgeSummary).toContain('A')
    expect(rows[0]?.edgeSummary).toContain('B')
  })

  it('returns nothing when server still has the link id', () => {
    const st = createEmptyModelEditorState()
    const linkId = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
    st.diagrams.push({
      id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      name: 'D',
      version: '1.0.0',
      ownerId: 'o',
      modelId: 'm',
      notationId: 'n1',
      nodeId: null,
      parsedAttrs: {
        instances: {
          nodes: [],
          edges: [
            {
              id: 'e1',
              modelLinkId: linkId,
              sourceInstanceId: 'i1',
              targetInstanceId: 'i2',
            },
          ],
        },
      },
    })
    expect(computeMissingServerLinksOnCanvas(st, new Set([linkId]))).toHaveLength(0)
  })
})

describe('filterConflictCompareRowsForUi', () => {
  it('drops timestamp rows and equal fields', () => {
    const rows = [
      {
        field: 'timestamps.clientBaseUpdatedAt',
        local: 'a',
        server: 'b',
        differs: true,
      },
      { field: 'name', local: 'X', server: 'X', differs: false },
      { field: 'attrs.treeOrder', local: '0', server: '1', differs: true },
    ]
    const out = filterConflictCompareRowsForUi(rows)
    expect(out.map(r => r.field)).toEqual(['attrs.treeOrder'])
  })
})
