import { describe, expect, it } from 'vitest'
import type { DiagramResponse, LinkResponse, NodeResponse } from '@/types/api'
import {
  buildNodePathMap,
  linkKey,
  compareNodes,
  compareLinks,
  compareDiagrams,
  computeModelDiff,
  buildDiagramDiffStateMaps,
} from '@/utils/modelDiff'

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

let _idCounter = 0
function uid(): string {
  return `id-${++_idCounter}`
}

function makeNode(overrides: Partial<NodeResponse> & { name: string }): NodeResponse {
  const { name, ...rest } = overrides
  return {
    id: uid(),
    name,
    modelId: 'm1',
    ownerId: 'o1',
    nodeTypeId: 'nt1',
    ...rest,
  }
}

function makeLink(
  overrides: Partial<LinkResponse> & { sourceId: string; targetId: string },
): LinkResponse {
  return {
    id: uid(),
    modelId: 'm1',
    ownerId: 'o1',
    linkTypeId: 'lt1',
    ...overrides,
  }
}

function makeDiagram(overrides: Partial<DiagramResponse> & { name: string }): DiagramResponse {
  const { name, ...rest } = overrides
  return {
    id: uid(),
    name,
    version: '1.0.0',
    modelId: 'm1',
    ownerId: 'o1',
    notationId: 'n1',
    ...rest,
  }
}

// ---------------------------------------------------------------------------
// buildNodePathMap
// ---------------------------------------------------------------------------

describe('buildNodePathMap', () => {
  it('returns empty map for empty list', () => {
    expect(buildNodePathMap([])).toEqual(new Map())
  })

  it('returns node name for root nodes', () => {
    const a = makeNode({ name: 'Root' })
    const map = buildNodePathMap([a])
    expect(map.get(a.id)).toBe('Root')
  })

  it('builds flat paths for sibling roots', () => {
    const a = makeNode({ name: 'A' })
    const b = makeNode({ name: 'B' })
    const map = buildNodePathMap([a, b])
    expect(map.get(a.id)).toBe('A')
    expect(map.get(b.id)).toBe('B')
  })

  it('builds nested paths for hierarchy', () => {
    const root = makeNode({ name: 'Root' })
    const child = makeNode({ name: 'Child', parentNodeId: root.id })
    const grandchild = makeNode({ name: 'Grandchild', parentNodeId: child.id })

    const map = buildNodePathMap([root, child, grandchild])
    expect(map.get(root.id)).toBe('Root')
    expect(map.get(child.id)).toBe('Root/Child')
    expect(map.get(grandchild.id)).toBe('Root/Child/Grandchild')
  })

  it('handles nodes provided in non-topological order', () => {
    const root = makeNode({ name: 'Root' })
    const child = makeNode({ name: 'Child', parentNodeId: root.id })
    // provide child before root
    const map = buildNodePathMap([child, root])
    expect(map.get(child.id)).toBe('Root/Child')
  })
})

// ---------------------------------------------------------------------------
// linkKey
// ---------------------------------------------------------------------------

describe('linkKey', () => {
  it('joins source, target, and linkTypeId with tab', () => {
    expect(linkKey('A', 'B', 'lt1')).toBe('A\tB\tlt1')
  })
})

// ---------------------------------------------------------------------------
// compareNodes
// ---------------------------------------------------------------------------

