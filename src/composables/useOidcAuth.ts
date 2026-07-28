import { ref } from "vue";
import { apiPost, apiGet, apiDelete, type ApiError } from "../api/apiClient";
import {
  emitAuthUpdated,
  saveStoredUser
} from "./authStorage";
import { normalizeUser } from "../utils/userRole";
import type { User } from "../types/entities";

type OidcLinkResponse = {
  accessToken?: string;
  refreshToken?: string;
  user: {
    id: string;
    email: string;
    role: string;
    firstName?: string;
    lastName?: string;
    middleName?: string;
    position?: string;
    attrs?: string;
    createdAt?: string;
    updatedAt?: string;
  };
};

type OidcStatus = {
  linked: boolean;
  oidcSub?: string;
};

const oidcLinkStatus = ref<OidcStatus>({ linked: false });

const applyOidcUser = (user: OidcLinkResponse["user"]): void => {
  const normalizedUser = normalizeUser(user as unknown as User);
  saveStoredUser(normalizedUser);
  emitAuthUpdated(normalizedUser);
};

export function useOidcAuth() {
  /** Start SSO login flow — redirects to Keycloak via backend. */
  async function ssoLogin(): Promise<void> {
    const result = await apiGet<{ url: string }>("/auth/sso/authorize");
    if (!result.success) {
      throw new Error(
        (result as { success: false; error: ApiError }).error?.message ?? "SSO authorize failed"
      );
    }
    if (result.data?.url) {
      globalThis.location.href = result.data.url;
      return;
    }
    throw new Error("SSO authorize returned empty URL");
  }

  /** Process SSO callback — exchanges code/state with backend (cookies set by API). */
  async function processCallback(code: string, state: string): Promise<boolean> {
    const result = await apiPost<OidcLinkResponse>("/auth/sso/callback", { code, state });
    if (result.success && result.data) {
      applyOidcUser(result.data.user);
      return true;
    }
    return false;
  }

  /** Start SSO link for current user. */
  async function startLinkSso(userId: string): Promise<void> {
    const result = await apiGet<{ url: string }>(
      `/auth/sso/authorize?linkUserId=${encodeURIComponent(userId)}`
    );
    if (result.success && result.data?.url) {
      globalThis.location.href = result.data.url;
    }
  }

  /** Process SSO link callback. */
  async function processLinkCallback(code: string, state: string): Promise<boolean> {
    const result = await apiPost<OidcLinkResponse>("/auth/sso/link/callback", { code, state });
    if (result.success && result.data) {
      applyOidcUser(result.data.user);
      return true;
    }
    return false;
  }

  /** Unlink SSO. */
  async function unlinkSso(): Promise<boolean> {
    const result = await apiDelete<OidcStatus>("/auth/sso/unlink");
    if (result.success && result.data) {
      oidcLinkStatus.value = result.data;
      return true;
    }
    return false;
  }

  /** Get SSO link status. */
  async function getLinkStatus(): Promise<OidcStatus> {
    const result = await apiGet<OidcStatus>("/auth/sso/status");
    if (result.success && result.data) {
      oidcLinkStatus.value = result.data;
    }
    return oidcLinkStatus.value;
  }

  return {
    ssoLogin,
    processCallback,
    startLinkSso,
    processLinkCallback,
    unlinkSso,
    getLinkStatus,
    oidcLinkStatus
  };
}
