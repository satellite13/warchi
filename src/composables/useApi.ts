import { buildApiUrl } from "../api/config";
import type { User } from "../types/entities";
import { normalizeUser } from "../utils/userRole";
import {
  clearAuthStorage,
  emitAuthCleared,
  emitAuthUpdated,
  getAccessToken,
  getRefreshToken,
  saveStoredUser,
  setAccessToken,
  setRefreshToken
} from "./authStorage";

export type ApiError = {
  status: number;
  message: string;
};

export type ApiResult<T> =
  | { success: true; data: T }
  | { success: false; error: ApiError };

const createApiError = (status: number, message: string): ApiError => ({
  status,
  message
});

type AuthResponse = {
  accessToken?: string;
  refreshToken?: string;
  user?: User;
};

let refreshInFlight: Promise<boolean> | null = null;

const applyRefreshedAuth = (payload: AuthResponse): boolean => {
  if (!payload.accessToken || !payload.refreshToken || !payload.user) {
    return false;
  }
  const normalizedUser = normalizeUser(payload.user);

  setAccessToken(payload.accessToken);
  setRefreshToken(payload.refreshToken);
  saveStoredUser(normalizedUser);
  emitAuthUpdated(normalizedUser);
  return true;
};

const clearSession = (): void => {
  clearAuthStorage();
  emitAuthCleared();
};

const isPublicAuthPath = (path: string): boolean =>
  ["/auth/login", "/auth/register", "/auth/register-admin", "/auth/refresh"].includes(path);

const tryRefreshAccessToken = async (): Promise<boolean> => {
  if (refreshInFlight) {
    return refreshInFlight;
  }

  refreshInFlight = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      clearSession();
      return false;
    }

    try {
      const refreshResponse = await fetch(buildApiUrl("/auth/refresh"), {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ refreshToken })
      });

      const refreshText = await refreshResponse.text();
      if (!refreshResponse.ok || !refreshText.trim()) {
        clearSession();
        return false;
      }

      const parsed = JSON.parse(refreshText) as AuthResponse;
      const applied = applyRefreshedAuth(parsed);
      if (!applied) {
        clearSession();
      }
      return applied;
    } catch {
      clearSession();
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
};

const extractErrorMessage = (status: number, rawText: string): string => {
  const fallback = `Ошибка (${status})`;
  if (!rawText.trim()) return fallback;

  try {
    const parsed = JSON.parse(rawText) as unknown;
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      const preferredKeys = ["message", "detail", "error", "title"];
      for (const key of preferredKeys) {
        const value = record[key];
        if (typeof value === "string" && value.trim().length > 0) {
          return value.trim();
        }
      }
    }
  } catch {
    // ignore JSON parse errors and fallback to raw text
  }

  return rawText.trim() || fallback;
};

const normalizeApiErrorMessage = (
  status: number,
  path: string,
  message: string
): string => {
  const normalized = message.trim().toLowerCase();
  const isGeneric401 =
    normalized.length === 0 ||
    normalized === "unauthorized" ||
    normalized === "forbidden" ||
    normalized.includes("full authentication") ||
    normalized.includes("access denied") ||
    normalized.includes("authorization");

  if (status === 401) {
    if (isPublicAuthPath(path)) {
      return message || "Ошибка авторизации";
    }
    return isGeneric401
      ? "Нет доступа к операции. Проверьте права или войдите заново."
      : message;
  }

  if (status === 403) {
    const editorPathPrefixes = ["/models/", "/notations/", "/node-types/", "/link-types/"];
    const isEditorResourcePath = editorPathPrefixes.some((prefix) => path.startsWith(prefix));
    if (isEditorResourcePath) {
      return "Доступ к ресурсу отозван или отсутствует.";
    }
    return "Недостаточно прав для выполнения операции.";
  }

  return message;
};

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  canRetryAfterRefresh = true
): Promise<ApiResult<T>> {
  const url = buildApiUrl(path);
  const headers = {
    Accept: "application/json",
    ...options.headers
  } as Record<string, string>;

  const accessToken = getAccessToken();
  if (accessToken && !headers.Authorization) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  if (options.body && typeof options.body === "string") {
    headers["Content-Type"] = "application/json";
  }

  try {
    const response = await fetch(url, { ...options, headers });
    const text = await response.text();

    if (!response.ok) {
      if (
        response.status === 401 &&
        canRetryAfterRefresh &&
        !isPublicAuthPath(path)
      ) {
        const refreshed = await tryRefreshAccessToken();
        if (refreshed) {
          return apiFetch<T>(path, options, false);
        }
      }

      const rawMessage = extractErrorMessage(response.status, text);
      return {
        success: false,
        error: createApiError(
          response.status,
          normalizeApiErrorMessage(response.status, path, rawMessage)
        )
      };
    }

    // 204 No Content и пустое тело — не парсим JSON (контракт API)
    const data = (text.length > 0 ? JSON.parse(text) : undefined) as T;
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: createApiError(
        0,
        error instanceof Error ? error.message : "Ошибка подключения"
      )
    };
  }
}

export const apiGet = <T>(path: string): Promise<ApiResult<T>> =>
  apiFetch<T>(path, { method: "GET" });

export const apiPost = <T>(path: string, body: unknown): Promise<ApiResult<T>> =>
  apiFetch<T>(path, {
    method: "POST",
    body: JSON.stringify(body)
  });

export const apiPut = <T>(path: string, body: unknown): Promise<ApiResult<T>> =>
  apiFetch<T>(path, {
    method: "PUT",
    body: JSON.stringify(body)
  });

export const apiDelete = <T>(path: string): Promise<ApiResult<T>> =>
  apiFetch<T>(path, { method: "DELETE" });