describe('compareNodes', () => {
  it('returns empty array for identical nodes', () => {
    const node = makeNode({ name: 'A' })
    const copy = { ...node }
    expect(compareNodes([node], [copy])).toEqual([])
  })

  it('detects added node', () => {
    const base = makeNode({ name: 'A' })
    const target1 = { ...base }
    const target2 = makeNode({ name: 'B' })
    const diff = compareNodes([base], [target1, target2])
    expect(diff).toHaveLength(1)
    expect(diff[0].kind).toBe('added')
    if (diff[0].kind === 'added') {
      expect(diff[0].path).toBe('B')
      expect(diff[0].node.id).toBe(target2.id)
    }
  })

  it('detects removed node', () => {
    const a = makeNode({ name: 'A' })
    const b = makeNode({ name: 'B' })
    const diff = compareNodes([a, b], [{ ...a }])
    expect(diff).toHaveLength(1)
    expect(diff[0].kind).toBe('removed')
    if (diff[0].kind === 'removed') {
      expect(diff[0].path).toBe('B')
    }
  })

  it('detects modified node by name change (matched by path fallback)', () => {
    const base = makeNode({ name: 'A', nodeTypeId: 'nt1', attrs: null })
    const target = { ...base, name: 'A', attrs: '{"x":1}' }
    const diff = compareNodes([base], [target])
    expect(diff).toHaveLength(1)
    expect(diff[0].kind).toBe('modified')
  })

  it('matches nodes by stableId across different paths', () => {
    const stableId = 'stable-1'
    const base = makeNode({ name: 'A', stableId })
    const target = makeNode({ name: 'Renamed', stableId })
    const diff = compareNodes([base], [target])
    expect(diff).toHaveLength(1)
    expect(diff[0].kind).toBe('modified')
    if (diff[0].kind === 'modified') {
      expect(diff[0].base.id).toBe(base.id)
      expect(diff[0].target.id).toBe(target.id)
    }
  })

  it('stableId match takes precedence over path match', () => {
    const stableId = 'stable-1'
    const base = makeNode({ name: 'A', stableId })
    // Target has same stableId but different name; another node with same name 'A'
    const targetMatched = makeNode({ name: 'B', stableId })
    const targetSameName = makeNode({ name: 'A' })
    const diff = compareNodes([base], [targetMatched, targetSameName])
    const modified = diff.filter((d) => d.kind === 'modified')
    expect(modified).toHaveLength(1)
    if (modified[0].kind === 'modified') {
      expect(modified[0].target.id).toBe(targetMatched.id)
    }
  })

  it('returns empty for two empty arrays', () => {
    expect(compareNodes([], [])).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// compareLinks
// ---------------------------------------------------------------------------

describe('compareLinks', () => {
  it('returns empty for identical links', () => {
    const a = makeNode({ name: 'A' })
    const b = makeNode({ name: 'B' })
    const link = makeLink({ sourceId: a.id, targetId: b.id })
    const pathMap = buildNodePathMap([a, b])
    expect(compareLinks([link], [{ ...link }], pathMap, pathMap)).toEqual([])
  })

  it('detects added link', () => {
    const a = makeNode({ name: 'A' })
    const b = makeNode({ name: 'B' })
    const link1 = makeLink({ sourceId: a.id, targetId: b.id, linkTypeId: 'lt1' })
    const link2 = makeLink({ sourceId: a.id, targetId: b.id, linkTypeId: 'lt2' })
    const pathMap = buildNodePathMap([a, b])
    const diff = compareLinks([link1], [{ ...link1 }, link2], pathMap, pathMap)
    expect(diff).toHaveLength(1)
    expect(diff[0].kind).toBe('added')
  })

  it('detects removed link', () => {
    const a = makeNode({ name: 'A' })
    const b = makeNode({ name: 'B' })
    const link1 = makeLink({ sourceId: a.id, targetId: b.id, linkTypeId: 'lt1' })
    const link2 = makeLink({ sourceId: a.id, targetId: b.id, linkTypeId: 'lt2' })
    const pathMap = buildNodePathMap([a, b])
    const diff = compareLinks([link1, link2], [{ ...link1 }], pathMap, pathMap)
    expect(diff).toHaveLength(1)
    expect(diff[0].kind).toBe('removed')
  })

  it('detects modified link (attrs change, matched by key)', () => {
    const a = makeNode({ name: 'A' })
    const b = makeNode({ name: 'B' })
    const baseLink = makeLink({ sourceId: a.id, targetId: b.id })
    const targetLink = { ...baseLink, attrs: '{"changed":true}' }
    const pathMap = buildNodePathMap([a, b])
    const diff = compareLinks([baseLink], [targetLink], pathMap, pathMap)
    expect(diff).toHaveLength(1)
    expect(diff[0].kind).toBe('modified')
  })

  it('matches links by stableId', () => {
    const a1 = makeNode({ name: 'A' })
    const b1 = makeNode({ name: 'B' })
    const a2 = makeNode({ name: 'A' })
    const b2 = makeNode({ name: 'B' })
    const stableId = 'link-stable-1'
    const baseLink = makeLink({ sourceId: a1.id, targetId: b1.id, stableId, attrs: null })
    const targetLink = makeLink({
      sourceId: a2.id,
      targetId: b2.id,
      stableId,
      attrs: '{"new":true}',
    })
    const basePathMap = buildNodePathMap([a1, b1])
    const targetPathMap = buildNodePathMap([a2, b2])
    const diff = compareLinks([baseLink], [targetLink], basePathMap, targetPathMap)
    expect(diff).toHaveLength(1)
    expect(diff[0].kind).toBe('modified')
  })

  it('returns empty for empty inputs', () => {
    expect(compareLinks([], [], new Map(), new Map())).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// compareDiagrams
// ---------------------------------------------------------------------------

describe('compareDiagrams', () => {
  it('returns empty for identical diagrams', () => {
    const d = makeDiagram({ name: 'Main' })
    expect(compareDiagrams([d], [{ ...d }])).toEqual([])
  })

  it('detects added diagram', () => {
    const d1 = makeDiagram({ name: 'Main' })
    const d2 = makeDiagram({ name: 'Extra' })
    const diff = compareDiagrams([d1], [{ ...d1 }, d2])
    expect(diff).toHaveLength(1)
    expect(diff[0].kind).toBe('added')
    if (diff[0].kind === 'added') {
      expect(diff[0].name).toBe('Extra')
    }
  })

  it('detects removed diagram', () => {
    const d1 = makeDiagram({ name: 'Main' })
    const d2 = makeDiagram({ name: 'Extra' })
    const diff = compareDiagrams([d1, d2], [{ ...d1 }])
    expect(diff).toHaveLength(1)
    expect(diff[0].kind).toBe('removed')
    if (diff[0].kind === 'removed') {
      expect(diff[0].name).toBe('Extra')
    }
  })

  it('detects modified diagram (version change)', () => {
    const base = makeDiagram({ name: 'Main', version: '1.0.0', notationId: 'n1' })
    const target = { ...base, version: '1.1.0' }
    const diff = compareDiagrams([base], [target])
    expect(diff).toHaveLength(1)
    expect(diff[0].kind).toBe('modified')
  })

  it('detects modified diagram (attrs change)', () => {
    const base = makeDiagram({ name: 'Main', attrs: null })
    const target = { ...base, attrs: '{"layout":"grid"}' }
    const diff = compareDiagrams([base], [target])
    expect(diff).toHaveLength(1)
    expect(diff[0].kind).toBe('modified')
  })

  it('detects modified diagram (notationId change)', () => {
    const base = makeDiagram({ name: 'Main', notationId: 'n1' })
    const target = { ...base, notationId: 'n2' }
    const diff = compareDiagrams([base], [target])
    expect(diff).toHaveLength(1)
    expect(diff[0].kind).toBe('modified')
  })

  it('matches diagrams by trimmed name', () => {
    const base = makeDiagram({ name: '  Main  ' })
    const target = { ...base, name: 'Main' }
    const diff = compareDiagrams([base], [target])
    expect(diff).toEqual([])
  })

  it('returns empty for empty inputs', () => {
    expect(compareDiagrams([], [])).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// computeModelDiff — integration
// ---------------------------------------------------------------------------

describe('computeModelDiff', () => {
  it('returns empty diff for identical model data', () => {
    const node = makeNode({ name: 'A' })
    const link = makeLink({ sourceId: node.id, targetId: node.id })
    const diagram = makeDiagram({ name: 'D1' })

    const data = { nodes: [node], links: [link], diagrams: [diagram] }
    const diff = computeModelDiff(data, {
      nodes: [{ ...node }],
      links: [{ ...link }],
      diagrams: [{ ...diagram }],
    })
    expect(diff.nodes).toEqual([])
    expect(diff.links).toEqual([])
    expect(diff.diagrams).toEqual([])
  })

  it('detects combined changes across nodes, links, and diagrams', () => {
    const a = makeNode({ name: 'A' })
    const b = makeNode({ name: 'B' })
    const c = makeNode({ name: 'C' })
    const link = makeLink({ sourceId: a.id, targetId: b.id })
    const d1 = makeDiagram({ name: 'D1' })

    const base = { nodes: [a, b], links: [link], diagrams: [d1] }
    const target = {
      nodes: [{ ...a }, c],
      links: [],
      diagrams: [{ ...d1, version: '2.0.0' }],
    }
    const diff = computeModelDiff(base, target)

    expect(diff.nodes.some((n) => n.kind === 'removed')).toBe(true)
    expect(diff.nodes.some((n) => n.kind === 'added')).toBe(true)
    expect(diff.links.some((l) => l.kind === 'removed')).toBe(true)
    expect(diff.diagrams.some((d) => d.kind === 'modified')).toBe(true)
  })

  it('picks latest diagram by version when duplicates exist', () => {
    const node = makeNode({ name: 'A' })
    const d1Old = makeDiagram({ name: 'D1', version: '1.0.0', notationId: 'n1' })
    const d1New = makeDiagram({ name: 'D1', version: '2.0.0', notationId: 'n1' })

    const base = { nodes: [node], links: [], diagrams: [d1Old, d1New] }
    const target = {
      nodes: [{ ...node }],
      links: [],
      diagrams: [{ ...d1New }],
    }
    const diff = computeModelDiff(base, target)
    // latest base is d1New which equals target → no diff
    expect(diff.diagrams).toEqual([])
  })
})

describe('buildDiagramDiffStateMaps edge instance matching', () => {
  it('marks base edge as removed when instance id is absent on other side', () => {
    const state = buildDiagramDiffStateMaps(
      { nodes: [], links: [], diagrams: [] },
      new Map(),
      new Map(),
      [],
      [],
      [],
      [
        {
          edgeInstanceId: 'edge-inst-1',
          modelLinkId: 'link-1',
          sourceId: 'node-1',
          targetId: 'node-2',
          linkTypeId: 'lt1',
        },
      ],
      'base',
      {
        otherSideStableIds: {
          nodeStableIds: new Set(),
          linkStableIds: new Set(['link-1']),
        },
        currentStableIds: {
          nodeIdToStableId: new Map(),
          linkIdToStableId: new Map([['link-1', 'link-1']]),
        },
        otherSideEdgeInstanceIds: new Set<string>(),
        useEdgeInstanceIdMatching: true,
      }
    )

    expect(state.diffStateByModelLinkId['link-1']).toBe('removed')
    expect(state.diffStateByEdgeInstanceId['edge-inst-1']).toBe('removed')
  })

  it('does not mark by edge instance id when matching is disabled', () => {
    const state = buildDiagramDiffStateMaps(
      { nodes: [], links: [], diagrams: [] },
      new Map(),
      new Map(),
      [],
      [],
      [],
      [
        {
          edgeInstanceId: 'edge-inst-1',
          modelLinkId: 'link-1',
          sourceId: 'node-1',
          targetId: 'node-2',
          linkTypeId: 'lt1',
        },
      ],
      'base',
      {
        otherSideStableIds: {
          nodeStableIds: new Set(),
          linkStableIds: new Set(['link-1']),
        },
        currentStableIds: {
          nodeIdToStableId: new Map(),
          linkIdToStableId: new Map([['link-1', 'link-1']]),
        },
        otherSideEdgeInstanceIds: new Set<string>(),
        useEdgeInstanceIdMatching: false,
      }
    )

    expect(state.diffStateByModelLinkId['link-1']).toBeUndefined()
    expect(state.diffStateByEdgeInstanceId['edge-inst-1']).toBeUndefined()
  })

  it('marks edge as modified when same instance id has different attachment signature', () => {
    const state = buildDiagramDiffStateMaps(
      { nodes: [], links: [], diagrams: [] },
      new Map(),
      new Map(),
      [],
      [],
      [],
      [
        {
          edgeInstanceId: 'edge-inst-1',
          modelLinkId: 'link-1',
          sourceId: 'node-1',
          targetId: 'node-2',
          linkTypeId: 'lt1',
        },
      ],
      'base',
      {
        otherSideStableIds: {
          nodeStableIds: new Set(),
          linkStableIds: new Set(['link-1']),
        },
        currentStableIds: {
          nodeIdToStableId: new Map(),
          linkIdToStableId: new Map([['link-1', 'link-1']]),
        },
        otherSideEdgeInstanceIds: new Set(['edge-inst-1']),
        currentEdgeInstanceSignatures: new Map([['edge-inst-1', 'link-1|src-a|dst-a|left|right||']]),
        otherSideEdgeInstanceSignatures: new Map([['edge-inst-1', 'link-1|src-b|dst-b|left|right||']]),
        useEdgeInstanceIdMatching: true,
      }
    )

    expect(state.diffStateByModelLinkId['link-1']).toBe('modified')
    expect(state.diffStateByEdgeInstanceId['edge-inst-1']).toBe('modified')
  })
})

// ---------------------------------------------------------------------------
// computeModelDiff — golden contract tests
// ---------------------------------------------------------------------------

describe('computeModelDiff — golden contract tests', () => {
  it('full hierarchical diff — rename, add, remove across 3-level tree', () => {
    const baseRoot = makeNode({ id: 'n1', name: 'Root', stableId: 'stable-n1' })
    const baseModule = makeNode({
      id: 'n2',
      name: 'Module',
      parentNodeId: 'n1',
      stableId: 'stable-n2',
    })
    const baseComponent = makeNode({
      id: 'n3',
      name: 'Component',
      parentNodeId: 'n2',
      stableId: 'stable-n3',
    })

    const targetRoot = makeNode({ id: 'n1', name: 'Root', stableId: 'stable-n1' })
    const targetModule = makeNode({
      id: 'n4',
      name: 'ModuleRenamed',
      parentNodeId: 'n1',
      stableId: 'stable-n2',
    })
    const targetNewChild = makeNode({ id: 'n5', name: 'NewChild', parentNodeId: 'n1' })

    const diff = computeModelDiff(
      { nodes: [baseRoot, baseModule, baseComponent], links: [], diagrams: [] },
      { nodes: [targetRoot, targetModule, targetNewChild], links: [], diagrams: [] },
    )

    expect(diff).toEqual({
      nodes: [
        { kind: 'modified', path: 'Root/Module', base: baseModule, target: targetModule },
        { kind: 'removed', path: 'Root/Module/Component', node: baseComponent },
        { kind: 'added', path: 'Root/NewChild', node: targetNewChild },
      ],
      links: [],
      diagrams: [],
    })
  })

  it('link diff with stableId and key matching', () => {
    const baseNodes = [
      makeNode({ id: 'n1', name: 'A' }),
      makeNode({ id: 'n2', name: 'B' }),
      makeNode({ id: 'n3', name: 'C' }),
    ]
    const targetNodes = [
      makeNode({ id: 'n1', name: 'A' }),
      makeNode({ id: 'n2', name: 'B' }),
      makeNode({ id: 'n3', name: 'C' }),
    ]

    const baseL1 = makeLink({ id: 'l1', sourceId: 'n1', targetId: 'n2', stableId: 'sl1' })
    const baseL2 = makeLink({ id: 'l2', sourceId: 'n1', targetId: 'n3' })
    const baseL3 = makeLink({ id: 'l3', sourceId: 'n2', targetId: 'n3' })

    const targetL4 = makeLink({
      id: 'l4',
      sourceId: 'n1',
      targetId: 'n2',
      stableId: 'sl1',
      attrs: '{"x":1}',
    })
    const targetL5 = makeLink({ id: 'l5', sourceId: 'n1', targetId: 'n3' })
    const targetL6 = makeLink({ id: 'l6', sourceId: 'n3', targetId: 'n1' })

    const diff = computeModelDiff(
      { nodes: baseNodes, links: [baseL1, baseL2, baseL3], diagrams: [] },
      { nodes: targetNodes, links: [targetL4, targetL5, targetL6], diagrams: [] },
    )

    expect(diff).toEqual({
      nodes: [],
      links: [
        { kind: 'modified', sourcePath: 'A', targetPath: 'B', base: baseL1, target: targetL4 },
        { kind: 'removed', sourcePath: 'B', targetPath: 'C', link: baseL3 },
        { kind: 'added', sourcePath: 'C', targetPath: 'A', link: targetL6 },
      ],
      diagrams: [],
    })
  })

  it('diagram diff with version deduplication — only latest base version compared', () => {
    const node = makeNode({ id: 'n1', name: 'Root' })

    const baseOldVer = makeDiagram({
      id: 'd1',
      name: 'Overview',
      version: '1.0.0',
      notationId: 'not1',
    })
    const baseLatestVer = makeDiagram({
      id: 'd2',
      name: 'Overview',
      version: '2.0.0',
      notationId: 'not1',
    })
    const baseDetail = makeDiagram({
      id: 'd3',
      name: 'Detail',
      version: '1.0.0',
      notationId: 'not1',
    })

    const targetOverview = makeDiagram({
      id: 'd4',
      name: 'Overview',
      version: '2.1.0',
      notationId: 'not1',
    })
    const targetDetail = makeDiagram({
      id: 'd5',
      name: 'Detail',
      version: '1.0.0',
      notationId: 'not1',
    })

    const diff = computeModelDiff(
      { nodes: [node], links: [], diagrams: [baseOldVer, baseLatestVer, baseDetail] },
      {
        nodes: [makeNode({ id: 'n1', name: 'Root' })],
        links: [],
        diagrams: [targetOverview, targetDetail],
      },
    )

    expect(diff).toEqual({
      nodes: [],
      links: [],
      diagrams: [
        { kind: 'modified', name: 'Overview', base: baseLatestVer, target: targetOverview },
      ],
    })
  })

  it('full integration golden test — complete ModelVersionDiff with all fields', () => {
    makeNode({ id: 'n1', name: 'Root', stableId: 'stable-n1' })
    makeNode({ id: 'n2', name: 'Alpha', parentNodeId: 'n1', stableId: 'stable-n2' })
    makeNode({ id: 'n3', name: 'Beta', parentNodeId: 'n1', stableId: 'stable-n3' })
    makeLink({ id: 'l1', sourceId: 'n2', targetId: 'n3', stableId: 'stable-l1' })
    makeDiagram({ id: 'd1', name: 'Main', version: '1.0.0', notationId: 'not1' })

    makeNode({ id: 'n1', name: 'Root', stableId: 'stable-n1' })
    makeNode({
      id: 'n2',
      name: 'Alpha',
      parentNodeId: 'n1',
      stableId: 'stable-n2',
      attrs: '{"color":"red"}',
    })
    makeNode({ id: 'n4', name: 'Gamma', parentNodeId: 'n1' })
    makeLink({ id: 'l2', sourceId: 'n2', targetId: 'n4' })
    makeDiagram({ id: 'd2', name: 'Main', version: '1.1.0', notationId: 'not1' })
    makeDiagram({ id: 'd3', name: 'Extra', version: '1.0.0', notationId: 'not1' })

    const diff = computeModelDiff(
      {
        nodes: [
          { id: 'n1', name: 'Root', modelId: 'm1', ownerId: 'o1', nodeTypeId: 'nt1', stableId: 'stable-n1' },
          { id: 'n2', name: 'Alpha', modelId: 'm1', ownerId: 'o1', nodeTypeId: 'nt1', parentNodeId: 'n1', stableId: 'stable-n2' },
          { id: 'n3', name: 'Beta', modelId: 'm1', ownerId: 'o1', nodeTypeId: 'nt1', parentNodeId: 'n1', stableId: 'stable-n3' },
        ],
        links: [
          { id: 'l1', sourceId: 'n2', targetId: 'n3', modelId: 'm1', ownerId: 'o1', linkTypeId: 'lt1', stableId: 'stable-l1' },
        ],
        diagrams: [
          { id: 'd1', name: 'Main', version: '1.0.0', modelId: 'm1', ownerId: 'o1', notationId: 'not1' },
        ],
      },
      {
        nodes: [
          { id: 'n1', name: 'Root', modelId: 'm1', ownerId: 'o1', nodeTypeId: 'nt1', stableId: 'stable-n1' },
          { id: 'n2', name: 'Alpha', modelId: 'm1', ownerId: 'o1', nodeTypeId: 'nt1', parentNodeId: 'n1', stableId: 'stable-n2', attrs: '{"color":"red"}' },
          { id: 'n4', name: 'Gamma', modelId: 'm1', ownerId: 'o1', nodeTypeId: 'nt1', parentNodeId: 'n1' },
        ],
        links: [
          { id: 'l2', sourceId: 'n2', targetId: 'n4', modelId: 'm1', ownerId: 'o1', linkTypeId: 'lt1' },
        ],
        diagrams: [
          { id: 'd2', name: 'Main', version: '1.1.0', modelId: 'm1', ownerId: 'o1', notationId: 'not1' },
          { id: 'd3', name: 'Extra', version: '1.0.0', modelId: 'm1', ownerId: 'o1', notationId: 'not1' },
        ],
      },
    )

    expect(diff).toEqual({
      nodes: [
        {
          kind: 'modified',
          path: 'Root/Alpha',
          base: {
            id: 'n2',
            name: 'Alpha',
            modelId: 'm1',
            ownerId: 'o1',
            nodeTypeId: 'nt1',
            parentNodeId: 'n1',
            stableId: 'stable-n2',
          },
          target: {
            id: 'n2',
            name: 'Alpha',
            modelId: 'm1',
            ownerId: 'o1',
            nodeTypeId: 'nt1',
            parentNodeId: 'n1',
            stableId: 'stable-n2',
            attrs: '{"color":"red"}',
          },
        },
        {
          kind: 'removed',
          path: 'Root/Beta',
          node: {
            id: 'n3',
            name: 'Beta',
            modelId: 'm1',
            ownerId: 'o1',
            nodeTypeId: 'nt1',
            parentNodeId: 'n1',
            stableId: 'stable-n3',
          },
        },
        {
          kind: 'added',
          path: 'Root/Gamma',
          node: {
            id: 'n4',
            name: 'Gamma',
            modelId: 'm1',
            ownerId: 'o1',
            nodeTypeId: 'nt1',
            parentNodeId: 'n1',
          },
        },
      ],
      links: [
        {
          kind: 'removed',
          sourcePath: 'Root/Alpha',
          targetPath: 'Root/Beta',
          link: {
            id: 'l1',
            sourceId: 'n2',
            targetId: 'n3',
            modelId: 'm1',
            ownerId: 'o1',
            linkTypeId: 'lt1',
            stableId: 'stable-l1',
          },
        },
        {
          kind: 'added',
          sourcePath: 'Root/Alpha',
          targetPath: 'Root/Gamma',
          link: {
            id: 'l2',
            sourceId: 'n2',
            targetId: 'n4',
            modelId: 'm1',
            ownerId: 'o1',
            linkTypeId: 'lt1',
          },
        },
      ],
      diagrams: [
        {
          kind: 'modified',
          name: 'Main',
          base: {
            id: 'd1',
            name: 'Main',
            version: '1.0.0',
            modelId: 'm1',
            ownerId: 'o1',
            notationId: 'not1',
          },
          target: {
            id: 'd2',
            name: 'Main',
            version: '1.1.0',
            modelId: 'm1',
            ownerId: 'o1',
            notationId: 'not1',
          },
        },
        {
          kind: 'added',
          name: 'Extra',
          diagram: {
            id: 'd3',
            name: 'Extra',
            version: '1.0.0',
            modelId: 'm1',
            ownerId: 'o1',
            notationId: 'not1',
          },
        },
      ],
    })
  })
})

// ---------------------------------------------------------------------------
// buildDiagramDiffStateMaps — golden contract tests
// ---------------------------------------------------------------------------

describe('buildDiagramDiffStateMaps — golden contract tests', () => {
  const goldenDiff = {
    nodes: [
      {
        kind: 'removed' as const,
        path: 'Root/OldNode',
        node: {
          id: 'n-rem',
          name: 'OldNode',
          modelId: 'm1',
          ownerId: 'o1',
          nodeTypeId: 'nt1',
        },
      },
      {
        kind: 'added' as const,
        path: 'Root/NewNode',
        node: {
          id: 'n-add',
          name: 'NewNode',
          modelId: 'm1',
          ownerId: 'o1',
          nodeTypeId: 'nt1',
        },
      },
      {
        kind: 'modified' as const,
        path: 'Root/Changed',
        base: {
          id: 'n-mod-b',
          name: 'Changed',
          modelId: 'm1',
          ownerId: 'o1',
          nodeTypeId: 'nt1',
        },
        target: {
          id: 'n-mod-t',
          name: 'Changed',
          modelId: 'm1',
          ownerId: 'o1',
          nodeTypeId: 'nt1',
          attrs: '{"v":2}',
        },
      },
    ],
    links: [
      {
        kind: 'removed' as const,
        sourcePath: 'Root/A',
        targetPath: 'Root/B',
        link: {
          id: 'l-rem',
          sourceId: 'a',
          targetId: 'b',
          modelId: 'm1',
          ownerId: 'o1',
          linkTypeId: 'lt1',
        },
      },
      {
        kind: 'added' as const,
        sourcePath: 'Root/C',
        targetPath: 'Root/D',
        link: {
          id: 'l-add',
          sourceId: 'c',
          targetId: 'd',
          modelId: 'm1',
          ownerId: 'o1',
          linkTypeId: 'lt1',
        },
      },
      {
        kind: 'modified' as const,
        sourcePath: 'Root/E',
        targetPath: 'Root/F',
        base: {
          id: 'l-mod-b',
          sourceId: 'e',
          targetId: 'f',
          modelId: 'm1',
          ownerId: 'o1',
          linkTypeId: 'lt1',
        },
        target: {
          id: 'l-mod-t',
          sourceId: 'e',
          targetId: 'f',
          modelId: 'm1',
          ownerId: 'o1',
          linkTypeId: 'lt1',
          attrs: '{"changed":true}',
        },
      },
    ],
    diagrams: [],
  }

  it('base side — full output maps with all three diff kinds', () => {
    const state = buildDiagramDiffStateMaps(
      goldenDiff,
      new Map(),
      new Map(),
      [],
      [],
      ['n-rem', 'n-mod-b', 'n-untouched'],
      [
        { edgeInstanceId: 'ei1', modelLinkId: 'l-rem', sourceId: 'a', targetId: 'b', linkTypeId: 'lt1' },
        { edgeInstanceId: 'ei2', modelLinkId: 'l-mod-b', sourceId: 'e', targetId: 'f', linkTypeId: 'lt1' },
        { edgeInstanceId: 'ei3', modelLinkId: 'l-clean', sourceId: 'x', targetId: 'y', linkTypeId: 'lt1' },
      ],
      'base',
    )

    expect(state).toEqual({
      diffStateByModelNodeId: {
        'n-rem': 'removed',
        'n-mod-b': 'modified',
      },
      diffStateByModelLinkId: {
        'l-rem': 'removed',
        'l-mod-b': 'modified',
      },
      diffStateByEdgeInstanceId: {
        ei1: 'removed',
        ei2: 'modified',
      },
    })
  })

  it('target side — full output maps with all three diff kinds', () => {
    const state = buildDiagramDiffStateMaps(
      goldenDiff,
      new Map(),
      new Map(),
      [],
      [],
      ['n-add', 'n-mod-t', 'n-untouched'],
      [
        { edgeInstanceId: 'ei4', modelLinkId: 'l-add', sourceId: 'c', targetId: 'd', linkTypeId: 'lt1' },
        { edgeInstanceId: 'ei5', modelLinkId: 'l-mod-t', sourceId: 'e', targetId: 'f', linkTypeId: 'lt1' },
        { edgeInstanceId: 'ei6', modelLinkId: 'l-clean', sourceId: 'x', targetId: 'y', linkTypeId: 'lt1' },
      ],
      'target',
    )

    expect(state).toEqual({
      diffStateByModelNodeId: {
        'n-add': 'added',
        'n-mod-t': 'modified',
      },
      diffStateByModelLinkId: {
        'l-add': 'added',
        'l-mod-t': 'modified',
      },
      diffStateByEdgeInstanceId: {
        ei4: 'added',
        ei5: 'modified',
      },
    })
  })
})
