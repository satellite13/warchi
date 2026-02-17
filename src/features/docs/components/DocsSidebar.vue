<script setup lang="ts">
import { RouterLink } from "vue-router"
import { sections } from "../composables/useDocsNavigation"

defineProps<{ currentSection: string }>()
</script>

<template>
  <aside class="docs-sidebar">
    <div class="docs-sidebar__title">Документация</div>
    <nav class="docs-sidebar__nav">
      <RouterLink
        v-for="section in sections"
        :key="section.id"
        :to="{ name: 'docs-section', params: { section: section.id } }"
        class="docs-sidebar__link"
        :class="{ 'docs-sidebar__link--active': currentSection === section.id }"
      >
        <span class="material-symbols-outlined docs-sidebar__icon">{{ section.icon }}</span>
        {{ section.title }}
      </RouterLink>
    </nav>
  </aside>
</template>

<style scoped>
.docs-sidebar {
  width: 240px;
  flex-shrink: 0;
  border-right: 1px solid var(--border);
  padding: 24px 0;
  overflow-y: auto;
  background: var(--surface);
}

.docs-sidebar__title {
  padding: 0 20px 16px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.docs-sidebar__nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0 8px;
}

.docs-sidebar__link {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  font-size: 14px;
  font-weight: 500;
  color: var(--text-muted);
  text-decoration: none;
  transition: color 0.2s ease, background 0.2s ease;
}

.docs-sidebar__link:hover {
  color: var(--base-text);
  background: var(--surface-strong);
}

.docs-sidebar__link--active {
  color: var(--primary);
  background: var(--primary-soft);
}

.docs-sidebar__link--active:hover {
  color: var(--primary);
  background: var(--primary-soft);
}

.docs-sidebar__icon {
  font-size: 18px;
}
</style>
