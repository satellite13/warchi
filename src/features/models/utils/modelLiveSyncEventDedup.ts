const DEFAULT_CAPACITY = 384

/**
 * LRU по eventId STOMP: повтор того же id не должен триггерить второй pull.
 * Пустой / нестроковый eventId → считаем уникальным (legacy-серверы).
 */
export function createModelChangedEventIdDeduper(capacity: number = DEFAULT_CAPACITY): {
  consume(eventId: unknown): boolean
} {
  const order: string[] = []
  const set = new Set<string>()

  return {
    consume(eventId: unknown): boolean {
      if (typeof eventId !== "string" || eventId.length === 0) {
        return true
      }
      if (set.has(eventId)) {
        return false
      }
      set.add(eventId)
      order.push(eventId)
      while (order.length > capacity) {
        const ev = order.shift()
        if (ev !== undefined) {
          set.delete(ev)
        }
      }
      return true
    },
  }
}
