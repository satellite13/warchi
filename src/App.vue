<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import { RouterView, useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { AUTH_CLEARED_EVENT } from "./composables/authStorage";
import { useAuth } from "./composables/useAuth";
import { useAvailabilityGuard } from "./composables/useAvailabilityGuard";
import { useVersionCheck } from "./composables/useVersionCheck";

const router = useRouter();
const route = useRoute();
const { t } = useI18n();
const { isAuthenticated, loadCurrentUser } = useAuth();
const { outage, isOutage, isRetrying, retryNow } = useAvailabilityGuard();
const { showNewVersionToast, newVersion } = useVersionCheck();

const handleAuthCleared = () => {
  if (route.name === "login") return;
  router.push({
    name: "login",
    query: { redirect: route.fullPath }
  });
};

onMounted(() => {
  if (isAuthenticated.value) {
    loadCurrentUser();
  }

  window.addEventListener(AUTH_CLEARED_EVENT, handleAuthCleared);
});

onUnmounted(() => {
  window.removeEventListener(AUTH_CLEARED_EVENT, handleAuthCleared);
});
</script>

<template>
  <RouterView/>

  <Teleport to="body">
    <div v-if="isOutage" class="outage-blocker" role="alertdialog" aria-modal="true">
      <div class="outage-blocker__panel">
        <svg
          class="outage-blocker__icon"
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <path
            fill="currentColor"
            d="M3 12c0 2.21.91 4.2 2.36 5.64L3 20h6v-6l-2.24 2.24A6.003 6.003 0 0 1 5 12a5.99 5.99 0 0 1 4-5.65V4.26C5.55 5.15 3 8.27 3 12zm8 5h2v-2h-2v2zM21 4h-6v6l2.24-2.24A6.003 6.003 0 0 1 19 12a5.99 5.99 0 0 1-4 5.65v2.09c3.45-.89 6-4.01 6-7.74 0-2.21-.91-4.2-2.36-5.64L21 4zm-10 9h2V7h-2v6z"
          />
        </svg>
        <h2 class="outage-blocker__title">{{ t("common.outageTitle") }}</h2>
        <p class="outage-blocker__text">
          {{ outage?.kind === "authz_unavailable"
            ? t("common.outageAuthzMessage")
            : t("common.outageBackendMessage") }}
        </p>
        <p class="outage-blocker__hint">{{ outage?.message }}</p>
        <button class="outage-blocker__retry" :disabled="isRetrying" @click="retryNow">
          {{ isRetrying ? t("common.outageChecking") : t("common.outageRetry") }}
        </button>
      </div>
    </div>
  </Teleport>

  <!-- New version toast -->
  <Teleport to="body">
    <Transition name="toast">
      <div
        v-if="showNewVersionToast"
        class="version-toast"
      >
        <UiIcon name="sync" class="version-toast__icon" />
        <span>{{ t("common.newVersionAvailable", { version: newVersion }) }}</span>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.version-toast {
  position: fixed;
  bottom: 48px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: var(--radius-sm);
  font-size: 14px;
  font-weight: 500;
  z-index: 2000;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  pointer-events: none;
  background: var(--surface);
  color: var(--text-muted);
  border: 1px solid var(--border);
}

.version-toast__icon {
  width: 20px;
  height: 20px;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(8px);
}

.outage-blocker {
  position: fixed;
  inset: 0;
  z-index: 4000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(18, 22, 30, 0.72);
  backdrop-filter: blur(4px);
}

.outage-blocker__panel {
  width: min(520px, calc(100vw - 32px));
  border-radius: var(--radius-lg);
  background: var(--surface);
  border: 1px solid var(--border);
  box-shadow: 0 20px 48px rgba(0, 0, 0, 0.25);
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.outage-blocker__icon {
  display: block;
  width: 28px;
  height: 28px;
  color: var(--warning);
  opacity: 0.85;
  flex-shrink: 0;
}

.outage-blocker__title {
  margin: 0;
  font-size: 20px;
  line-height: 1.2;
  color: var(--base-text);
}

.outage-blocker__text {
  margin: 0;
  color: var(--text-muted);
}

.outage-blocker__hint {
  margin: 0 0 8px;
  color: var(--text-subtle);
  font-size: 13px;
}

.outage-blocker__retry {
  align-self: flex-start;
  border: 1px solid var(--border);
  background: var(--surface-muted);
  color: var(--base-text);
  border-radius: var(--radius-sm);
  height: 36px;
  padding: 0 14px;
  font-weight: 600;
  cursor: pointer;
}

.outage-blocker__retry:disabled {
  opacity: 0.7;
  cursor: wait;
}
</style>
