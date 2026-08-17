<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { RouterLink } from "vue-router";
import { useI18n } from "vue-i18n";
import { useAuth } from "../../composables/useAuth";
import { canViewAdminPanel } from "../../composables/usePermissions";
import { DEFAULT_ENTITY_ICONS } from "../../config/iconOptions";

const { currentUser } = useAuth();
const { t } = useI18n();
const canViewAdmin = ref(false);
const isSignedIn = computed(() => currentUser.value != null);

watch(
  () => currentUser.value?.id,
  async (userId) => {
    if (!userId) {
      canViewAdmin.value = false;
      return;
    }
    canViewAdmin.value = await canViewAdminPanel(userId);
  },
  { immediate: true }
);
</script>

<template>
  <nav class="app-nav">
    <template v-if="isSignedIn">
      <RouterLink :to="{ name: 'home' }" class="app-nav__link" active-class="app-nav__link--active">
        <UiIcon name="home" :alt="t('nav.home')" />{{ t("nav.home") }}
      </RouterLink>
      <RouterLink to="/models" class="app-nav__link" active-class="app-nav__link--active">
        <UiIcon :name="DEFAULT_ENTITY_ICONS.model" :alt="t('nav.models')" />{{ t("nav.models") }}
      </RouterLink>
      <RouterLink to="/notations" class="app-nav__link" active-class="app-nav__link--active">
        <UiIcon :name="DEFAULT_ENTITY_ICONS.notation" :alt="t('nav.notations')" />{{ t("nav.notations") }}
      </RouterLink>
      <RouterLink to="/types" class="app-nav__link" active-class="app-nav__link--active">
        <UiIcon :name="DEFAULT_ENTITY_ICONS.nodeType" :alt="t('nav.types')" />{{ t("nav.types") }}
      </RouterLink>
      <RouterLink to="/shapes" class="app-nav__link" active-class="app-nav__link--active">
        <UiIcon name="hexagon" :alt="t('nav.shapes')" />{{ t("nav.shapes") }}
      </RouterLink>
      <RouterLink to="/validation-scripts" class="app-nav__link" active-class="app-nav__link--active">
        <UiIcon name="terminal" :alt="t('nav.validationScripts')" />{{ t("nav.validationScripts") }}
      </RouterLink>
    </template>
    <RouterLink to="/docs" class="app-nav__link" active-class="app-nav__link--active">
      <UiIcon name="menu_book" :alt="t('nav.docs')" />{{ t("nav.docs") }}
    </RouterLink>
    <template v-if="isSignedIn">
      <RouterLink to="/wiki" class="app-nav__link" active-class="app-nav__link--active">
        <UiIcon name="library_books" :alt="t('nav.wiki')" />{{ t("nav.wiki") }}
      </RouterLink>
      <RouterLink to="/profile" class="app-nav__link" active-class="app-nav__link--active">
        <UiIcon name="account_circle" :alt="t('nav.profile')" />{{ t("nav.profile") }}
      </RouterLink>
      <RouterLink v-if="canViewAdmin" to="/admin" class="app-nav__link" active-class="app-nav__link--active">
        <UiIcon name="admin_panel_settings" :alt="t('nav.admin')" />{{ t("nav.admin") }}
      </RouterLink>
    </template>
  </nav>
</template>

<style scoped>
.app-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  min-width: 0;
}

.app-nav__link {
  text-decoration: none;
  color: var(--text-muted);
  font-weight: 500;
  font-size: 12px;
  padding: 5px 8px;
  border-radius: var(--radius-sm);
  transition: color 0.2s ease, background 0.2s ease;
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}

.app-nav__link .ui-icon {
  font-size: 16px;
  width: 16px;
  height: 16px;
}

.app-nav__link:hover {
  color: var(--base-text);
  background: var(--surface-strong);
}

.app-nav__link--active {
  color: var(--primary);
  background: var(--primary-soft);
}

.app-nav__link--active:hover {
  color: var(--primary);
  background: var(--primary-soft);
}
</style>
