<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ValidationScriptResponse } from '@/types/api'
import { canEditByAccessPermission } from '@/utils/accessPermission'
import EditorSidebarShell from '@/components/list/EditorSidebarShell.vue'
import SidebarListItem from '@/components/list/SidebarListItem.vue'

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
      <SidebarListItem
        v-for="(script, idx) in sortedScripts"
        :key="script.id"
        :title="script.name || t('common.unnamed')"
        :subtitle="script.description || ''"
        icon="terminal"
        :active="selectedScriptId === script.id"
        :locked="!canEditByAccessPermission(script.accessPermission)"
        :lock-title="t('validationScripts.noEditRights')"
        :animation-index="idx"
        @click="emit('selectScript', script.id)"
      />
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
</style>
