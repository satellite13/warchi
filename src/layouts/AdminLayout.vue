<script setup lang="ts">
import { RouterLink, useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import AppFooter from "../components/layout/AppFooter.vue";
import AppHeader from "../components/layout/AppHeader.vue";

const route = useRoute();
const { t } = useI18n();
</script>

<template>
  <div class="page">
    <header class="page__header">
      <AppHeader />
    </header>

    <main class="page__body">
      <nav class="admin-tabs">
        <RouterLink
          to="/admin/users"
          class="admin-tabs__link"
          :class="{ 'admin-tabs__link--active': route.path.startsWith('/admin/users') }"
        >
          {{ t("admin.tabUsers") }}
        </RouterLink>
        <RouterLink
          to="/admin/deleted"
          class="admin-tabs__link"
          :class="{ 'admin-tabs__link--active': route.path.startsWith('/admin/deleted') }"
        >
          {{ t("admin.tabDeleted") }}
        </RouterLink>
      </nav>
      <div class="admin-content">
        <RouterView />
      </div>
    </main>

    <AppFooter />
  </div>
</template>

<style scoped>
.admin-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 1.5rem;
  border-bottom: 1px solid var(--border-subtle);
  padding-bottom: 0;
}

.admin-tabs__link {
  padding: 10px 16px;
  text-decoration: none;
  color: var(--text-muted);
  font-weight: 500;
  font-size: 14px;
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
  transition: color 0.2s ease, background 0.2s ease;
}

.admin-tabs__link:hover {
  color: var(--base-text);
  background: var(--surface-strong);
}

.admin-tabs__link--active {
  color: var(--primary);
  background: var(--surface);
  border: 1px solid var(--border-subtle);
  border-bottom-color: var(--surface);
  margin-bottom: -1px;
}

.admin-content {
  flex: 1;
  min-height: 0;
  padding: 28px 32px;
  background: var(--base-bg);
  display: flex;
  flex-direction: column;
  gap: 20px;
  overflow: auto;
}

.page {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.page__body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>
