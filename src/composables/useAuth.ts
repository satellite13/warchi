import { ref, computed } from "vue";
import { apiGet } from "./useApi";
import type { User, PaginatedResponse } from "../types/entities";

export type { User };

const STORAGE_KEY = "warchi_user";

const currentUser = ref<User | null>(loadUserFromStorage());

function loadUserFromStorage(): User | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as User;
    }
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
  }
  return null;
}

function saveUserToStorage(user: User | null): void {
  if (user) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  } else {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

export function useAuth() {
  const isAuthenticated = computed(() => currentUser.value !== null);

  async function login(email: string): Promise<{ success: boolean; error?: string }> {
    const result = await apiGet<PaginatedResponse<User>>(
      `/users?email=${encodeURIComponent(email)}&size=1`
    );

    if (!result.success) {
      return { success: false, error: result.error.message };
    }

    const users = Array.isArray(result.data.content) ? result.data.content : [];

    const user = users[0];
    if (!user) {
      return { success: false, error: "Пользователь не найден" };
    }

    currentUser.value = user;
    saveUserToStorage(user);
    return { success: true };
  }

  function logout(): void {
    currentUser.value = null;
    saveUserToStorage(null);
  }

  return {
    currentUser,
    isAuthenticated,
    login,
    logout
  };
}
