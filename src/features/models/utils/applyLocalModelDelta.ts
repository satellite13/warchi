export type LocalDeltaEntity = {
  id: string
  _isNew?: boolean
  _isDirty?: boolean
  _isDeleted?: boolean
}

export type ModelDeltaCollections<
  TNode extends LocalDeltaEntity = LocalDeltaEntity,
  TLink extends LocalDeltaEntity = LocalDeltaEntity,
> = {
  nodes: readonly TNode[]
  links: readonly TLink[]
}

function overlayEntities<T extends LocalDeltaEntity>(remote: readonly T[], local: readonly T[]): T[] {
  const result = new Map<string, T>()
  for (const row of remote) {
    result.set(row.id, row)
  }
  for (const row of local) {
    if (row._isDeleted) {
      result.delete(row.id)
      continue
    }
    if (row._isDirty || row._isNew) {
      result.set(row.id, row)
    }
  }
  return [...result.values()]
}

export function applyLocalModelDelta<
  TNode extends LocalDeltaEntity,
  TLink extends LocalDeltaEntity,
>(
  remote: ModelDeltaCollections<TNode, TLink>,
  local: ModelDeltaCollections<TNode, TLink>
): { nodes: TNode[]; links: TLink[] } {
  return {
    nodes: overlayEntities(remote.nodes, local.nodes),
    links: overlayEntities(remote.links, local.links),
  }
}
