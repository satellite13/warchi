import { ref } from 'vue'
import { apiPost, apiGet, apiDelete, type ApiError } from '../api/apiClient'
import { emitAuthUpdated, saveStoredUser } from './authStorage'
import { normalizeUser } from '../utils/userRole'
import type { User } from '../types/entities'

type OidcLinkResponse = {
  accessToken?: string
  refreshToken?: string
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

export type OidcPublicConfig = {
  enabled: boolean
  displayName: string
  buttonBg?: string
  buttonTextColor?: string
  buttonIconUrl?: string
  registrationEnabled: boolean
}

const DEFAULT_SSO_CONFIG: OidcPublicConfig = {
  enabled: false,
  displayName: 'SSO',
  registrationEnabled: true,
}

function trimOrUndefined(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

const oidcLinkStatus = ref<OidcStatus>({ linked: false })
const ssoConfig = ref<OidcPublicConfig>({ ...DEFAULT_SSO_CONFIG })

const applyOidcUser = (user: OidcLinkResponse['user']): void => {
  const normalizedUser = normalizeUser(user as unknown as User)
  saveStoredUser(normalizedUser)
  emitAuthUpdated(normalizedUser)
}

export function useOidcAuth() {
  /** Public SSO config for login button branding / visibility. */
  async function fetchSsoConfig(): Promise<OidcPublicConfig> {
    const result = await apiGet<OidcPublicConfig>('/auth/sso/config')
    if (result.success && result.data) {
      const data = result.data
      ssoConfig.value = {
        enabled: Boolean(data.enabled),
        displayName: data.displayName?.trim() || 'SSO',
        buttonBg: trimOrUndefined(data.buttonBg),
        buttonTextColor: trimOrUndefined(data.buttonTextColor),
        buttonIconUrl: trimOrUndefined(data.buttonIconUrl),
        registrationEnabled: data.registrationEnabled !== false,
      }
    } else {
      ssoConfig.value = { ...DEFAULT_SSO_CONFIG }
    }
    return ssoConfig.value
  }

  /** Start SSO login flow — redirects to IdP via backend. */
  async function ssoLogin(): Promise<void> {
    const result = await apiGet<{ url: string }>('/auth/sso/authorize')
    if (!result.success) {
      throw new Error(
        (result as { success: false; error: ApiError }).error?.message ?? 'SSO authorize failed'
      )
    }
    if (result.data?.url) {
      globalThis.location.href = result.data.url
      return
    }
    throw new Error('SSO authorize returned empty URL')
  }

  /** Process SSO callback — exchanges code/state with backend (cookies set by API). */
  async function processCallback(code: string, state: string): Promise<boolean> {
    const result = await apiPost<OidcLinkResponse>('/auth/sso/callback', { code, state })
    if (result.success && result.data) {
      applyOidcUser(result.data.user)
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
      applyOidcUser(result.data.user)
      return true
    }
    return false
  }

  /** Unlink SSO (self-service). Backend returns 403 — use adminUnlinkSso. */
  async function unlinkSso(): Promise<boolean> {
    const result = await apiDelete<OidcStatus>('/auth/sso/unlink')
    if (result.success && result.data) {
      oidcLinkStatus.value = result.data
      return true
    }
    return false
  }

  /** Admin: unlink SSO for a user. */
  async function adminUnlinkSso(userId: string): Promise<boolean> {
    const result = await apiDelete<OidcStatus>(`/admin/users/${encodeURIComponent(userId)}/sso`)
    return result.success
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
    adminUnlinkSso,
    getLinkStatus,
    fetchSsoConfig,
    oidcLinkStatus,
    ssoConfig,
  }
}
