import { computed, ref, type ComputedRef, type Ref } from 'vue'
import type { EditorNode } from '../types'

export interface TreeSearchDeps {
  nodes: Ref<EditorNode[]> | ComputedRef<EditorNode[]>
  treeRootNodeId: Ref<string | null | undefined> | ComputedRef<string | null | undefined>
  isDirectory: (node: EditorNode) => boolean
  nodeIndexById: ComputedRef<Map<string, number>>
}

export function useTreeSearch(deps: TreeSearchDeps) {
  const expandedNodes = ref<Set<string>>(new Set())
  const treeSearchQuery = ref('')

  const sortNodesByTreeOrder = (nodes: EditorNode[]): EditorNode[] =>
    [...nodes].sort((a, b) => {
      const orderDiff = (a.parsedAttrs.treeOrder ?? 0) - (b.parsedAttrs.treeOrder ?? 0)
      if (orderDiff !== 0) return orderDiff
      return (deps.nodeIndexById.value.get(a.id) ?? 0) - (deps.nodeIndexById.value.get(b.id) ?? 0)
    })

  const rootNodes = computed(() => {
    const topParentId = deps.treeRootNodeId.value ?? null
    return sortNodesByTreeOrder(
      deps.nodes.value.filter(
        (node) =>
          !node._isDeleted &&
          node.id !== deps.treeRootNodeId.value &&
          (node.parentNodeId ?? null) === topParentId,
      ),
    )
  })

  const totalNodesCount = computed(() =>
    deps.nodes.value.filter((n) => !n._isDeleted && n.id !== deps.treeRootNodeId.value).length,
  )

  const childNodes = (nodeId: string): EditorNode[] =>
    sortNodesByTreeOrder(
      deps.nodes.value.filter(
        (node) =>
          node.parentNodeId === nodeId &&
          !node._isDeleted &&
          node.id !== deps.treeRootNodeId.value,
      ),
    )

  const nodeMatchesSearch = (node: EditorNode, query: string): boolean => {
    if (node.name.toLowerCase().includes(query)) return true
    return childNodes(node.id).some((child) => nodeMatchesSearch(child, query))
  }

  const filteredRootNodes = computed(() => {
    const query = treeSearchQuery.value.trim().toLowerCase()
    if (!query) return rootNodes.value
    return rootNodes.value.filter((node) => nodeMatchesSearch(node, query))
  })

  const filteredChildNodes = (nodeId: string): EditorNode[] => {
    const query = treeSearchQuery.value.trim().toLowerCase()
    if (!query) return childNodes(nodeId)
    return childNodes(nodeId).filter((child) => nodeMatchesSearch(child, query))
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
    rootNodes,
    totalNodesCount,
    childNodes,
    filteredRootNodes,
    filteredChildNodes,
    toggleNode,
  }
}
