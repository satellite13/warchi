import { ref } from 'vue'
import { apiPost, apiGet, apiDelete, type ApiError } from '../api/apiClient'
import { normalizeUser } from '../utils/userRole'
import type { User } from '../types/entities'

type OidcLinkResponse = {
  accessToken: string
  refreshToken: string
  user: {
    id: string
    email: string
    role: string
    firstName?: string
    lastName?: string
    middleName?: string
    position?: string
    attrs?: string
    createdAt?: string
    updatedAt?: string
  }
}

type OidcStatus = {
  linked: boolean
  oidcSub?: string
}

const oidcLinkStatus = ref<OidcStatus>({ linked: false })

export function useOidcAuth() {
  /** Start SSO login flow — redirects to Keycloak via backend. */
  async function ssoLogin(): Promise<void> {
    const result = await apiGet<{ url: string }>('/auth/sso/authorize')
    if (!result.success) {
      throw new Error(
        (result as { success: false; error: ApiError }).error?.message ?? 'SSO authorize failed'
      )
    }
    if (result.data?.url) {
      globalThis.location.href = result.data.url
    }
    throw new Error('SSO authorize returned empty URL')
  }

  /** Process SSO callback — exchanges code/state with backend, stores local JWT. */
  async function processCallback(code: string, state: string): Promise<boolean> {
    const result = await apiPost<OidcLinkResponse>('/auth/sso/callback', { code, state })
    if (result.success && result.data) {
      const resp = result.data
      const storage = await import('./authStorage')
      storage.setAccessToken(resp.accessToken)
      storage.setRefreshToken(resp.refreshToken)
      const normalizedUser = normalizeUser(resp.user as unknown as User)
      storage.saveStoredUser(normalizedUser)
      storage.emitAuthUpdated(normalizedUser)
      return true
    }
    return false
  }

  /** Start SSO link for current user. */
  async function startLinkSso(userId: string): Promise<void> {
    const result = await apiGet<{ url: string }>(
      `/auth/sso/authorize?linkUserId=${encodeURIComponent(userId)}`
    )
    if (result.success && result.data?.url) {
      globalThis.location.href = result.data.url
    }
  }

  /** Process SSO link callback. */
  async function processLinkCallback(code: string, state: string): Promise<boolean> {
    const result = await apiPost<OidcLinkResponse>('/auth/sso/link/callback', { code, state })
    if (result.success && result.data) {
      const resp = result.data
      const storage = await import('./authStorage')
      storage.setAccessToken(resp.accessToken)
      storage.setRefreshToken(resp.refreshToken)
      storage.emitAuthUpdated(normalizeUser(resp.user as unknown as User))
      return true
    }
    return false
  }

  /** Unlink SSO. */
  async function unlinkSso(): Promise<boolean> {
    const result = await apiDelete<OidcStatus>('/auth/sso/unlink')
    if (result.success && result.data) {
      oidcLinkStatus.value = result.data
      return true
    }
    return false
  }

  /** Get SSO link status. */
  async function getLinkStatus(): Promise<OidcStatus> {
    const result = await apiGet<OidcStatus>('/auth/sso/status')
    if (result.success && result.data) {
      oidcLinkStatus.value = result.data
    }
    return oidcLinkStatus.value
  }

  return {
    ssoLogin,
    processCallback,
    startLinkSso,
    processLinkCallback,
    unlinkSso,
    getLinkStatus,
    oidcLinkStatus,
  }
}
