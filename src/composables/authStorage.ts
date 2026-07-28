import { loadJson, saveJson } from '../utils/localStorage'
import type { User } from '../types/entities'

const USER_STORAGE_KEY = 'warchi_user'
export const AUTH_UPDATED_EVENT = 'warchi-auth-updated'
export const AUTH_CLEARED_EVENT = 'warchi-auth-cleared'

const isBrowser = (): boolean => typeof window !== 'undefined'

export const loadStoredUser = (): User | null => loadJson<User>(USER_STORAGE_KEY)

export const saveStoredUser = (user: User | null): void => {
  if (user) {
    saveJson(USER_STORAGE_KEY, user)
  } else if (isBrowser()) {
    window.localStorage.removeItem(USER_STORAGE_KEY)
  }
}

export const clearAuthStorage = (): void => {
  saveStoredUser(null)
}

export const emitAuthUpdated = (user: User): void => {
  if (!isBrowser()) return
  window.dispatchEvent(new CustomEvent<User>(AUTH_UPDATED_EVENT, { detail: user }))
}

export const emitAuthCleared = (): void => {
  if (!isBrowser()) return
  window.dispatchEvent(new Event(AUTH_CLEARED_EVENT))
}
