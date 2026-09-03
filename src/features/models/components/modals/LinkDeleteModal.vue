<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import BaseModal from '@/components/modals/BaseModal.vue'

defineProps<{
  allowRemoveFromModel: boolean
}>()

const emit = defineEmits<{
  close: []
  removeFromDiagram: []
  removeFromModel: []
}>()

const { t } = useI18n()
</script>

<template>
  <BaseModal :title="t('models.deleteLinkTitle')" max-width="500px" @close="emit('close')">
    <p class="leave-text">
      {{ t('models.deleteLinkQuestion') }}
    </p>
    <template #footer>
      <button type="button" class="btn btn--secondary" @click="emit('close')">
        {{ t('common.cancel') }}
      </button>
      <button type="button" class="btn btn--secondary" @click="emit('removeFromDiagram')">
        {{ t('models.removeLinkFromDiagram') }}
      </button>
      <button
        v-if="allowRemoveFromModel"
        type="button"
        class="btn btn--danger"
        @click="emit('removeFromModel')"
      >
        {{ t('models.removeLinkFromModel') }}
      </button>
    </template>
  </BaseModal>
</template>

<style scoped>
.leave-text {
  margin: 0;
  font-size: 14px;
  color: var(--text-muted);
  line-height: 1.55;
}
</style>
