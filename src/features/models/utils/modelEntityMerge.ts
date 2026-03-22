/**
 * Слияние сущностей редактора с ответом API при live sync (poll).
 * Локальные черновики (_isNew / _isDirty / _isDeleted) не перезаписываются с сервера.
 */

export type MergeableEntity = {
  id: string
  _isNew?: boolean
  _isDirty?: boolean
  _isDeleted?: boolean
}

/**
 * @param local — текущие строки редактора
 * @param remoteRows — снимок с сервера (тот же порядок, что в API)
 * @param toEditor — маппинг ответа API в Editor*
 */
export function mergeEntityListFromRemote<L extends MergeableEntity, R extends { id: string }>(
  local: L[],
  remoteRows: R[],
  toEditor: (r: R) => L
): L[] {
  const remoteMap = new Map(remoteRows.map((r) => [r.id, r]))
  const localById = new Map(local.map((l) => [l.id, l]))
  const result: L[] = []

  for (const r of remoteRows) {
    const loc = localById.get(r.id)
    if (loc && (loc._isNew || loc._isDirty || loc._isDeleted)) {
      result.push(loc)
    } else {
      result.push(toEditor(r))
    }
  }

  for (const loc of local) {
    if (loc._isNew && !remoteMap.has(loc.id)) {
      result.push(loc)
      continue
    }
    if (!remoteMap.has(loc.id) && !loc._isNew && (loc._isDirty || loc._isDeleted)) {
      result.push(loc)
    }
  }

  return result
}
