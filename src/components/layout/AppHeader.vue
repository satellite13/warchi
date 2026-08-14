<script setup lang="ts">
import {computed} from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import {useAuth} from "../../composables/useAuth";
import {getUserDisplayName} from "../../utils/userDisplay";
import AppLogo from "./AppLogo.vue";
import UserAvatar from "./UserAvatar.vue";
import NavigationMenu from "../menu/NavigationMenu.vue";
import LanguageSwitcher from "./LanguageSwitcher.vue";

const router = useRouter();
const route = useRoute();
const { t } = useI18n();
const {currentUser, logout} = useAuth();
const isSignedIn = computed(() => currentUser.value != null);
const userDisplayName = computed(() => getUserDisplayName(currentUser.value, t("common.user")));
const signInTo = computed(() => ({
  name: "login",
  query: { redirect: route.fullPath },
}));

const handleLogout = async () => {
  await logout();
  router.push({name: "login"});
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
        <span v-if="currentUser?.role" class="user-role">{{ currentUser.role }}</span>
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
