<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import BaseModal from '@/components/modals/BaseModal.vue'
import NameVersionForm from '@/components/forms/NameVersionForm.vue'
import SearchableSelect from '@/components/forms/SearchableSelect.vue'

defineProps<{
  name: string
  version: string
  notationId: string
  notationOptions: Array<{ id: string; label: string }>
  hasNameVersionConflict: boolean
  trashConflict: { name: string; version: string; suggestedVersion?: string | null } | null
  pending?: boolean
}>()

const emit = defineEmits<{
  close: []
  create: []
  bumpVersion: []
  replaceDeleted: []
  'update:name': [value: string]
  'update:version': [value: string]
  'update:notationId': [value: string]
}>()

const { t } = useI18n()
</script>

<template>
  <BaseModal :title="t('models.createDiagramTitle')" max-width="460px" @close="emit('close')">
    <div class="form-grid">
      <NameVersionForm
        :name="name"
        :version="version"
        :name-label="t('common.name')"
        :version-label="t('common.version')"
        :name-placeholder="t('models.newDiagramPlaceholder')"
        version-placeholder="1.0.0"
        @update:name="emit('update:name', $event)"
        @update:version="emit('update:version', $event)"
      />
      <label>
        <span>{{ t('models.notationLabel') }}</span>
        <SearchableSelect
          :model-value="notationId"
          :options="notationOptions"
          :placeholder="t('models.notationLabel')"
          @update:model-value="emit('update:notationId', $event)"
        />
      </label>
      <div v-if="hasNameVersionConflict" class="form-error">
        {{ t('models.diagramConflictMessage') }}
      </div>
      <div v-else-if="trashConflict" class="form-error">
        {{
          t('models.diagramTrashConflictMessage', {
            name: trashConflict.name,
            version: trashConflict.version,
          })
        }}
      </div>
    </div>
    <template #footer>
      <button type="button" class="btn btn--secondary" @click="emit('close')">
        {{ t('common.cancel') }}
      </button>
      <template v-if="trashConflict">
        <button
          type="button"
          class="btn btn--secondary"
          :disabled="!trashConflict.suggestedVersion"
          @click="emit('bumpVersion')"
        >
          {{
            t('models.diagramTrashConflictBump', {
              version: trashConflict.suggestedVersion ?? '',
            })
          }}
        </button>
        <button type="button" class="btn btn--danger" @click="emit('replaceDeleted')">
          {{ t('models.diagramTrashConflictReplace') }}
        </button>
      </template>
      <button
        v-else
        type="button"
        class="btn btn--primary"
        :disabled="hasNameVersionConflict || pending"
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
</style>
