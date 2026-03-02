/**
 * Дерево версий: строится по полю sourceId (родительская версия).
 */

export interface VersionTreeNode<T> {
  item: T
  children: VersionTreeNode<T>[]
}

export interface WithSourceId {
  id: string
  sourceId?: string | null
}

/** Элемент для отображения в дереве версий (id, version, sourceId). */
export type VersionTreeItem = WithSourceId & { version: string }

/**
 * Строит дерево версий из плоского списка по полю sourceId.
 * Корень — элементы без sourceId или с sourceId, не входящим в список (удалённая/внешняя версия).
 */
export function buildVersionTree<T extends WithSourceId>(items: T[]): VersionTreeNode<T>[] {
  const byId = new Map<string, T>()
  for (const item of items) {
    byId.set(item.id, item)
  }
  const childrenByParent = new Map<string | null, T[]>()
  for (const item of items) {
    const parentKey = item.sourceId && byId.has(item.sourceId) ? item.sourceId : null
    const list = childrenByParent.get(parentKey) ?? []
    list.push(item)
    childrenByParent.set(parentKey, list)
  }
  function build(parentKey: string | null): VersionTreeNode<T>[] {
    const list = childrenByParent.get(parentKey) ?? []
    return list.map((item) => ({
      item,
      children: build(item.id)
    }))
  }
  return build(null)
}
