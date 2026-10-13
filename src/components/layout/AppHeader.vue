<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { useAuth } from "../../composables/useAuth";
import { getUserDisplayName } from "../../utils/userDisplay";
import type { UserRole } from "../../types/entities";
import AppLogo from "./AppLogo.vue";
import UserAvatar from "./UserAvatar.vue";
import NavigationMenu from "../menu/NavigationMenu.vue";
import LanguageSwitcher from "./LanguageSwitcher.vue";

const SWITCHABLE_ROLES: UserRole[] = ["architect", "editor", "reader", "viewer"];

const router = useRouter();
const route = useRoute();
const { t } = useI18n();
const { currentUser, logout, switchRole, resetRole } = useAuth();
const isSignedIn = computed(() => currentUser.value != null);
const userDisplayName = computed(() => getUserDisplayName(currentUser.value, t("common.user")));
const signInTo = computed(() => ({
  name: "login",
  query: { redirect: route.fullPath },
}));

const isSwitched = computed(() => currentUser.value?.roleOverride != null);
const canSwitchRole = computed(() => currentUser.value?.role === "admin" && !isSwitched.value);
const roleMenuOpen = ref(false);
const roleSwitchBusy = ref(false);
const roleMenuRef = ref<HTMLElement | null>(null);

const roleLabel = (role: UserRole | null | undefined): string =>
  role ? t(`featureGrants.roles.${role}`) : "";
const effectiveRole = computed(() => currentUser.value?.role ?? null);
const roleBadgeTitle = computed(() =>
  isSwitched.value
    ? t("auth.roleSwitchedTitle", {
        role: roleLabel(effectiveRole.value),
        original: roleLabel(currentUser.value?.roleOverride),
      })
    : undefined
);
const resetTitle = computed(() =>
  t("auth.roleSwitchReturnTitle", { role: roleLabel(currentUser.value?.roleOverride) })
);

const toggleRoleMenu = () => {
  roleMenuOpen.value = !roleMenuOpen.value;
};

const onDocumentClick = (event: MouseEvent) => {
  if (!roleMenuOpen.value || !roleMenuRef.value) return;
  if (!roleMenuRef.value.contains(event.target as Node)) {
    roleMenuOpen.value = false;
  }
};

onMounted(() => document.addEventListener("click", onDocumentClick));
onBeforeUnmount(() => document.removeEventListener("click", onDocumentClick));

const handleSwitchRole = async (role: UserRole) => {
  roleMenuOpen.value = false;
  if (roleSwitchBusy.value) return;
  roleSwitchBusy.value = true;
  const result = await switchRole(role);
  roleSwitchBusy.value = false;
  if (result.success) {
    // Каталоги грузятся только в onMounted и не следят за сменой роли —
    // без reload остаются данные, видимые прежней роли (см. useEntityList).
    window.location.reload();
  }
};

const handleResetRole = async () => {
  if (roleSwitchBusy.value) return;
  roleSwitchBusy.value = true;
  const result = await resetRole();
  roleSwitchBusy.value = false;
  if (result.success) {
    window.location.reload();
  }
};

const handleLogout = async () => {
  await logout();
  router.push({ name: "login" });
};
</script>

<template>
  <header class="app-header">
    <div class="app-header__left">
      <AppLogo size="md" :show-subtitle="false"/>
      <NavigationMenu/>
    </div>
    <div class="user-info">
      <LanguageSwitcher />
      <template v-if="isSignedIn">
        <UserAvatar :label="userDisplayName" size="sm"/>
        <span class="user-email">{{ userDisplayName }}</span>
        <span
          v-if="effectiveRole"
          class="user-role"
          :class="{ 'user-role--temporary': isSwitched }"
          :title="roleBadgeTitle"
        >{{ roleLabel(effectiveRole) }}</span>
        <div v-if="canSwitchRole" ref="roleMenuRef" class="role-switch">
          <button
            class="role-switch__button"
            type="button"
            :aria-label="t('auth.switchRole')"
            :aria-expanded="roleMenuOpen"
            :title="t('auth.switchRoleHint')"
            data-testid="role-switch-button"
            @click="toggleRoleMenu"
          >
            <UiIcon name="swap_horiz" />
          </button>
          <div v-if="roleMenuOpen" class="role-switch__menu" role="menu">
            <button
              v-for="role in SWITCHABLE_ROLES"
              :key="role"
              class="role-switch__item"
              type="button"
              role="menuitem"
              :disabled="roleSwitchBusy"
              :data-testid="`role-switch-item-${role}`"
              @click="handleSwitchRole(role)"
            >
              {{ roleLabel(role) }}
            </button>
          </div>
        </div>
        <button
          v-else-if="isSwitched"
          class="role-switch__return"
          type="button"
          :disabled="roleSwitchBusy"
          :title="resetTitle"
          data-testid="role-switch-return"
          @click="handleResetRole"
        >
          <UiIcon name="undo" />
          {{ t("auth.roleSwitchReturn") }}
        </button>
        <button class="logout-button" type="button" @click="handleLogout">
          <UiIcon name="logout" />
        </button>
      </template>
      <RouterLink
        v-else
        :to="signInTo"
        class="btn btn--primary btn--sm"
        data-testid="header-sign-in"
      >
        {{ t("auth.submitLogin") }}
      </RouterLink>
    </div>
  </header>
</template>

<style scoped>
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  position: sticky;
  top: 0;
  z-index: 10;
}

.ui-icon {
  line-height: unset;
}

.app-header__left {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.user-email {
  font-size: 12px;
  color: var(--text-muted);
  letter-spacing: 0.01em;
}

.user-role {
  font-size: 10px;
  font-weight: 600;
  color: var(--primary);
  background: var(--primary-soft);
  border: 1px solid color-mix(in srgb, var(--primary) 28%, transparent);
  border-radius: 999px;
  padding: 2px 7px;
  letter-spacing: 0.03em;
}

.user-role--temporary {
  color: var(--warning);
  background: color-mix(in srgb, var(--warning) 10%, transparent);
  border-color: color-mix(in srgb, var(--warning) 40%, transparent);
}

.role-switch {
  position: relative;
  display: inline-flex;
}

.role-switch__button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 6px;
  color: var(--text-subtle);
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: color 0.2s ease, background 0.2s ease;
}

.role-switch__button:hover {
  color: var(--base-text);
  background: var(--surface-strong);
}

.role-switch__menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  min-width: 150px;
  display: flex;
  flex-direction: column;
  padding: 4px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  z-index: 20;
}

.role-switch__item {
  padding: 6px 10px;
  font-size: 12px;
  color: var(--base-text);
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  text-align: left;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.role-switch__item:hover {
  background: var(--primary-soft);
  color: var(--primary);
}

.role-switch__item:disabled {
  opacity: 0.6;
  cursor: default;
}

.role-switch__return {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  font-size: 11px;
  font-weight: 600;
  color: var(--warning);
  background: color-mix(in srgb, var(--warning) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--warning) 40%, transparent);
  border-radius: 999px;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease;
}

.role-switch__return .ui-icon {
  width: 14px;
  height: 14px;
}

.role-switch__return:hover {
  color: var(--base-text);
  background: color-mix(in srgb, var(--warning) 18%, transparent);
}

.role-switch__return:disabled {
  opacity: 0.6;
  cursor: default;
}

.logout-button {
  padding: 4px 6px;
  font-size: large;
  font-weight: 100;
  color: var(--text-subtle);
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: color 0.2s ease, background 0.2s ease;
}

.logout-button:hover {
  color: var(--base-text);
  background: var(--surface-strong);
}
</style>
