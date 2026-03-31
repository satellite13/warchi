import { loadJson, saveJson } from '../utils/localStorage'
import type { User } from '../types/entities'

const USER_STORAGE_KEY = 'warchi_user'
const ACCESS_TOKEN_STORAGE_KEY = 'warchi_access_token'
const REFRESH_TOKEN_STORAGE_KEY = 'warchi_refresh_token'
export const AUTH_UPDATED_EVENT = 'warchi-auth-updated'
export const AUTH_CLEARED_EVENT = 'warchi-auth-cleared'

const isBrowser = (): boolean => typeof window !== 'undefined'

const loadAuthString = (key: string): string | null => {
  if (!isBrowser()) return null
  return window.localStorage.getItem(key)
}

const saveAuthString = (key: string, value: string | null): void => {
  if (!isBrowser()) return
  if (value) {
    window.localStorage.setItem(key, value)
  } else {
    window.localStorage.removeItem(key)
  }
}

export const loadStoredUser = (): User | null => loadJson<User>(USER_STORAGE_KEY)

export const saveStoredUser = (user: User | null): void => {
  if (user) {
    saveJson(USER_STORAGE_KEY, user)
  } else {
    saveAuthString(USER_STORAGE_KEY, null)
  }
}

export const getAccessToken = (): string | null => loadAuthString(ACCESS_TOKEN_STORAGE_KEY)

export const setAccessToken = (token: string | null): void => {
  saveAuthString(ACCESS_TOKEN_STORAGE_KEY, token)
}

export const getRefreshToken = (): string | null => loadAuthString(REFRESH_TOKEN_STORAGE_KEY)

export const setRefreshToken = (token: string | null): void => {
  saveAuthString(REFRESH_TOKEN_STORAGE_KEY, token)
}

export const clearAuthStorage = (): void => {
  saveStoredUser(null)
  setAccessToken(null)
  setRefreshToken(null)
}

export const emitAuthUpdated = (user: User): void => {
  if (!isBrowser()) return
  window.dispatchEvent(new CustomEvent<User>(AUTH_UPDATED_EVENT, { detail: user }))
}

export const emitAuthCleared = (): void => {
  if (!isBrowser()) return
  window.dispatchEvent(new Event(AUTH_CLEARED_EVENT))
}
