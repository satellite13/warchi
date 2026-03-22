import { buildApiUrl } from "./config"
import { normalizeUser } from "../utils/userRole"
import type { User } from "../types/entities"
import {
  clearAuthStorage,
  emitAuthCleared,
  emitAuthUpdated,
  getAccessToken,
  getRefreshToken,
  saveStoredUser,
  setAccessToken,
  setRefreshToken,
} from "../composables/authStorage"
import {
  clearOutage,
  reportAvailabilityOutage,
  type AvailabilityOutageKind,
} from "../composables/useAvailabilityGuard"

export type ApiError = {
  status: number
  message: string
  /** Raw JSON body when server returned an object (e.g. 409 diagram lock payload) */
  details?: unknown
}

export type ApiResult<T> =
  | { success: true; data: T }
  | { success: false; error: ApiError }

const createApiError = (status: number, message: string, details?: unknown): ApiError => ({
  status,
  message,
  ...(details !== undefined ? { details } : {}),
})

type AuthResponse = {
  accessToken?: string
  refreshToken?: string
  user?: User
}

let refreshInFlight: Promise<boolean> | null = null

const applyRefreshedAuth = (payload: AuthResponse): boolean => {
  if (!payload.accessToken || !payload.refreshToken || !payload.user) {
    return false
  }
  const normalizedUser = normalizeUser(payload.user)

  setAccessToken(payload.accessToken)
  setRefreshToken(payload.refreshToken)
  saveStoredUser(normalizedUser)
  emitAuthUpdated(normalizedUser)
  return true
}

const clearSession = (): void => {
  clearAuthStorage()
  emitAuthCleared()
}

const isPublicAuthPath = (path: string): boolean =>
  ["/auth/login", "/auth/register", "/auth/register-admin", "/auth/refresh"].includes(path)

const tryRefreshAccessToken = async (): Promise<boolean> => {
  if (refreshInFlight) {
    return refreshInFlight
  }

  refreshInFlight = (async () => {
    const refreshToken = getRefreshToken()
    if (!refreshToken) {
      clearSession()
      return false
    }

    try {
      const refreshResponse = await fetch(buildApiUrl("/auth/refresh"), {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refreshToken }),
      })

      const refreshText = await refreshResponse.text()
      if (!refreshResponse.ok || !refreshText.trim()) {
        clearSession()
        return false
      }

      const parsed = JSON.parse(refreshText) as AuthResponse
      const applied = applyRefreshedAuth(parsed)
      if (!applied) {
        clearSession()
      }
      return applied
    } catch {
      clearSession()
      return false
    } finally {
      refreshInFlight = null
    }
  })()

  return refreshInFlight
}

const extractErrorMessage = (status: number, rawText: string): string => {
  const fallback = `Ошибка (${status})`
  if (!rawText.trim()) return fallback

  try {
    const parsed = JSON.parse(rawText) as unknown
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>
      const preferredKeys = ["message", "detail", "error", "title"]
      for (const key of preferredKeys) {
        const value = record[key]
        if (typeof value === "string" && value.trim().length > 0) {
          return value.trim()
        }
      }
    }
  } catch {
    // ignore JSON parse errors and fallback to raw text
  }

  return rawText.trim() || fallback
}

const normalizeApiErrorMessage = (
  status: number,
  path: string,
  message: string
): string => {
  const normalized = message.trim().toLowerCase()
  const isGeneric401 =
    normalized.length === 0 ||
    normalized === "unauthorized" ||
    normalized === "forbidden" ||
    normalized.includes("full authentication") ||
    normalized.includes("access denied") ||
    normalized.includes("authorization")

  if (status === 401) {
    if (isPublicAuthPath(path)) {
      return message || "Ошибка авторизации"
    }
    return isGeneric401
      ? "Нет доступа к операции. Проверьте права или войдите заново."
      : message
  }

  if (status === 403) {
    const editorPathPrefixes = ["/models/", "/notations/", "/node-types/", "/link-types/", "/node-shapes/"]
    const isEditorResourcePath = editorPathPrefixes.some((prefix) => path.startsWith(prefix))
    if (isEditorResourcePath) {
      return "Доступ к ресурсу отозван или отсутствует."
    }
    return "Недостаточно прав для выполнения операции."
  }

  return message
}

const isAuthzUnavailableMessage = (message: string): boolean =>
  message.trim().toLowerCase().includes("authorization service is unavailable")

