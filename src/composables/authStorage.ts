import type { User } from "../types/entities";

const USER_STORAGE_KEY = "warchi_user";
const ACCESS_TOKEN_STORAGE_KEY = "warchi_access_token";
const REFRESH_TOKEN_STORAGE_KEY = "warchi_refresh_token";
export const AUTH_UPDATED_EVENT = "warchi-auth-updated";
export const AUTH_CLEARED_EVENT = "warchi-auth-cleared";

const isBrowser = (): boolean => typeof window !== "undefined";

const loadJson = <T>(key: string): T | null => {
  if (!isBrowser()) return null;

  const value = window.localStorage.getItem(key);
  if (!value) return null;

  try {
    return JSON.parse(value) as T;
  } catch {
    window.localStorage.removeItem(key);
    return null;
  }
};

const saveJson = (key: string, value: unknown): void => {
  if (!isBrowser()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
};

const loadString = (key: string): string | null => {
  if (!isBrowser()) return null;
  return window.localStorage.getItem(key);
};

const saveString = (key: string, value: string | null): void => {
  if (!isBrowser()) return;
  if (value) {
    window.localStorage.setItem(key, value);
  } else {
    window.localStorage.removeItem(key);
  }
};

export const loadStoredUser = (): User | null => loadJson<User>(USER_STORAGE_KEY);

export const saveStoredUser = (user: User | null): void => {
  if (user) {
    saveJson(USER_STORAGE_KEY, user);
  } else {
    saveString(USER_STORAGE_KEY, null);
  }
};

export const getAccessToken = (): string | null => loadString(ACCESS_TOKEN_STORAGE_KEY);

export const setAccessToken = (token: string | null): void => {
  saveString(ACCESS_TOKEN_STORAGE_KEY, token);
};

export const getRefreshToken = (): string | null => loadString(REFRESH_TOKEN_STORAGE_KEY);

export const setRefreshToken = (token: string | null): void => {
  saveString(REFRESH_TOKEN_STORAGE_KEY, token);
};

export const clearAuthStorage = (): void => {
  saveStoredUser(null);
  setAccessToken(null);
  setRefreshToken(null);
};

export const emitAuthUpdated = (user: User): void => {
  if (!isBrowser()) return;
  window.dispatchEvent(new CustomEvent<User>(AUTH_UPDATED_EVENT, { detail: user }));
};

export const emitAuthCleared = (): void => {
  if (!isBrowser()) return;
  window.dispatchEvent(new Event(AUTH_CLEARED_EVENT));
};
