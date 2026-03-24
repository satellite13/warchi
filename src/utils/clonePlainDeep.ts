/**
 * Глубокая копия JSON-совместимых данных без Proxy / циклов.
 * Нужна для снимков state редактора (reactive) — structuredClone на Proxy бросает DataCloneError.
 */
export function clonePlainDeep<T>(value: T): T {
  if (value === undefined) {
    return value
  }
  return JSON.parse(JSON.stringify(value)) as T
}
