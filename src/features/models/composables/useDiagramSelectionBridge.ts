export type SelectionNodeEntity = { modelNodeId: string; instanceId: string }
export type SelectionEdgeEntity = { modelLinkId: string; edgeId: string }

export type SelectionPropsInput = {
  selectedModelNodeIds: string[]
  selectedInstanceIds?: string[] | null
  selectedModelLinkId: string | null
  selectedEdgeInstanceId?: string | null
}

export type PapSelectionApi = {
  selectedIds: Set<string>
  selectMultiple: (ids: string[]) => void
  clearSelection: () => void
  select: (id: string) => void
}

export type SelectionElementLike = { state: string }

/** Resolve papirus element ids that should be selected from model selection props. */
export function resolvePapIdsFromSelectionProps(
  input: SelectionPropsInput,
  nodeIdToInstance: Map<string, SelectionNodeEntity>,
  edgeIdToInstance: Map<string, SelectionEdgeEntity>
): string[] {
  const selectedInstanceIds = input.selectedInstanceIds ?? []
  const targetPapIds: string[] = []

  if (selectedInstanceIds.length > 0) {
    const instanceSet = new Set(selectedInstanceIds)
    for (const [papId, entity] of nodeIdToInstance) {
      if (instanceSet.has(entity.instanceId)) targetPapIds.push(papId)
    }
    return targetPapIds
  }

  if (input.selectedModelNodeIds.length > 0) {
    const selectedSet = new Set(input.selectedModelNodeIds)
    for (const [papId, entity] of nodeIdToInstance) {
      if (selectedSet.has(entity.modelNodeId)) targetPapIds.push(papId)
    }
    return targetPapIds
  }

  const selectedEdgeInstanceId = input.selectedEdgeInstanceId ?? null
  if (selectedEdgeInstanceId) {
    const papId = `edge-${selectedEdgeInstanceId}`
    if (edgeIdToInstance.has(papId)) targetPapIds.push(papId)
    return targetPapIds
  }

  if (input.selectedModelLinkId) {
    for (const [papId, entity] of edgeIdToInstance) {
      if (entity.modelLinkId === input.selectedModelLinkId) {
        targetPapIds.push(papId)
        break
      }
    }
  }

  return targetPapIds
}

export function selectionNeedsRepair(
  targetPapIds: string[],
  getElement: (id: string) => SelectionElementLike | null | undefined
): boolean {
  return targetPapIds.some(id => {
    const el = getElement(id)
    return !!el && el.state !== 'selected'
  })
}

export function selectionIdsDiffer(targetPapIds: string[], currentIds: Set<string>): boolean {
  return targetPapIds.length !== currentIds.size || targetPapIds.some(id => !currentIds.has(id))
}

export type ModelSelectionEmit = {
  selectNodes: (modelNodeIds: string[]) => void
  selectInstanceIds: (instanceIds: string[]) => void
  selectLink: (modelLinkId: string | null) => void
  selectEdgeInstanceId: (edgeId: string | null) => void
  selectCanvasElementId: (elementId: string | null) => void
}

/** Map papirus selection ids → model editor selection emits. */
export function emitModelSelectionFromPapIds(
  elementIds: string[],
  nodeIdToInstance: Map<string, SelectionNodeEntity>,
  edgeIdToInstance: Map<string, SelectionEdgeEntity>,
  emit: ModelSelectionEmit
): void {
  if (elementIds.length === 0) {
    emit.selectNodes([])
    emit.selectInstanceIds([])
    emit.selectLink(null)
    emit.selectEdgeInstanceId(null)
    emit.selectCanvasElementId(null)
    return
  }

  emit.selectCanvasElementId(elementIds[0] ?? null)

  const modelNodeIds: string[] = []
  const instanceIds: string[] = []
  for (const elementId of elementIds) {
    const nodeEntity = nodeIdToInstance.get(elementId)
    if (nodeEntity) {
      modelNodeIds.push(nodeEntity.modelNodeId)
      instanceIds.push(nodeEntity.instanceId)
    }
  }
  if (modelNodeIds.length > 0) {
    emit.selectNodes(modelNodeIds)
    emit.selectInstanceIds(instanceIds)
    return
  }

  if (elementIds.length === 1) {
    const edgeEntity = edgeIdToInstance.get(elementIds[0]!)
    if (edgeEntity) {
      emit.selectInstanceIds([])
      emit.selectLink(edgeEntity.modelLinkId)
      emit.selectEdgeInstanceId(edgeEntity.edgeId)
    }
  }
}

