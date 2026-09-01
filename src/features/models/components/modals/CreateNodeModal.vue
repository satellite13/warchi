<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import BaseModal from '@/components/modals/BaseModal.vue'
import SearchableSelect from '@/components/forms/SearchableSelect.vue'

defineProps<{
  title: string
  kind: 'folder' | 'node'
  name: string
  nodeTypeId: string
  nodeTypeOptions: Array<{ id: string; label: string }>
  canCreate: boolean
  pending?: boolean
}>()

const emit = defineEmits<{
  close: []
  create: []
  'update:name': [value: string]
  'update:nodeTypeId': [value: string]
}>()

const { t } = useI18n()
</script>

<template>
  <BaseModal :title="title" max-width="440px" @close="emit('close')">
    <div class="form-grid">
      <label>
        <span>{{ t('common.name') }}</span>
        <input
          class="form-input"
          :value="name"
          :disabled="pending"
          :placeholder="
            kind === 'folder' ? t('models.newFolderPlaceholder') : t('models.newNodePlaceholder')
          "
          @input="emit('update:name', ($event.target as HTMLInputElement).value)"
          @keydown.enter.prevent="canCreate && !pending && emit('create')"
        />
      </label>
      <label v-if="kind === 'node'">
        <span>{{ t('models.nodeTypeLabel') }}</span>
        <SearchableSelect
          :model-value="nodeTypeId"
          :options="nodeTypeOptions"
          :placeholder="t('models.selectType')"
          :search-placeholder="t('models.typeSearchPlaceholder')"
          :empty-text="t('common.nothingFound')"
          :disabled="pending"
          @update:model-value="emit('update:nodeTypeId', $event)"
        />
      </label>
      <div v-else class="form-hint">{{ t('models.directoryTypeHint') }}</div>
    </div>
    <template #footer>
      <button type="button" class="btn btn--secondary" :disabled="pending" @click="emit('close')">
        {{ t('common.cancel') }}
      </button>
      <button
        type="button"
        class="btn btn--primary"
        :disabled="!canCreate || pending"
        @click="emit('create')"
      >
        {{ t('common.create') }}
      </button>
    </template>
  </BaseModal>
</template>

<style scoped>
.form-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.form-grid label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--text-muted);
}

.form-hint {
  font-size: 12px;
  color: var(--text-muted);
  background: var(--surface-strong);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 10px;
}
</style>
