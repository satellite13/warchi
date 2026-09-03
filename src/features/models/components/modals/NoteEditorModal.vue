<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import BaseModal from '@/components/modals/BaseModal.vue'

defineProps<{
  text: string
}>()

const emit = defineEmits<{
  close: []
  save: []
  'update:text': [value: string]
}>()

const { t } = useI18n()
</script>

<template>
  <BaseModal :title="t('diagram.editNote')" max-width="560px" @close="emit('close')">
    <div class="form-grid">
      <label>
        <span>{{ t('models.noteTextLabel') }}</span>
        <textarea
          class="form-textarea form-textarea--lg"
          rows="8"
          :value="text"
          :placeholder="t('models.noteTextPlaceholder')"
          @input="emit('update:text', ($event.target as HTMLTextAreaElement).value)"
        />
      </label>
    </div>
    <template #footer>
      <button type="button" class="btn btn--secondary" @click="emit('close')">
        {{ t('common.cancel') }}
      </button>
      <button type="button" class="btn btn--primary" @click="emit('save')">
        {{ t('common.save') }}
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
