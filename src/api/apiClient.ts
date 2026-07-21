import { buildApiUrl } from "./config"
import { normalizeUser } from "../utils/userRole"
import type { User } from "../types/entities"
import {
  clearAuthStorage,
  emitAuthCleared,
  emitAuthUpdated,
  saveStoredUser,
} from "../composables/authStorage"
import { getCsrfTokenFromCookie, CSRF_HEADER_NAME } from "../utils/csrfCookie"
import {
  clearOutage,
  reportAvailabilityOutage,
  type AvailabilityOutageKind,
} from "../composables/useAvailabilityGuard"

export type ApiError = {
  status: number
  message: string
  /** Сырой JSON тела ответа при ошибке (если объект), напр. старые 409 или произвольные поля */
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
  user?: User
}

let refreshInFlight: Promise<boolean> | null = null

const applyRefreshedAuth = (payload: AuthResponse): boolean => {
  if (!payload.user) {
    return false
  }
  const normalizedUser = normalizeUser(payload.user)
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

const isMutatingMethod = (method: string): boolean => {
  const normalized = method.toUpperCase()
  return normalized === "POST" || normalized === "PUT" || normalized === "PATCH" || normalized === "DELETE"
}

export const refreshAccessToken = async (): Promise<boolean> => {
  if (refreshInFlight) {
    return refreshInFlight
  }

  refreshInFlight = (async () => {
    try {
      const refreshResponse = await fetch(buildApiUrl("/auth/refresh"), {
        method: "POST",
        credentials: "include",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: "{}",
      })

      const refreshText = await refreshResponse.text()
      if (!refreshResponse.ok || !refreshText.trim()) {
        // Definitive auth failure only — do not logout on 429/5xx (nginx refresh
        // rate-limit or transient outages would otherwise wipe a valid session).
        if (refreshResponse.status === 401 || refreshResponse.status === 403) {
          clearSession()
        }
        return false
      }

      const parsed = JSON.parse(refreshText) as AuthResponse
      const applied = applyRefreshedAuth(parsed)
      if (!applied) {
        clearSession()
      }
      return applied
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ошибка подключения"
      reportAvailabilityOutage("backend_unavailable", message)
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
      const fieldErrors = record.fieldErrors
      if (Array.isArray(fieldErrors) && fieldErrors.length > 0) {
        const parts = fieldErrors
          .slice(0, 3)
          .map(item => {
            if (!item || typeof item !== "object") return null
            const row = item as Record<string, unknown>
            const field = typeof row.field === "string" ? row.field : null
            const message = typeof row.message === "string" ? row.message : null
            if (field && message) return `${field}: ${message}`
            return field || message
          })
          .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
        if (parts.length > 0) {
          const more = fieldErrors.length > parts.length ? ` (+${fieldErrors.length - parts.length})` : ""
          return `Validation failed: ${parts.join("; ")}${more}`
        }
      }
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
    // Keep specific auth/CSRF messages (registration disabled, bad admin secret, CSRF).
    if (normalized.includes("csrf")) {
      return "Сессия не установлена (нет CSRF-cookie). Обновите страницу и войдите снова."
    }
    if (isPublicAuthPath(path)) {
      return message.trim().length > 0
        ? message
        : "Недостаточно прав для выполнения операции."
    }
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
  canRetryAfterRefresh = true,
  rawText = false,
): Promise<ApiResult<T>> {
  const url = buildApiUrl(path)
  const method = options.method ?? "GET"
  const headers = {
    Accept: "application/json",
    ...options.headers,
  } as Record<string, string>

  if (isMutatingMethod(method) && !isPublicAuthPath(path)) {
    const csrfToken = getCsrfTokenFromCookie()
    if (!csrfToken) {
      return {
        success: false,
        error: createApiError(419, "CSRF token is missing."),
      }
    }
    if (csrfToken && !headers[CSRF_HEADER_NAME]) {
      headers[CSRF_HEADER_NAME] = csrfToken
    }
  }

  if (options.body && typeof options.body === "string" && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json"
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      credentials: "include",
    })
    const text = await response.text()

    if (!response.ok) {
      if (
        response.status === 401 &&
        canRetryAfterRefresh &&
        !isPublicAuthPath(path)
      ) {
        const refreshed = await refreshAccessToken()
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

    clearOutage("backend_unavailable")
    if (path === "/permissions/check") {
      clearOutage("authz_unavailable")
    }
    // 204 No Content и пустое тело — не парсим JSON (контракт API)
    const data = rawText
      ? (text as unknown as T)
      : ((text.length > 0 ? JSON.parse(text) : undefined) as T)
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

/** Like apiFetch but returns raw text instead of parsing JSON. */
export function apiFetchText(
  path: string,
  options: RequestInit = {},
): Promise<ApiResult<string>> {
  return apiFetch<string>(
    path,
    { ...options, headers: { Accept: 'text/markdown, text/plain, */*', ...options.headers } },
    true,
    true,
  )
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

export type ApiUploadProgress = {
  loaded: number
  total: number
  /** 0–100 when total is known; otherwise 0 */
  percent: number
}

/**
 * Multipart/binary upload via XHR so callers can show upload progress.
 * Mirrors apiFetch auth (cookies + CSRF) and 401 refresh retry.
 */
export async function apiUpload<T>(
  path: string,
  body: FormData,
  options?: {
    onProgress?: (progress: ApiUploadProgress) => void
    method?: string
  },
  canRetryAfterRefresh = true,
): Promise<ApiResult<T>> {
  const url = buildApiUrl(path)
  const method = (options?.method ?? "POST").toUpperCase()
  const headers: Record<string, string> = {
    Accept: "application/json",
  }

  if (isMutatingMethod(method) && !isPublicAuthPath(path)) {
    const csrfToken = getCsrfTokenFromCookie()
    if (!csrfToken) {
      return {
        success: false,
        error: createApiError(419, "CSRF token is missing."),
      }
    }
    headers[CSRF_HEADER_NAME] = csrfToken
  }

  const run = (): Promise<ApiResult<T>> =>
    new Promise(resolve => {
      const xhr = new XMLHttpRequest()
      xhr.open(method, url)
      xhr.withCredentials = true
      for (const [key, value] of Object.entries(headers)) {
        xhr.setRequestHeader(key, value)
      }

      xhr.upload.onprogress = event => {
        if (!options?.onProgress) return
        if (event.lengthComputable && event.total > 0) {
          options.onProgress({
            loaded: event.loaded,
            total: event.total,
            percent: Math.min(100, Math.round((event.loaded / event.total) * 100)),
          })
        } else {
          options.onProgress({
            loaded: event.loaded,
            total: 0,
            percent: 0,
          })
        }
      }

      xhr.upload.onload = () => {
        // Bytes left the browser; server may still be parsing / responding.
        options?.onProgress?.({
          loaded: 0,
          total: 0,
          percent: 100,
        })
      }

      xhr.onload = () => {
        void (async () => {
          const text = xhr.responseText ?? ""
          const status = xhr.status

          if (status === 401 && canRetryAfterRefresh && !isPublicAuthPath(path)) {
            const refreshed = await refreshAccessToken()
            if (refreshed) {
              resolve(apiUpload<T>(path, body, options, false))
              return
            }
          }

          if (status < 200 || status >= 300) {
            const rawMessage = extractErrorMessage(status, text)
            const normalizedMessage = normalizeApiErrorMessage(status, path, rawMessage)
            const outageKind = resolveOutageKind(status, normalizedMessage)
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
            resolve({
              success: false,
              error: createApiError(status, normalizedMessage, errorDetails),
            })
            return
          }

          clearOutage("backend_unavailable")
          try {
            const data = (text.length > 0 ? JSON.parse(text) : undefined) as T
            resolve({ success: true, data })
          } catch {
            resolve({
              success: false,
              error: createApiError(0, "Invalid JSON response"),
            })
          }
        })()
      }

      xhr.onerror = () => {
        const fallbackMessage = "Ошибка подключения"
        reportAvailabilityOutage("backend_unavailable", fallbackMessage)
        resolve({
          success: false,
          error: createApiError(0, fallbackMessage),
        })
      }

      xhr.onabort = () => {
        resolve({
          success: false,
          error: createApiError(0, "Upload aborted"),
        })
      }

      xhr.send(body)
    })

  return run()
}

/** Upload diagram SVG for preview (raw body, no JSON). */
export function uploadDiagramSvg(
  diagramId: string,
  svg: string,
): Promise<ApiResult<void>> {
  return apiFetch<void>(`/diagrams/${diagramId}/svg`, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/svg+xml' },
    body: svg,
  })
}

export type DiagramShareLinkPayload =
  | { diagramId: string }
  | { modelId: string; diagramName: string; latest: true }

export type DiagramShareLinkResponse = { url: string; token: string }

export const createDiagramShareLink = (
  payload: DiagramShareLinkPayload
): Promise<ApiResult<DiagramShareLinkResponse>> =>
  apiPost<DiagramShareLinkResponse>("/diagrams/share-link", payload)
