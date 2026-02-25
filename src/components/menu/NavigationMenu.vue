<script setup lang="ts">
import {RouterLink} from "vue-router";
import { useI18n } from "vue-i18n";
import { useAuth } from "../../composables/useAuth";

const { isAdmin } = useAuth();
const { t } = useI18n();
</script>

<template>
  <nav class="app-nav">
    <RouterLink to="/" class="app-nav__link" active-class="app-nav__link--active">
      <span class="material-symbols-outlined" :title="t('nav.home')">home</span>{{ t("nav.home") }}
    </RouterLink>
    <RouterLink to="/models" class="app-nav__link" active-class="app-nav__link--active">
      <span class="material-symbols-outlined" :title="t('nav.models')">schema</span>{{ t("nav.models") }}
    </RouterLink>
    <RouterLink to="/notations" class="app-nav__link" active-class="app-nav__link--active">
      <span class="material-symbols-outlined" :title="t('nav.notations')">graph_3</span>{{ t("nav.notations") }}
    </RouterLink>
    <RouterLink to="/types" class="app-nav__link" active-class="app-nav__link--active">
      <span class="material-symbols-outlined" :title="t('nav.types')">category</span>{{ t("nav.types") }}
    </RouterLink>
    <RouterLink to="/docs" class="app-nav__link" active-class="app-nav__link--active">
      <span class="material-symbols-outlined" :title="t('nav.docs')">menu_book</span>{{ t("nav.docs") }}
    </RouterLink>
    <RouterLink to="/profile" class="app-nav__link" active-class="app-nav__link--active">
      <span class="material-symbols-outlined" :title="t('nav.profile')">account_circle</span>{{ t("nav.profile") }}
    </RouterLink>
    <RouterLink v-if="isAdmin" to="/admin/users" class="app-nav__link" active-class="app-nav__link--active">
      <span class="material-symbols-outlined" :title="t('nav.admin')">admin_panel_settings</span>{{ t("nav.admin") }}
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

.app-nav__link .material-symbols-outlined {
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