export type EdgeHitLike = {
  id: string
  visible: boolean
  style: { strokeWidth?: number }
  hitTestWithTolerance: (point: { x: number; y: number }, tolerance: number) => boolean
}

export function findTopEdgeAtPoint(
  edges: Iterable<EdgeHitLike>,
  worldPoint: { x: number; y: number },
  zoom: number,
  minTolerance: number
): EdgeHitLike | null {
  const list = Array.from(edges)
  for (let i = list.length - 1; i >= 0; i--) {
    const edge = list[i]
    if (!edge || !edge.visible) continue
    const baseTolerance = Math.max((edge.style.strokeWidth ?? 2) * 2, minTolerance)
    const tolerance = baseTolerance / Math.max(zoom, 0.0001)
    if (edge.hitTestWithTolerance(worldPoint, tolerance)) return edge
  }
  return null
}

/**
 * Props ↔ papirus selection bridge. Owns the suppressSelectionEvent flag so
 * programmatic selectMultiple/clear does not re-emit into the model editor.
 */
export function useDiagramSelectionBridge(options: {
  suppressSelectionEvent: { value: boolean }
  getSelection: () => PapSelectionApi | null
  getElement: (id: string) => SelectionElementLike | null | undefined
  nodeIdToInstance: Map<string, SelectionNodeEntity>
  edgeIdToInstance: Map<string, SelectionEdgeEntity>
}) {
  const withSuppressedSelection = (fn: () => void): void => {
    options.suppressSelectionEvent.value = true
    try {
      fn()
    } finally {
      options.suppressSelectionEvent.value = false
    }
  }

  const syncSelectionFromProps = (input: SelectionPropsInput): void => {
    const selection = options.getSelection()
    if (!selection) return

    const targetPapIds = resolvePapIdsFromSelectionProps(
      input,
      options.nodeIdToInstance,
      options.edgeIdToInstance
    )

    if (targetPapIds.length > 0) {
      const needsIdSync = selectionIdsDiffer(targetPapIds, selection.selectedIds)
      const needsStateRepair = selectionNeedsRepair(targetPapIds, options.getElement)
      if (needsIdSync || needsStateRepair) {
        withSuppressedSelection(() => selection.selectMultiple(targetPapIds))
      }
      return
    }

    if (selection.selectedIds.size > 0) {
      withSuppressedSelection(() => selection.clearSelection())
    }
  }

  const selectEdgeSuppressingEvent = (edgeId: string): void => {
    const selection = options.getSelection()
    if (!selection) return
    if (selection.selectedIds.size === 1 && selection.selectedIds.has(edgeId)) return
    withSuppressedSelection(() => selection.select(edgeId))
  }

  return {
    syncSelectionFromProps,
    selectEdgeSuppressingEvent,
    withSuppressedSelection,
    emitFromPapIds: (elementIds: string[], emit: ModelSelectionEmit) =>
      emitModelSelectionFromPapIds(
        elementIds,
        options.nodeIdToInstance,
        options.edgeIdToInstance,
        emit
      ),
  }
}

export function createSelectionSuppressBox(): { value: boolean } {
  return { value: false }
}

export type SelectionBridge = ReturnType<typeof useDiagramSelectionBridge>
