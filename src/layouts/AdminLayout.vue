<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppFooter from '../components/layout/AppFooter.vue'
import AppHeader from '../components/layout/AppHeader.vue'

const route = useRoute()
const { t } = useI18n()
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
          <svg class="admin-tabs__icon" viewBox="0 0 18 18" fill="none">
            <circle cx="9" cy="6" r="3.5" stroke="currentColor" stroke-width="1.3" />
            <path
              d="M2 16.5c0-3.866 3.134-7 7-7s7 3.134 7 7"
              stroke="currentColor"
              stroke-width="1.3"
              stroke-linecap="round"
            />
          </svg>
          {{ t('admin.tabUsers') }}
        </RouterLink>
        <RouterLink
          to="/admin/deleted"
          class="admin-tabs__link"
          :class="{ 'admin-tabs__link--active': route.path.startsWith('/admin/deleted') }"
        >
          <svg class="admin-tabs__icon" viewBox="0 0 18 18" fill="none">
            <path
              d="M2.5 4.5h13M6 4.5V3a1.5 1.5 0 011.5-1.5h3A1.5 1.5 0 0112 3v1.5M4 4.5v10.5a1.5 1.5 0 001.5 1.5h7a1.5 1.5 0 001.5-1.5V4.5"
              stroke="currentColor"
              stroke-width="1.3"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          {{ t('admin.tabDeleted') }}
        </RouterLink>
        <RouterLink
          to="/admin/diagram-locks"
          class="admin-tabs__link"
          :class="{ 'admin-tabs__link--active': route.path.startsWith('/admin/diagram-locks') }"
        >
          <svg class="admin-tabs__icon" viewBox="0 0 18 18" fill="none">
            <rect
              x="3"
              y="8"
              width="12"
              height="9"
              rx="1.5"
              stroke="currentColor"
              stroke-width="1.3"
            />
            <path
              d="M5.5 8V5.5a3.5 3.5 0 017 0V8"
              stroke="currentColor"
              stroke-width="1.3"
              stroke-linecap="round"
            />
          </svg>
          {{ t('admin.tabDiagramLocks') }}
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
  gap: 2px;
  padding: 0 32px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}

.admin-tabs__link {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 11px 18px;
  text-decoration: none;
  color: var(--text-muted);
  font-weight: 500;
  font-size: 13px;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: color 0.15s, border-color 0.15s;
}

.admin-tabs__link:hover {
  color: var(--base-text);
}

.admin-tabs__link--active {
  color: var(--primary);
  border-bottom-color: var(--primary);
}

.admin-tabs__icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  opacity: 0.7;
}

.admin-tabs__link--active .admin-tabs__icon {
  opacity: 1;
}

.admin-content {
  flex: 1;
  min-height: 0;
  padding: 24px 32px;
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
