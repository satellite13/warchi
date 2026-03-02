<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import { RouterView, useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { AUTH_CLEARED_EVENT } from "./composables/authStorage";
import { useAuth } from "./composables/useAuth";
import { useVersionCheck } from "./composables/useVersionCheck";

const router = useRouter();
const route = useRoute();
const { t } = useI18n();
const { isAuthenticated, loadCurrentUser } = useAuth();
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
</style>
