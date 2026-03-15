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

/** Read a raw string from localStorage. Returns `fallback` if missing or on error. */
export function loadString(key: string, fallback: string = ''): string {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    return raw ?? fallback
  } catch {
    return fallback
  }
}

/** Write a raw string to localStorage. Silently ignores quota errors. */
export function saveString(key: string, value: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // ignore quota/storage access errors
  }
}

/** Read a number from localStorage. Returns `fallback` if missing, non-finite, or on error. */
export function loadNumber(key: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (raw == null) return fallback
    const n = Number(raw)
    return Number.isFinite(n) ? n : fallback
  } catch {
    return fallback
  }
}

/** Write a number to localStorage. Silently ignores quota errors. */
export function saveNumber(key: string, value: number): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, String(value))
  } catch {
    // ignore quota/storage access errors
  }
}
