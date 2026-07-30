<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { apiPost } from "../api/apiClient";
import { emitAuthUpdated, saveStoredUser } from "../composables/authStorage";
import { normalizeUser } from "../utils/userRole";
import type { User } from "../types/entities";

const route = useRoute();
const router = useRouter();
const { t } = useI18n();

const errorMessage = ref<string | null>(null);
const isLoading = ref(true);

onMounted(async () => {
  const code = route.query.code as string;
  const state = route.query.state as string;

  if (!code || !state) {
    errorMessage.value = "Missing code or state parameter";
    isLoading.value = false;
    return;
  }

  try {
    const result = await apiPost<{
      accessToken?: string;
      refreshToken?: string;
      user: User;
    }>("/auth/sso/callback", { code, state });

    isLoading.value = false;

    if (result.success && result.data) {
      const normalizedUser = normalizeUser(result.data.user);
      saveStoredUser(normalizedUser);
      emitAuthUpdated(normalizedUser);

      const redirectTarget =
        typeof route.query.redirect === "string" && route.query.redirect.startsWith("/")
          ? route.query.redirect
          : null;
      await router.replace(redirectTarget ?? { name: "home" });
    } else {
      const err = (result as { error: { message?: string; status?: number } }).error;
      const detail = err?.message ?? err?.status ?? "unknown";
      console.error("SSO callback failed:", err);
      errorMessage.value = `${t("auth.ssoError")} (${detail})`;
    }
  } catch (e) {
    console.error("SSO callback error:", e);
    isLoading.value = false;
    errorMessage.value = `${t("auth.ssoError")}: ${(e as Error).message}`;
  }
});
</script>

<template>
  <div class="callback-page">
    <div class="callback-card">
      <div v-if="isLoading" class="spinner"></div>
      <div v-else-if="errorMessage" class="error">
        <p>{{ errorMessage }}</p>
        <router-link to="/login" class="back-link">Back to login</router-link>
      </div>
    </div>
  </div>
</template>

<style scoped>
.callback-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: var(--base-bg);
}

.callback-card {
  text-align: center;
  padding: 32px;
  background: var(--surface);
  border-radius: var(--radius);
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--border);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error {
  color: var(--danger);
}

.back-link {
  display: inline-block;
  margin-top: 12px;
  color: var(--primary);
  text-decoration: none;
  font-weight: 600;
}

.back-link:hover {
  text-decoration: underline;
}
</style>
