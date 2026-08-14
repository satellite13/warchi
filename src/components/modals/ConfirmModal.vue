<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import BaseModal from '@/components/modals/BaseModal.vue'

withDefaults(
  defineProps<{
    title: string
    message: string
    confirmLabel?: string
    cancelLabel?: string
    danger?: boolean
    maxWidth?: string
  }>(),
  {
    confirmLabel: '',
    cancelLabel: '',
    danger: false,
    maxWidth: '500px',
  },
)

const emit = defineEmits<{
  close: []
  confirm: []
}>()

const { t } = useI18n()
</script>

<template>
  <BaseModal :title="title" :max-width="maxWidth" @close="emit('close')">
    <p class="confirm-modal__text">{{ message }}</p>
    <template #footer>
      <button type="button" class="btn btn--secondary" @click="emit('close')">
        {{ cancelLabel || t('common.cancel') }}
      </button>
      <button
        type="button"
        class="btn"
        :class="danger ? 'btn--danger' : 'btn--primary'"
        @click="emit('confirm')"
      >
        {{ confirmLabel || t('common.delete') }}
      </button>
    </template>
  </BaseModal>
</template>

<style scoped>
.confirm-modal__text {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
  color: var(--text-muted);
}
</style>
