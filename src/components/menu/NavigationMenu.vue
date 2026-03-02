<script setup lang="ts">
import { RouterLink } from "vue-router";
import { useI18n } from "vue-i18n";
import { useAuth } from "../../composables/useAuth";
import { DEFAULT_ENTITY_ICONS } from "../../config/iconOptions";

const { isAdmin } = useAuth();
const { t } = useI18n();
</script>

<template>
  <nav class="app-nav">
    <RouterLink to="/" class="app-nav__link" active-class="app-nav__link--active">
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
    <RouterLink to="/docs" class="app-nav__link" active-class="app-nav__link--active">
      <UiIcon name="menu_book" :alt="t('nav.docs')" />{{ t("nav.docs") }}
    </RouterLink>
    <RouterLink to="/profile" class="app-nav__link" active-class="app-nav__link--active">
      <UiIcon name="account_circle" :alt="t('nav.profile')" />{{ t("nav.profile") }}
    </RouterLink>
    <RouterLink v-if="isAdmin" to="/admin/users" class="app-nav__link" active-class="app-nav__link--active">
      <UiIcon name="admin_panel_settings" :alt="t('nav.admin')" />{{ t("nav.admin") }}
    </RouterLink>
  </nav>
</template>

<style scoped>
.app-nav {
  display: flex;
  gap: 4px;
}

.app-nav__link {
  text-decoration: none;
  color: var(--text-muted);
  font-weight: 500;
  font-size: 14px;
  padding: 7px 14px;
  border-radius: var(--radius-sm);
  transition: color 0.2s ease, background 0.2s ease;
  display: flex;
  align-items: center;
  gap: 6px;
}

.app-nav__link .ui-icon {
  font-size: 20px;
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
