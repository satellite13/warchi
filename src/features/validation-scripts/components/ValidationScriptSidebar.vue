<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ValidationScriptResponse } from '@/types/api'
import { canEditByAccessPermission } from '@/utils/accessPermission'
import EditorSidebarShell from '@/components/list/EditorSidebarShell.vue'

const props = defineProps<{
  scripts: ValidationScriptResponse[]
  selectedScriptId: string | null
  isLoading: boolean
}>()

const emit = defineEmits<{
  selectScript: [id: string]
  addScript: []
}>()

const scriptSearchQuery = ref('')
const { t, locale } = useI18n()

const filteredScripts = computed(() => {
  const query = scriptSearchQuery.value.trim().toLowerCase()
  if (!query) return props.scripts
  return props.scripts.filter((script) => {
    const name = script.name.toLowerCase()
    const description = (script.description ?? '').toLowerCase()
    return name.includes(query) || description.includes(query)
  })
})

const sortedScripts = computed(() => {
  const localeTag = locale.value === 'ru' ? 'ru' : 'en'
  return [...filteredScripts.value].sort((a, b) =>
    (a.name || '~~~').localeCompare(b.name || '~~~', localeTag, {
      sensitivity: 'base',
      numeric: true,
    }),
  )
})

const totalCount = computed(() => props.scripts.length)
</script>

<template>
  <EditorSidebarShell
    v-model:search-query="scriptSearchQuery"
    :title="t('validationScripts.title')"
    :count="totalCount"
    :is-loading="isLoading"
    :search-placeholder="t('validationScripts.searchPlaceholder')"
  >
    <template #actions>
      <button
        type="button"
        class="ess-action-btn"
        :title="t('validationScripts.addScript')"
        @click="emit('addScript')"
      >
        <UiIcon name="add" />
      </button>
    </template>

    <div v-if="props.scripts.length === 0" class="ess-empty">
      {{ t('validationScripts.noScripts') }}
    </div>
    <div v-else-if="sortedScripts.length === 0" class="ess-empty">
      {{ t('common.nothingFound') }}
    </div>
    <ul v-else class="validation-script-sidebar__items">
      <li
        v-for="(script, idx) in sortedScripts"
        :key="script.id"
        class="validation-script-sidebar__item"
        :class="{ 'validation-script-sidebar__item--active': selectedScriptId === script.id }"
        :style="{ animationDelay: `${idx * 30}ms` }"
        role="button"
        tabindex="0"
        @click="emit('selectScript', script.id)"
        @keydown.enter.prevent="emit('selectScript', script.id)"
        @keydown.space.prevent="emit('selectScript', script.id)"
      >
        <UiIcon name="terminal" class="validation-script-sidebar__item-icon" />
        <div class="validation-script-sidebar__item-info">
          <span class="validation-script-sidebar__item-name">
            {{ script.name || t('common.unnamed') }}
          </span>
          <span
            v-if="script.description"
            class="validation-script-sidebar__item-desc"
          >
            {{ script.description }}
          </span>
        </div>
        <span
          v-if="!canEditByAccessPermission(script.accessPermission)"
          class="validation-script-sidebar__item-lock"
          :title="t('validationScripts.noEditRights')"
        >
          <UiIcon name="lock" />
        </span>
      </li>
    </ul>
  </EditorSidebarShell>
</template>

<style scoped>
.validation-script-sidebar__items {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.validation-script-sidebar__item {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 9px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition:
    background 0.15s ease,
    border-left-color 0.15s ease;
  border-left: 3px solid transparent;
  box-sizing: border-box;
  animation: validationScriptSidebarFadeIn 0.25s ease both;
}

.validation-script-sidebar__item:hover {
  background: var(--surface-strong);
}

.validation-script-sidebar__item:not(.validation-script-sidebar__item--active):hover {
  border-left-color: rgba(124, 92, 252, 0.3);
}

.validation-script-sidebar__item--active {
  background: var(--primary-soft);
  border-left-color: var(--primary);
}

.validation-script-sidebar__item--active:hover {
  background: var(--primary-soft);
}

.validation-script-sidebar__item:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: -2px;
}

@keyframes validationScriptSidebarFadeIn {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.validation-script-sidebar__item-icon {
  width: 20px;
  height: 20px;
  color: var(--text-subtle);
  flex-shrink: 0;
}

.validation-script-sidebar__item--active .validation-script-sidebar__item-icon {
  color: var(--primary);
}

.validation-script-sidebar__item-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  flex: 1;
}

.validation-script-sidebar__item-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--base-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.validation-script-sidebar__item-desc {
  font-size: 11px;
  color: var(--text-subtle);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.validation-script-sidebar__item-lock {
  color: var(--text-subtle);
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.validation-script-sidebar__item-lock .ui-icon {
  width: 16px;
  height: 16px;
}
</style>
