import { ref, computed } from "vue";
import { apiGet, apiPost, apiPut } from "./useApi";
import {
  AUTH_CLEARED_EVENT,
  AUTH_UPDATED_EVENT,
  clearAuthStorage,
  emitAuthCleared,
  emitAuthUpdated,
  loadStoredUser,
  saveStoredUser,
} from "./authStorage";
import type { User, UserProfileForm } from "../types/entities";
import { normalizeUser } from "../utils/userRole";

export type { User };

type AuthResponse = {
  user: User;
};

type AuthResult = { success: true } | { success: false; error: string };

const currentUser = ref<User | null>(loadStoredUser());
if (currentUser.value) {
  currentUser.value = normalizeUser(currentUser.value);
  saveStoredUser(currentUser.value);
}

const applyAuth = (response: AuthResponse): void => {
  const normalizedUser = normalizeUser(response.user);
  currentUser.value = normalizedUser;
  saveStoredUser(normalizedUser);
  emitAuthUpdated(normalizedUser);
};

const clearLocalAuth = (): void => {
  clearAuthStorage();
  emitAuthCleared();
  currentUser.value = null;
};

const AUTH_LISTENERS_FLAG = "__warchiAuthListenersAttached__";
type WindowWithAuthFlag = Window & { [AUTH_LISTENERS_FLAG]?: boolean };

if (
  typeof window !== "undefined" &&
  !(window as WindowWithAuthFlag)[AUTH_LISTENERS_FLAG]
) {
  (window as WindowWithAuthFlag)[AUTH_LISTENERS_FLAG] = true;

  window.addEventListener(AUTH_UPDATED_EVENT, (event) => {
    const payload = (event as CustomEvent<User>).detail;
    const user = payload ? normalizeUser(payload) : null;
    if (!user) return;
    currentUser.value = user;
    saveStoredUser(user);
  });

  window.addEventListener(AUTH_CLEARED_EVENT, () => {
    currentUser.value = null;
  });
}

export function useAuth() {
  const isAuthenticated = computed(() => currentUser.value !== null);
  const isAdmin = computed(() => currentUser.value?.role === "ADMIN");

  async function login(email: string, password: string): Promise<AuthResult> {
    const result = await apiPost<AuthResponse>("/auth/login", { email, password });

    if (!result.success) {
      return { success: false, error: result.error.message };
    }

    applyAuth(result.data);
    return { success: true };
  }

  async function register(
    email: string,
    password: string,
    profile: UserProfileForm
  ): Promise<AuthResult> {
    const result = await apiPost<AuthResponse>("/auth/register", { email, password, ...profile });

    if (!result.success) {
      return { success: false, error: result.error.message };
    }

    applyAuth(result.data);
    return { success: true };
  }

  async function registerAdmin(
    email: string,
    password: string,
    adminSecret: string,
    profile: UserProfileForm
  ): Promise<AuthResult> {
    const result = await apiPost<AuthResponse>("/auth/register-admin", {
      email,
      password,
      ...profile,
      adminSecret
    });

    if (!result.success) {
      return { success: false, error: result.error.message };
    }

    applyAuth(result.data);
    return { success: true };
  }

  async function loadCurrentUser(): Promise<void> {
    const result = await apiGet<User>("/auth/me");
    if (!result.success) {
      if (result.error.status === 401 || result.error.status === 403) {
        clearLocalAuth();
      }
      return;
    }

    const normalizedUser = normalizeUser(result.data);
    currentUser.value = normalizedUser;
    saveStoredUser(normalizedUser);
  }

  async function updateMyProfile(profile: Partial<UserProfileForm>): Promise<AuthResult> {
    const result = await apiPut<User>("/users/me/profile", profile);
    if (!result.success) {
      return { success: false, error: result.error.message };
    }

    const normalizedUser = normalizeUser(result.data);
    currentUser.value = normalizedUser;
    saveStoredUser(normalizedUser);
    emitAuthUpdated(normalizedUser);
    return { success: true };
  }

  async function logout(): Promise<AuthResult> {
    const result = await apiPost<void>("/auth/logout", {});
    if (!result.success) {
      return { success: false, error: result.error.message };
    }
    clearLocalAuth();
    return { success: true };
  }

  return {
    currentUser,
    isAuthenticated,
    isAdmin,
    login,
    register,
    registerAdmin,
    loadCurrentUser,
    updateMyProfile,
    logout
  };
}
