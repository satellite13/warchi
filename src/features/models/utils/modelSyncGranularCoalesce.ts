/** Событие из поля `events` в STOMP payload model_changed (этап 2). */
export type GranularSyncEventPayload = {
  type: string
  entity: string
  id: string
  revision?: number
}

function slotKey(e: GranularSyncEventPayload): string {
  return `${e.entity}:${e.id}`
}

/**
 * Коалесценция по ключу entity:id: **последнее** событие в массиве побеждает
 * (сервер отдаёт упорядоченный список в рамках одной транзакции / envelope).
 */
export function coalesceModelSyncGranularEvents(
  events: GranularSyncEventPayload[]
): GranularSyncEventPayload[] {
  const map = new Map<string, GranularSyncEventPayload>()
  const order: string[] = []
  for (const e of events) {
    const k = slotKey(e)
    if (!map.has(k)) {
      order.push(k)
    }
    map.set(k, e)
  }
  return order.map((k) => map.get(k)!)
}

export function parseGranularSyncEventsFromPayload(
  raw: unknown
): GranularSyncEventPayload[] {
  if (!Array.isArray(raw)) {
    return []
  }
  const out: GranularSyncEventPayload[] = []
  for (const item of raw) {
    if (item === null || typeof item !== "object") {
      continue
    }
    const o = item as Record<string, unknown>
    const type = o.type
    const entity = o.entity
    const id = o.id
    if (typeof type !== "string" || typeof entity !== "string" || typeof id !== "string") {
      continue
    }
    const rev = o.revision
    const revision =
      typeof rev === "number" && Number.isFinite(rev) ? Math.trunc(rev) : undefined
    out.push({ type, entity, id, revision })
  }
  return out
}
