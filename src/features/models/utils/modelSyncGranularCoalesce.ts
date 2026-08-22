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

type SemanticAction = "created" | "updated" | "deleted"

function semanticAction(event: GranularSyncEventPayload): SemanticAction | null {
  const prefix = `${event.entity}_`
  if (!event.type.startsWith(prefix)) return null
  const action = event.type.slice(prefix.length)
  return action === "created" || action === "updated" || action === "deleted"
    ? action
    : null
}

export function reduceModelSyncGranularEvent(
  previous: GranularSyncEventPayload,
  next: GranularSyncEventPayload
): GranularSyncEventPayload {
  const previousAction = semanticAction(previous)
  const nextAction = semanticAction(next)
  if (!previousAction || !nextAction) return next

  let intent = nextAction
  if (previousAction === "deleted" && nextAction !== "created") {
    intent = "deleted"
  } else if (previousAction === "created" && nextAction === "updated") {
    intent = "created"
  }
  return { ...next, type: `${next.entity}_${intent}` }
}

/**
 * Семантическая коалесценция по ключу entity:id с сохранением create/delete intent.
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
      map.set(k, e)
    } else {
      map.set(k, reduceModelSyncGranularEvent(map.get(k)!, e))
    }
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
