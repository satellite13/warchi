export type NamedVersionedEntity = {
  id: string
  name: string
  version: string
  _isDeleted?: boolean
}

export type NameVersionDuplicateGroup = {
  name: string
  version: string
  ids: string[]
}

/** Key used for notation-bound uniqueness (matches DB UNIQUE(notation, name, version)). */
export function entityNameVersionKey(name: string, version: string): string {
  return `${name.trim()}\u0000${version.trim()}`
}

/**
 * Returns an existing non-deleted entity that already uses the same name+version,
 * optionally excluding one id (e.g. the entity being renamed).
 */
export function findNameVersionConflict<T extends NamedVersionedEntity>(
  entities: T[],
  name: string,
  version: string,
  excludeId?: string,
): T | undefined {
  const key = entityNameVersionKey(name, version)
  if (!key.replace('\u0000', '')) return undefined
  return entities.find(
    entity =>
      !entity._isDeleted &&
      entity.id !== excludeId &&
      entityNameVersionKey(entity.name, entity.version) === key,
  )
}

/**
 * Groups non-deleted entities that share the same name+version (more than one entry).
 * Used to block save when the editor already contains colliding rows.
 */
export function findDuplicateNameVersionGroups<T extends NamedVersionedEntity>(
  entities: T[],
): NameVersionDuplicateGroup[] {
  const byKey = new Map<string, { name: string; version: string; ids: string[] }>()
  for (const entity of entities) {
    if (entity._isDeleted) continue
    const name = entity.name.trim()
    const version = entity.version.trim()
    if (!name || !version) continue
    const key = entityNameVersionKey(name, version)
    const group = byKey.get(key)
    if (group) {
      group.ids.push(entity.id)
    } else {
      byKey.set(key, { name, version, ids: [entity.id] })
    }
  }
  return Array.from(byKey.values()).filter(group => group.ids.length > 1)
}
