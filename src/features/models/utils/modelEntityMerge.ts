/**
 * Слияние сущностей редактора с ответом API при live sync (poll).
 * Локальные черновики (_isNew / _isDirty / _isDeleted) не перезаписываются с сервера.
 */

import type { EditorDiagram } from "../types"

export type MergeableEntity = {
  id: string
  _isNew?: boolean
  _isDirty?: boolean
  _isDeleted?: boolean
}

export type MergeEntityListFromRemoteResult<L extends MergeableEntity> = {
  items: L[]
  /**
   * Локальные id, которых нет в снимке сервера (пропали/удалены на сервере
   * или ещё не записаны локально).
   */
  missingRemoteIds: string[]
  /** Подмножество `missingRemoteIds`, реально исключённое из результата merge. */
  droppedIds: string[]
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
): MergeEntityListFromRemoteResult<L> {
  const remoteMap = new Map(remoteRows.map((r) => [r.id, r]))
  const localById = new Map(local.map((l) => [l.id, l]))
  const result: L[] = []
  const missingRemoteIds: string[] = []
  const droppedIds: string[] = []

  for (const r of remoteRows) {
    const loc = localById.get(r.id)
    if (loc && (loc._isNew || loc._isDirty || loc._isDeleted)) {
      result.push(loc)
    } else {
      result.push(toEditor(r))
    }
  }

  for (const loc of local) {
    if (!remoteMap.has(loc.id)) {
      missingRemoteIds.push(loc.id)
    }
    if (loc._isNew && !remoteMap.has(loc.id)) {
      result.push(loc)
      continue
    }
    if (!remoteMap.has(loc.id) && !loc._isNew && (loc._isDirty || loc._isDeleted)) {
      result.push(loc)
      continue
    }
    if (!remoteMap.has(loc.id) && !loc._isNew && !loc._isDirty && !loc._isDeleted) {
      droppedIds.push(loc.id)
    }
  }

  return { items: result, missingRemoteIds, droppedIds }
}

/**
 * После poll диаграмма «как на сервере» перезаписывает чистую локальную строку целиком, в т.ч. attrs.instances.
 * Для **открытой** вкладки диаграммы оставляем локальные экземпляры на холсте, чтобы не исчезали рёбра при удалении
 * связи другим пользователем (до сохранения / сравнения с сервером). Метаданные и прочие поля attrs — с сервера.
 */
export function preserveOpenDiagramCanvasAfterRemoteMerge(
  merged: EditorDiagram[],
  previous: EditorDiagram[],
  openDiagramId: string | null | undefined,
  options?: { preserveInstances?: boolean }
): EditorDiagram[] {
  if (options?.preserveInstances === false) {
    return merged
  }
  if (!openDiagramId) return merged
  const prev = previous.find((d) => d.id === openDiagramId)
  const idx = merged.findIndex((d) => d.id === openDiagramId)
  if (!prev || idx < 0) return merged
  if (prev._isDirty || prev._isNew || prev._isDeleted) return merged

  const row = merged[idx]
  const instances = prev.parsedAttrs.instances
  const next = [...merged]
  next[idx] = {
    ...row,
    parsedAttrs: {
      ...row.parsedAttrs,
      instances,
    },
  }
  return next
}
