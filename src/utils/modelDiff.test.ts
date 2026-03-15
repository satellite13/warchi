import { describe, expect, it } from 'vitest'
import type { DiagramResponse, LinkResponse, NodeResponse } from '@/types/api'
import {
  buildNodePathMap,
  linkKey,
  compareNodes,
  compareLinks,
  compareDiagrams,
  computeModelDiff,
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
