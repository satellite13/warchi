import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { useTreeSearch } from '@/features/models/composables'
import type { EditorNode } from '@/features/models/types'

function makeNode(overrides: Partial<EditorNode> & { id: string; name: string }): EditorNode {
  return {
    modelId: 'm1',
    ownerId: 'o1',
    nodeTypeId: 'nt1',
    parentNodeId: null,
    parsedAttrs: {
      treeOrder: 0,
      notationComponents: {},
      componentProperties: {},
      typeProperties: {},
    },
    _isNew: false,
    _isDirty: false,
    _isDeleted: false,
    ...overrides,
  }
}

function setup(nodeList: EditorNode[], treeRootNodeId: string | null = null) {
  const nodes = ref(nodeList)
  const rootId = ref(treeRootNodeId)
  const nodeIndexById = computed(() => {
    const map = new Map<string, number>()
    nodes.value.forEach((n, i) => map.set(n.id, i))
    return map
  })
  return useTreeSearch({
    nodes,
    treeRootNodeId: rootId,
    isDirectory: (node) => node.nodeTypeId === 'dir',
    nodeIndexById,
  })
}

describe('useTreeSearch', () => {
  describe('rootNodes', () => {
    it('returns top-level nodes (parentNodeId is null)', () => {
      const tree = setup([
        makeNode({ id: 'a', name: 'A' }),
        makeNode({ id: 'b', name: 'B', parentNodeId: 'a' }),
      ])
      expect(tree.rootNodes.value.map((n) => n.id)).toEqual(['a'])
    })

    it('excludes deleted nodes', () => {
      const tree = setup([
        makeNode({ id: 'a', name: 'A', _isDeleted: true }),
        makeNode({ id: 'b', name: 'B' }),
      ])
      expect(tree.rootNodes.value.map((n) => n.id)).toEqual(['b'])
    })

    it('excludes the tree root node itself', () => {
      const tree = setup(
        [
          makeNode({ id: 'root', name: 'Root' }),
          makeNode({ id: 'a', name: 'A', parentNodeId: 'root' }),
        ],
        'root',
      )
      expect(tree.rootNodes.value.map((n) => n.id)).toEqual(['a'])
    })

    it('sorts by treeOrder then by index', () => {
      const tree = setup([
        makeNode({
          id: 'c',
          name: 'C',
          parsedAttrs: {
            treeOrder: 2,
            notationComponents: {},
            componentProperties: {},
            typeProperties: {},
          },
        }),
        makeNode({
          id: 'a',
          name: 'A',
          parsedAttrs: {
            treeOrder: 1,
            notationComponents: {},
            componentProperties: {},
            typeProperties: {},
          },
        }),
        makeNode({
          id: 'b',
          name: 'B',
          parsedAttrs: {
            treeOrder: 1,
            notationComponents: {},
            componentProperties: {},
            typeProperties: {},
          },
        }),
      ])
      expect(tree.rootNodes.value.map((n) => n.id)).toEqual(['a', 'b', 'c'])
    })
  })

  describe('childNodes', () => {
    it('returns children of a given node', () => {
      const tree = setup([
        makeNode({ id: 'a', name: 'A' }),
        makeNode({ id: 'b', name: 'B', parentNodeId: 'a' }),
        makeNode({ id: 'c', name: 'C', parentNodeId: 'a' }),
        makeNode({ id: 'd', name: 'D', parentNodeId: 'b' }),
      ])
      const children = tree.childNodes('a')
      expect(children.map((n) => n.id)).toEqual(['b', 'c'])
    })

    it('excludes deleted children', () => {
      const tree = setup([
        makeNode({ id: 'a', name: 'A' }),
        makeNode({ id: 'b', name: 'B', parentNodeId: 'a', _isDeleted: true }),
        makeNode({ id: 'c', name: 'C', parentNodeId: 'a' }),
      ])
      expect(tree.childNodes('a').map((n) => n.id)).toEqual(['c'])
    })
  })

  describe('totalNodesCount', () => {
    it('counts all non-deleted nodes excluding treeRootNodeId', () => {
      const tree = setup(
        [
          makeNode({ id: 'root', name: 'Root' }),
          makeNode({ id: 'a', name: 'A', parentNodeId: 'root' }),
          makeNode({ id: 'b', name: 'B', parentNodeId: 'root', _isDeleted: true }),
          makeNode({ id: 'c', name: 'C', parentNodeId: 'a' }),
        ],
        'root',
      )
      // a and c are counted (root is excluded, b is deleted)
      expect(tree.totalNodesCount.value).toBe(2)
    })
  })

  describe('toggleNode', () => {
    it('adds node to expandedNodes', () => {
      const tree = setup([makeNode({ id: 'a', name: 'A' })])
      tree.toggleNode('a')
      expect(tree.expandedNodes.value.has('a')).toBe(true)
    })

    it('removes node from expandedNodes on second toggle', () => {
      const tree = setup([makeNode({ id: 'a', name: 'A' })])
      tree.toggleNode('a')
      tree.toggleNode('a')
      expect(tree.expandedNodes.value.has('a')).toBe(false)
    })
  })

  describe('search filtering', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    function applySearch(
      tree: ReturnType<typeof setup>,
      query: string
    ): void {
      tree.treeSearchQuery.value = query
      vi.advanceTimersByTime(200)
    }

    it('filteredRootNodes returns all when query empty', () => {
      const tree = setup([
        makeNode({ id: 'a', name: 'Alpha' }),
        makeNode({ id: 'b', name: 'Beta' }),
      ])
      applySearch(tree, '')
      expect(tree.filteredRootNodes.value.length).toBe(2)
    })

    it('filteredRootNodes filters by name', () => {
      const tree = setup([
        makeNode({ id: 'a', name: 'Alpha' }),
        makeNode({ id: 'b', name: 'Beta' }),
      ])
      applySearch(tree, 'alph')
      expect(tree.filteredRootNodes.value.map((n) => n.id)).toEqual(['a'])
    })

    it('filteredRootNodes includes parent when child matches', () => {
      const tree = setup([
        makeNode({ id: 'a', name: 'Parent' }),
        makeNode({ id: 'b', name: 'SpecialChild', parentNodeId: 'a' }),
      ])
      applySearch(tree, 'special')
      expect(tree.filteredRootNodes.value.map((n) => n.id)).toEqual(['a'])
    })

    it('filteredChildNodes filters children by query', () => {
      const tree = setup([
        makeNode({ id: 'a', name: 'Parent' }),
        makeNode({ id: 'b', name: 'Alpha', parentNodeId: 'a' }),
        makeNode({ id: 'c', name: 'Beta', parentNodeId: 'a' }),
      ])
      applySearch(tree, 'beta')
      const filtered = tree.filteredChildNodes('a')
      expect(filtered.map((n) => n.id)).toEqual(['c'])
    })

    it('filteredChildNodes returns all children when query empty', () => {
      const tree = setup([
        makeNode({ id: 'a', name: 'Parent' }),
        makeNode({ id: 'b', name: 'Alpha', parentNodeId: 'a' }),
        makeNode({ id: 'c', name: 'Beta', parentNodeId: 'a' }),
      ])
      applySearch(tree, '')
      expect(tree.filteredChildNodes('a').length).toBe(2)
    })

    it('does not apply filter until debounce elapses', () => {
      const tree = setup([
        makeNode({ id: 'a', name: 'Alpha' }),
        makeNode({ id: 'b', name: 'Beta' }),
      ])
      tree.treeSearchQuery.value = 'alph'
      expect(tree.filteredRootNodes.value.map(n => n.id)).toEqual(['a', 'b'])
      vi.advanceTimersByTime(200)
      expect(tree.filteredRootNodes.value.map(n => n.id)).toEqual(['a'])
    })
  })
})
