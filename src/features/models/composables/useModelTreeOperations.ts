import { computed, ref, watch, type Ref } from 'vue'
import { bumpMinor, compareVersions } from '@/utils/version'
import { createId, parseNodeAttrs } from '../modelAttrs'
import type { ModelEditorState } from '../types'
import { parseTypeAttrs } from '@/domain/attrs/notationAttrs'

type TranslateFn = (key: string, params?: Record<string, unknown>) => string

export function useModelTreeOperations(options: {
  state: Ref<ModelEditorState>
  model: Ref<{ attrs?: string | null } | null>
  selectedDiagramId: Ref<string | null>
  t: TranslateFn
  setUiError: (message: string) => void
  clearUiError: () => void
  markNodeDirty: (nodeId: string) => void
  markDiagramDirty: (diagramId: string) => void
  ensureDiagramAttrsLoaded?: (diagramId: string) => void
}) {
  const createNodeModal = ref<{ parentNodeId: string | null; kind: 'folder' | 'node' }>({
    parentNodeId: null,
    kind: 'node',
  })
  const showCreateNodeModal = ref(false)
  const newNodeName = ref('')
  const newNodeTypeId = ref('')

  const showCreateDiagramModal = ref(false)
  const createDiagramNodeId = ref<string | null>(null)
  const newDiagramName = ref('')
  const newDiagramVersion = ref('1.0.0')
  const newDiagramNotationId = ref('')

  const normalizedNewDiagramName = computed(() => newDiagramName.value.trim().toLowerCase())
  const normalizedNewDiagramVersion = computed(() => (newDiagramVersion.value || '1.0.0').trim())
  const hasDiagramNameVersionConflict = computed(() => {
    if (!normalizedNewDiagramName.value || !normalizedNewDiagramVersion.value) return false
    return options.state.value.diagrams.some(diagram => {
      if (diagram._isDeleted) return false
      return (
        diagram.name.trim().toLowerCase() === normalizedNewDiagramName.value &&
        diagram.version.trim() === normalizedNewDiagramVersion.value
      )
    })
  })

  watch([normalizedNewDiagramName, () => newDiagramNotationId.value], () => {
    const name = normalizedNewDiagramName.value
    const notationId = newDiagramNotationId.value
    if (!name || !notationId) return
    const matching = options.state.value.diagrams.filter(
      d => !d._isDeleted && d.name.trim().toLowerCase() === name && d.notationId === notationId
    )
    if (matching.length === 0) return
    const maxVersion = matching.reduce(
      (max, d) => (compareVersions(d.version, max) > 0 ? d.version : max),
      matching[0]!.version
    )
    const bumped = bumpMinor(maxVersion)
    if (bumped) newDiagramVersion.value = bumped
  })

  const directoryNodeType = computed(
    () =>
      options.state.value.nodeTypes.find(typeItem => typeItem.name.trim().toLowerCase() === 'directory') ??
      null
  )
  const nonDirectoryNodeTypes = computed(() =>
    options.state.value.nodeTypes.filter(typeItem => typeItem.name.trim().toLowerCase() !== 'directory')
  )
  const nodeTypeDefaultDirectoryById = computed(() => {
    const map = new Map<string, string>()
    for (const nodeType of options.state.value.nodeTypes) {
      const defaultDirectoryPath = parseTypeAttrs(nodeType.attrs ?? null).defaultDirectoryPath?.trim()
      if (defaultDirectoryPath) {
        map.set(nodeType.id, defaultDirectoryPath)
      }
    }
    return map
  })
  const createNodeModalTitle = computed(() =>
    createNodeModal.value.kind === 'folder'
      ? options.t('models.createFolderTitle')
      : options.t('models.createNodeTitle')
  )
  const nodeTypeSearchQuery = ref('')
  const nodeTypeDropdownOpen = ref(false)
  const filteredNodeTypes = computed(() => {
    const query = nodeTypeSearchQuery.value.trim().toLowerCase()
    if (!query) return nonDirectoryNodeTypes.value
    return nonDirectoryNodeTypes.value.filter(t => t.name.toLowerCase().includes(query))
  })
  const selectedNodeTypeName = computed(() => {
    if (!newNodeTypeId.value) return ''
    return nonDirectoryNodeTypes.value.find(t => t.id === newNodeTypeId.value)?.name ?? ''
  })

  const treeRootNodeId = computed<string | null>(() => {
    const raw = options.model.value?.attrs
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      const rootId = parsed.treeRootNodeId
      return typeof rootId === 'string' && rootId.trim().length > 0 ? rootId : null
    } catch {
      return null
    }
  })

  const resolveTreeParentId = (parentNodeId: string | null): string | null =>
    parentNodeId ?? treeRootNodeId.value ?? null

  const canCreateNodeFromModal = computed(() => {
    if (!newNodeName.value.trim()) return false
    if (createNodeModal.value.kind === 'folder') return !!directoryNodeType.value
    return !!newNodeTypeId.value
  })

  const getNextTreeOrderForParent = (parentNodeId: string | null): number => {
    const siblingOrders = options.state.value.nodes
      .filter(node => !node._isDeleted && node.parentNodeId === parentNodeId)
      .map(node => node.parsedAttrs.treeOrder ?? 0)
    if (siblingOrders.length === 0) return 0
    return Math.max(...siblingOrders) + 1
  }

  const normalizeDirectoryPathSegments = (rawPath: string): string[] =>
    rawPath
      .split(/[\\/]+/)
      .map(segment => segment.trim())
      .filter(segment => segment.length > 0)

  const ensureDirectoryPath = (
    rawPath: string
  ): { parentNodeId: string | null; createdDirectoryIds: string[] } => {
    const directoryTypeId = directoryNodeType.value?.id
    if (!directoryTypeId) return { parentNodeId: null, createdDirectoryIds: [] }

    const segments = normalizeDirectoryPathSegments(rawPath)
    if (segments.length === 0)
      return { parentNodeId: resolveTreeParentId(null), createdDirectoryIds: [] }

    let currentParentNodeId = resolveTreeParentId(null)
    const createdDirectoryIds: string[] = []

    for (const segment of segments) {
      const normalizedSegment = segment.toLowerCase()
      const existingDirectory = options.state.value.nodes.find(node => {
        if (node._isDeleted) return false
        if (node.nodeTypeId !== directoryTypeId) return false
        if ((node.parentNodeId ?? null) !== (currentParentNodeId ?? null)) return false
        return node.name.trim().toLowerCase() === normalizedSegment
      })

      if (existingDirectory) {
        currentParentNodeId = existingDirectory.id
        continue
      }

      const createdDirectoryId = createId()
      options.state.value.nodes.push({
        id: createdDirectoryId,
        name: segment,
        modelId: options.state.value.modelId,
        ownerId: options.state.value.ownerId,
        nodeTypeId: directoryTypeId,
        parentNodeId: currentParentNodeId,
        createdAt: null,
        updatedAt: null,
        parsedAttrs: {
          ...parseNodeAttrs(null),
          treeOrder: getNextTreeOrderForParent(currentParentNodeId),
        },
        _isNew: true,
      })
      createdDirectoryIds.push(createdDirectoryId)
      currentParentNodeId = createdDirectoryId
    }

    return { parentNodeId: currentParentNodeId, createdDirectoryIds }
  }

  const reindexTreeOrders = () => {
    const counters = new Map<string, number>()
    for (const node of options.state.value.nodes) {
      if (node._isDeleted) continue
      const parentKey = node.parentNodeId ?? '__root__'
      const nextOrder = counters.get(parentKey) ?? 0
      counters.set(parentKey, nextOrder + 1)
      if (node.parsedAttrs.treeOrder !== nextOrder) {
        node.parsedAttrs.treeOrder = nextOrder
        options.markNodeDirty(node.id)
      }
    }
  }

  const openCreateFolder = (parentNodeId: string | null) => {
    if (!directoryNodeType.value) {
      options.setUiError(options.t('models.directoryTypeNotFound'))
      return
    }
    createNodeModal.value = { parentNodeId: resolveTreeParentId(parentNodeId), kind: 'folder' }
    newNodeName.value = ''
    newNodeTypeId.value = directoryNodeType.value.id
    options.clearUiError()
    showCreateNodeModal.value = true
  }

  const openCreateRegularNode = (parentNodeId: string | null) => {
    if (nonDirectoryNodeTypes.value.length === 0) {
      options.setUiError(options.t('models.noAvailableNodeTypes'))
      return
    }
    createNodeModal.value = { parentNodeId: resolveTreeParentId(parentNodeId), kind: 'node' }
    newNodeName.value = ''
    newNodeTypeId.value = nonDirectoryNodeTypes.value[0]?.id ?? ''
    nodeTypeSearchQuery.value = ''
    nodeTypeDropdownOpen.value = false
    options.clearUiError()
    showCreateNodeModal.value = true
  }

  const createNode = () => {
    if (!newNodeName.value.trim()) return
    const nodeTypeId =
      createNodeModal.value.kind === 'folder'
        ? (directoryNodeType.value?.id ?? '')
        : newNodeTypeId.value
    if (!nodeTypeId) return
    const parentNodeId = createNodeModal.value.parentNodeId ?? null
    options.state.value.nodes.push({
      id: createId(),
      name: newNodeName.value.trim(),
      modelId: options.state.value.modelId,
      ownerId: options.state.value.ownerId,
      nodeTypeId,
      parentNodeId,
      createdAt: null,
      updatedAt: null,
      parsedAttrs: {
        ...parseNodeAttrs(null),
        treeOrder: getNextTreeOrderForParent(parentNodeId),
      },
      _isNew: true,
    })
    showCreateNodeModal.value = false
  }

  const openCreateDiagram = (nodeId: string | null) => {
    createDiagramNodeId.value = nodeId ?? treeRootNodeId.value ?? null
    newDiagramName.value = ''
    newDiagramVersion.value = '1.0.0'
    newDiagramNotationId.value = options.state.value.notations[0]?.id ?? ''
    options.clearUiError()
    showCreateDiagramModal.value = true
  }

  const createDiagram = () => {
    if (!newDiagramName.value.trim() || !newDiagramNotationId.value) return
    if (hasDiagramNameVersionConflict.value) {
      options.setUiError(options.t('models.diagramConflictMessage'))
      return
    }
    options.clearUiError()
    const id = createId()
    options.state.value.diagrams.push({
      id,
      name: newDiagramName.value.trim(),
      version: newDiagramVersion.value || '1.0.0',
      ownerId: options.state.value.ownerId,
      modelId: options.state.value.modelId,
      nodeId: createDiagramNodeId.value ?? treeRootNodeId.value ?? null,
      notationId: newDiagramNotationId.value,
      createdAt: null,
      updatedAt: null,
      parsedAttrs: { instances: { nodes: [], edges: [] } },
      _isNew: true,
    })
    options.selectedDiagramId.value = id
    showCreateDiagramModal.value = false
  }

  const isDirectoryNode = (nodeId: string): boolean => {
    const node = options.state.value.nodes.find(item => item.id === nodeId)
    if (!node) return false
    const nodeType = options.state.value.nodeTypes.find(type => type.id === node.nodeTypeId)
    return (nodeType?.name ?? '').trim().toLowerCase() === 'directory'
  }

  const isDescendantNode = (nodeId: string, potentialParentId: string): boolean => {
    const children = options.state.value.nodes.filter(
      item => item.parentNodeId === potentialParentId && !item._isDeleted
    )
    for (const child of children) {
      if (child.id === nodeId) return true
      if (isDescendantNode(nodeId, child.id)) return true
    }
    return false
  }

  const handleMoveNode = (
    nodeId: string,
    targetNodeId: string | null,
    position: 'above' | 'below' | 'inside'
  ) => {
    const nodes = options.state.value.nodes
    const fromIndex = nodes.findIndex(item => item.id === nodeId)
    if (fromIndex < 0) return
    const movingNode = nodes[fromIndex]!

    if (targetNodeId && (targetNodeId === nodeId || isDescendantNode(targetNodeId, nodeId))) return

    const targetNode = targetNodeId ? nodes.find(item => item.id === targetNodeId) : null
    if (targetNodeId && !targetNode) return

    let newParentNodeId: string | null
    let insertIndex: number

    if (!targetNode) {
      newParentNodeId = treeRootNodeId.value ?? null
      const rootIndices = nodes
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => item.id !== nodeId && !item._isDeleted && !item.parentNodeId)
        .map(({ index }) => index)
      insertIndex = rootIndices.length > 0 ? rootIndices[rootIndices.length - 1]! + 1 : nodes.length
    } else if (position === 'inside' && isDirectoryNode(targetNode.id)) {
      newParentNodeId = targetNode.id
      const childIndices = nodes
        .map((item, index) => ({ item, index }))
        .filter(
          ({ item }) => item.id !== nodeId && !item._isDeleted && item.parentNodeId === targetNode.id
        )
        .map(({ index }) => index)
      insertIndex =
        childIndices.length > 0
          ? childIndices[childIndices.length - 1]! + 1
          : nodes.indexOf(targetNode) + 1
    } else {
      newParentNodeId = targetNode.parentNodeId ?? null
      const targetIndex = nodes.indexOf(targetNode)
      insertIndex = position === 'above' ? targetIndex : targetIndex + 1
    }

    const parentChanged = movingNode.parentNodeId !== newParentNodeId
    movingNode.parentNodeId = newParentNodeId

    nodes.splice(fromIndex, 1)
    if (fromIndex < insertIndex) insertIndex -= 1
    insertIndex = Math.max(0, Math.min(insertIndex, nodes.length))
    nodes.splice(insertIndex, 0, movingNode)

    const orderChanged = fromIndex !== insertIndex
    if (parentChanged || orderChanged) {
      options.markNodeDirty(movingNode.id)
      reindexTreeOrders()
    }
  }

  const handleMoveDiagram = (diagramId: string, newNodeId: string | null) => {
    const diagram = options.state.value.diagrams.find(item => item.id === diagramId && !item._isDeleted)
    if (!diagram) return
    const resolvedNodeId = newNodeId ?? treeRootNodeId.value ?? null
    if (diagram.nodeId === resolvedNodeId) return
    diagram.nodeId = resolvedNodeId
    options.markDiagramDirty(diagram.id)
    options.ensureDiagramAttrsLoaded?.(diagram.id)
  }

  const handleRenameNode = (nodeId: string, newName: string) => {
    const node = options.state.value.nodes.find(item => item.id === nodeId)
    const nextName = newName.trim()
    if (!node || !nextName || node.name === nextName) return
    node.name = nextName
    options.markNodeDirty(node.id)
  }

  const handleRenameDiagram = (diagramId: string, newName: string) => {
    const diagram = options.state.value.diagrams.find(item => item.id === diagramId)
    const trimmedName = newName.trim()
    if (!diagram || !trimmedName) return
    if (diagram.name === trimmedName) return

    const oldNameNormalized = diagram.name.trim().toLowerCase()
    for (const row of options.state.value.diagrams) {
      if (row._isDeleted) continue
      if (row.modelId !== diagram.modelId) continue
      if (row.name.trim().toLowerCase() !== oldNameNormalized) continue
      if (row.name === trimmedName) continue
      row.name = trimmedName
      options.markDiagramDirty(row.id)
    }
  }

  return {
    createNodeModal,
    showCreateNodeModal,
    newNodeName,
    newNodeTypeId,
    showCreateDiagramModal,
    createDiagramNodeId,
    newDiagramName,
    newDiagramVersion,
    newDiagramNotationId,
    hasDiagramNameVersionConflict,
    directoryNodeType,
    nonDirectoryNodeTypes,
    nodeTypeDefaultDirectoryById,
    createNodeModalTitle,
    nodeTypeSearchQuery,
    nodeTypeDropdownOpen,
    filteredNodeTypes,
    selectedNodeTypeName,
    treeRootNodeId,
    resolveTreeParentId,
    canCreateNodeFromModal,
    getNextTreeOrderForParent,
    ensureDirectoryPath,
    reindexTreeOrders,
    openCreateFolder,
    openCreateRegularNode,
    createNode,
    openCreateDiagram,
    createDiagram,
    isDirectoryNode,
    handleMoveNode,
    handleMoveDiagram,
    handleRenameNode,
    handleRenameDiagram,
  }
}
