/** Read and parse JSON from localStorage. Returns null if missing or invalid. */
export function loadJson<T>(key: string): T | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as T
    return parsed && typeof parsed === "object" ? parsed : null
  } catch {
    return null
  }
}

/** Serialize value to JSON and write to localStorage. Silently ignores quota errors. */
export function saveJson<T>(key: string, value: T): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore quota/storage access errors
  }
}
