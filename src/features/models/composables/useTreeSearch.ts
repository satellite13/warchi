import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'
import type { EditorNode } from '../types'

export interface TreeSearchDeps {
  nodes: Ref<EditorNode[]> | ComputedRef<EditorNode[]>
  treeRootNodeId: Ref<string | null | undefined> | ComputedRef<string | null | undefined>
  isDirectory: (node: EditorNode) => boolean
  nodeIndexById: ComputedRef<Map<string, number>>
  /** Additional match predicate (e.g. diagram name under the node). */
  extraNodeMatches?: (node: EditorNode, query: string) => boolean
}

const SEARCH_DEBOUNCE_MS = 200

function parentKey(parentNodeId: string | null | undefined): string {
  return parentNodeId ?? '__root__'
}

export function useTreeSearch(deps: TreeSearchDeps) {
  const expandedNodes = ref<Set<string>>(new Set())
  /** Immediate input value (keeps typing responsive). */
  const treeSearchQuery = ref('')
  /** Debounced query used for filtering. */
  const debouncedTreeSearchQuery = ref('')

  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  watch(
    treeSearchQuery,
    value => {
      if (debounceTimer) clearTimeout(debounceTimer)
      const trimmed = value.trim()
      if (!trimmed) {
        debouncedTreeSearchQuery.value = ''
        return
      }
      debounceTimer = setTimeout(() => {
        debouncedTreeSearchQuery.value = value
        debounceTimer = null
      }, SEARCH_DEBOUNCE_MS)
    },
    { flush: 'sync' }
  )

  const sortNodesByTreeOrder = (nodes: EditorNode[]): EditorNode[] =>
    [...nodes].sort((a, b) => {
      const orderDiff = (a.parsedAttrs.treeOrder ?? 0) - (b.parsedAttrs.treeOrder ?? 0)
      if (orderDiff !== 0) return orderDiff
      return (deps.nodeIndexById.value.get(a.id) ?? 0) - (deps.nodeIndexById.value.get(b.id) ?? 0)
    })

  const nodeById = computed(() => {
    const map = new Map<string, EditorNode>()
    for (const node of deps.nodes.value) {
      map.set(node.id, node)
    }
    return map
  })

  /** parentKey → children (sorted). Built once per nodes change — O(n). */
  const childrenByParent = computed(() => {
    const rootId = deps.treeRootNodeId.value ?? null
    const buckets = new Map<string, EditorNode[]>()
    for (const node of deps.nodes.value) {
      if (node._isDeleted || node.id === rootId) continue
      const key = parentKey(node.parentNodeId ?? null)
      const bucket = buckets.get(key)
      if (bucket) bucket.push(node)
      else buckets.set(key, [node])
    }
    for (const [key, bucket] of buckets) {
      buckets.set(key, sortNodesByTreeOrder(bucket))
    }
    return buckets
  })

  const rootNodes = computed(() => {
    const topParentId = deps.treeRootNodeId.value ?? null
    return childrenByParent.value.get(parentKey(topParentId)) ?? []
  })

  const totalNodesCount = computed(() => {
    const rootId = deps.treeRootNodeId.value
    let count = 0
    for (const node of deps.nodes.value) {
      if (!node._isDeleted && node.id !== rootId) count += 1
    }
    return count
  })

  const childNodes = (nodeId: string): EditorNode[] =>
    childrenByParent.value.get(parentKey(nodeId)) ?? []

  const normalizedQuery = computed(() => debouncedTreeSearchQuery.value.trim().toLowerCase())

  /** Direct matches (name / extra), not including ancestors. */
  const matchingNodeIds = computed(() => {
    const query = normalizedQuery.value
    const result = new Set<string>()
    if (!query) return result

    const rootId = deps.treeRootNodeId.value ?? null
    const extraNodeMatches = deps.extraNodeMatches
    for (const node of deps.nodes.value) {
      if (node._isDeleted || node.id === rootId) continue
      if (node.name.toLowerCase().includes(query)) {
        result.add(node.id)
        continue
      }
      if (extraNodeMatches?.(node, query)) {
        result.add(node.id)
      }
    }
    return result
  })

  const collectAncestorIds = (matchingIds: Set<string>): Set<string> => {
    const rootId = deps.treeRootNodeId.value ?? null
    const byId = nodeById.value
    const ancestors = new Set<string>()
    for (const id of matchingIds) {
      let parentId = byId.get(id)?.parentNodeId ?? null
      while (parentId && parentId !== rootId) {
        if (ancestors.has(parentId)) break
        ancestors.add(parentId)
        parentId = byId.get(parentId)?.parentNodeId ?? null
      }
    }
    return ancestors
  }

  /**
   * Nodes visible under search: matches + all ancestors.
   * null when query is empty (show everything).
   */
  const visibleNodeIds = computed<Set<string> | null>(() => {
    const query = normalizedQuery.value
    if (!query) return null

    const matching = matchingNodeIds.value
    const visible = new Set(matching)
    for (const id of collectAncestorIds(matching)) {
      visible.add(id)
    }
    return visible
  })

  const filteredRootNodes = computed(() => {
    const visible = visibleNodeIds.value
    if (!visible) return rootNodes.value
    return rootNodes.value.filter(node => visible.has(node.id))
  })

  const filteredChildNodes = (nodeId: string): EditorNode[] => {
    const children = childNodes(nodeId)
    const visible = visibleNodeIds.value
    if (!visible) return children
    return children.filter(child => visible.has(child.id))
  }

  const toggleNode = (nodeId: string) => {
    const next = new Set(expandedNodes.value)
    if (next.has(nodeId)) next.delete(nodeId)
    else next.add(nodeId)
    expandedNodes.value = next
  }

  return {
    expandedNodes,
    treeSearchQuery,
    debouncedTreeSearchQuery,
    normalizedQuery,
    matchingNodeIds,
    visibleNodeIds,
    nodeById,
    rootNodes,
    totalNodesCount,
    childNodes,
    filteredRootNodes,
    filteredChildNodes,
    toggleNode,
    collectAncestorIds,
  }
}
