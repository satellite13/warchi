<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import BaseModal from '@/components/modals/BaseModal.vue'

defineProps<{
  name: string
  version: string
  suggestedVersion?: string | null
}>()

const emit = defineEmits<{
  close: []
  bump: []
  replace: []
}>()

const { t } = useI18n()
</script>

<template>
  <BaseModal
    :title="t('models.diagramTrashConflictTitle')"
    max-width="520px"
    @close="emit('close')"
  >
    <p class="confirm-modal__text">
      {{
        t('models.diagramTrashConflictMessage', {
          name,
          version,
        })
      }}
    </p>
    <template #footer>
      <button type="button" class="btn btn--secondary" @click="emit('close')">
        {{ t('common.cancel') }}
      </button>
      <button
        type="button"
        class="btn btn--secondary"
        :disabled="!suggestedVersion"
        @click="emit('bump')"
      >
        {{
          t('models.diagramTrashConflictBump', {
            version: suggestedVersion ?? '',
          })
        }}
      </button>
      <button type="button" class="btn btn--danger" @click="emit('replace')">
        {{ t('models.diagramTrashConflictReplace') }}
      </button>
    </template>
  </BaseModal>
</template>

<style scoped>
.confirm-modal__text {
  margin: 0;
  font-size: 14px;
  color: var(--base-text);
  line-height: 1.55;
}
</style>
