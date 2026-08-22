<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import type { ValidationScriptApiCatalogItem } from '../validationScriptApiCatalog'
import {
  catalogItemKey,
  displayCatalogItemName,
  getValidationScriptApiHelpGroups,
  VALIDATION_SCRIPT_API_STRUCTURES,
} from '../validationScriptApiHelp'

const { t, te } = useI18n()

const groups = computed(() => getValidationScriptApiHelpGroups())
const structures = VALIDATION_SCRIPT_API_STRUCTURES

function groupTitle(id: string): string {
  return t(`validationScripts.apiHelp.groups.${id}`)
}

function structureTitle(id: string): string {
  return t(`validationScripts.apiHelp.structures.${id}`)
}

function itemInfo(item: ValidationScriptApiCatalogItem): string {
  const key =
    item.parent != null
      ? `validationScripts.apiHelp.items.${item.parent}.${item.label}`
      : item.label === 'ctx' || item.label === 'report' || item.label === 'apply'
        ? `validationScripts.apiHelp.items.${item.label}.root`
        : `validationScripts.apiHelp.items.${item.label}`
  return te(key) ? t(key) : ''
}
</script>

<template>
  <aside class="script-api-help" aria-label="Script API help">
    <div class="script-api-help__header">
      <span class="script-api-help__title">{{ t('validationScripts.apiHelp.title') }}</span>
      <RouterLink
        class="script-api-help__docs-link"
        :to="{ name: 'docs-section', params: { section: 'validationScripts' } }"
      >
        {{ t('validationScripts.apiHelp.moreDocs') }}
        <UiIcon name="open_in_new" class="script-api-help__docs-icon" />
      </RouterLink>
    </div>

    <div class="script-api-help__body">
      <section v-for="group in groups" :key="group.id" class="script-api-help__group">
        <h3 class="script-api-help__group-title">{{ groupTitle(group.id) }}</h3>
        <ul class="script-api-help__list">
          <li v-for="item in group.items" :key="catalogItemKey(item)" class="script-api-help__item">
            <div class="script-api-help__name-row">
              <code class="script-api-help__name">{{ displayCatalogItemName(item) }}</code>
              <code v-if="item.detail" class="script-api-help__sig">{{ item.detail }}</code>
            </div>
            <p v-if="itemInfo(item)" class="script-api-help__info">
              {{ itemInfo(item) }}
            </p>
          </li>
        </ul>
      </section>

      <section class="script-api-help__group">
        <h3 class="script-api-help__group-title">{{ groupTitle('structures') }}</h3>
        <ul class="script-api-help__list">
          <li
            v-for="structure in structures"
            :key="structure.id"
            class="script-api-help__item"
          >
            <p class="script-api-help__info script-api-help__info--title">
              {{ structureTitle(structure.id) }}
            </p>
            <code class="script-api-help__fields">{{ structure.fields }}</code>
          </li>
        </ul>
      </section>
    </div>
  </aside>
</template>

<style scoped>
.script-api-help {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  height: 100%;
  background: var(--surface-muted);
  border-left: 1px solid var(--border);
}

.script-api-help__header {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}

.script-api-help__title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.script-api-help__docs-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--primary);
  text-decoration: none;
}

.script-api-help__docs-link:hover {
  text-decoration: underline;
}

.script-api-help__docs-icon {
  width: 14px;
  height: 14px;
}

.script-api-help__body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 8px 0 12px;
}

.script-api-help__group {
  padding: 8px 12px 4px;
}

.script-api-help__group-title {
  margin: 0 0 6px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-subtle);
}

.script-api-help__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.script-api-help__item {
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
}

.script-api-help__name-row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px 10px;
}

.script-api-help__name {
  font-size: 12px;
  font-weight: 600;
  color: var(--primary);
}

.script-api-help__sig {
  font-size: 11px;
  color: var(--text-subtle);
}

.script-api-help__info {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-muted);
}

.script-api-help__info--title {
  margin: 0 0 4px;
  font-weight: 600;
  color: var(--base-text);
}

.script-api-help__fields {
  display: block;
  font-size: 11px;
  line-height: 1.35;
  color: var(--primary);
  word-break: break-word;
}
</style>