const resolveOutageKind = (status: number, message: string): AvailabilityOutageKind | null => {
  if (status === 503 && isAuthzUnavailableMessage(message)) {
    return "authz_unavailable"
  }
  if (status === 502 || status === 503 || status === 504 || status === 0) {
    return "backend_unavailable"
  }
  return null
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  canRetryAfterRefresh = true
): Promise<ApiResult<T>> {
  const url = buildApiUrl(path)
  const headers = {
    Accept: "application/json",
    ...options.headers,
  } as Record<string, string>

  const accessToken = getAccessToken()
  if (accessToken && !headers.Authorization) {
    headers.Authorization = `Bearer ${accessToken}`
  }

  if (options.body && typeof options.body === "string") {
    headers["Content-Type"] = "application/json"
  }

  try {
    const response = await fetch(url, { ...options, headers })
    const text = await response.text()

    if (!response.ok) {
      if (
        response.status === 401 &&
        canRetryAfterRefresh &&
        !isPublicAuthPath(path)
      ) {
        const refreshed = await tryRefreshAccessToken()
        if (refreshed) {
          return apiFetch<T>(path, options, false)
        }
      }

      const rawMessage = extractErrorMessage(response.status, text)
      const normalizedMessage = normalizeApiErrorMessage(response.status, path, rawMessage)
      const outageKind = resolveOutageKind(response.status, normalizedMessage)
      if (outageKind) {
        reportAvailabilityOutage(outageKind, normalizedMessage)
      }
      let errorDetails: unknown
      try {
        const parsed = JSON.parse(text) as unknown
        if (parsed !== null && typeof parsed === "object") {
          errorDetails = parsed
        }
      } catch {
        /* not JSON */
      }
      return {
        success: false,
        error: createApiError(response.status, normalizedMessage, errorDetails),
      }
    }

    clearOutage()
    // 204 No Content и пустое тело — не парсим JSON (контракт API)
    const data = (text.length > 0 ? JSON.parse(text) : undefined) as T
    return { success: true, data }
  } catch (error) {
    const fallbackMessage = error instanceof Error ? error.message : "Ошибка подключения"
    reportAvailabilityOutage("backend_unavailable", fallbackMessage)
    return {
      success: false,
      error: createApiError(
        0,
        fallbackMessage
      ),
    }
  }
}

export const apiGet = <T>(path: string): Promise<ApiResult<T>> =>
  apiFetch<T>(path, { method: "GET" })

export const apiPost = <T>(path: string, body: unknown): Promise<ApiResult<T>> =>
  apiFetch<T>(path, {
    method: "POST",
    body: JSON.stringify(body),
  })

export const apiPut = <T>(path: string, body: unknown): Promise<ApiResult<T>> =>
  apiFetch<T>(path, {
    method: "PUT",
    body: JSON.stringify(body),
  })

export const apiDelete = <T>(path: string): Promise<ApiResult<T>> =>
  apiFetch<T>(path, { method: "DELETE" })

/** Upload diagram SVG for preview (raw body, no JSON). */
export async function uploadDiagramSvg(
  diagramId: string,
  svg: string
): Promise<ApiResult<void>> {
  const url = buildApiUrl(`/diagrams/${diagramId}/svg`)
  const accessToken = getAccessToken()
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "image/svg+xml",
  }
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`
  }
  try {
    const response = await fetch(url, {
      method: "PUT",
      headers,
      body: svg,
    })
    const text = await response.text()
    if (!response.ok) {
      if (response.status === 401) {
        const refreshed = await tryRefreshAccessToken()
        if (refreshed) {
          return uploadDiagramSvg(diagramId, svg)
        }
      }
      const rawMessage = extractErrorMessage(response.status, text)
      const normalizedMessage = normalizeApiErrorMessage(response.status, url, rawMessage)
      const outageKind = resolveOutageKind(response.status, normalizedMessage)
      if (outageKind) {
        reportAvailabilityOutage(outageKind, normalizedMessage)
      }
      return {
        success: false,
        error: createApiError(
          response.status,
          normalizedMessage
        ),
      }
    }
    clearOutage()
    return { success: true, data: undefined as void }
  } catch (error) {
    const fallbackMessage = error instanceof Error ? error.message : "Ошибка подключения"
    reportAvailabilityOutage("backend_unavailable", fallbackMessage)
    return {
      success: false,
      error: createApiError(
        0,
        fallbackMessage
      ),
    }
  }
}

export type DiagramShareLinkPayload =
  | { diagramId: string }
  | { modelId: string; diagramName: string; latest: true }

export type DiagramShareLinkResponse = { url: string; token: string }

export const createDiagramShareLink = (
  payload: DiagramShareLinkPayload
): Promise<ApiResult<DiagramShareLinkResponse>> =>
  apiPost<DiagramShareLinkResponse>("/diagrams/share-link", payload)
