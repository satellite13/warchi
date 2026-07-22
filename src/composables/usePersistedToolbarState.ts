import { watch, type Ref } from 'vue'
import { loadJson, saveJson } from '@/utils/localStorage'

export function userScopedStorageKey(prefix: string, userId: string | null): string {
  return userId ? `${prefix}:${userId}` : `${prefix}:anonymous`
}

type FieldValidators<T extends Record<string, unknown>> = {
  [K in keyof T]?: (value: unknown) => value is T[K]
}

/**
 * Persist a set of toolbar field refs under a user-scoped localStorage key.
 */
export function usePersistedToolbarState<T extends Record<string, unknown>>(
  storagePrefix: string,
  userId: Ref<string | null>,
  fields: { [K in keyof T]: Ref<T[K]> },
  options?: {
    validate?: FieldValidators<T>
  },
): void {
  const keys = Object.keys(fields) as (keyof T)[]

  function applyState(saved: Partial<T> | null): void {
    if (!saved) return
    for (const key of keys) {
      const value = saved[key]
      const validator = options?.validate?.[key]
      if (validator) {
        if (validator(value)) fields[key].value = value
        continue
      }
      if (typeof value === typeof fields[key].value) {
        fields[key].value = value as T[keyof T]
      }
    }
  }

  function persistState(userIdValue: string | null): void {
    const next = {} as T
    for (const key of keys) {
      next[key] = fields[key].value
    }
    saveJson(userScopedStorageKey(storagePrefix, userIdValue), next)
  }

  watch(
    userId,
    id => applyState(loadJson<T>(userScopedStorageKey(storagePrefix, id))),
    { immediate: true },
  )

  watch(
    [...keys.map(key => fields[key]), userId],
    () => {
      persistState(userId.value)
    },
  )
}
