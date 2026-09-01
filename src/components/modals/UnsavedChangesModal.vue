<script setup lang="ts">
import BaseModal from '@/components/modals/BaseModal.vue'

withDefaults(
  defineProps<{
    title: string
    message: string
    variant?: 'discard' | 'leave' | 'save-or-discard'
    stayLabel: string
    confirmLabel: string
    saveLabel?: string
    maxWidth?: string
    saveDisabled?: boolean
    confirmDisabled?: boolean
  }>(),
  {
    variant: 'discard',
    saveLabel: '',
    maxWidth: '400px',
    saveDisabled: false,
    confirmDisabled: false,
  },
)

const emit = defineEmits<{
  stay: []
  confirm: []
  save: []
  close: []
}>()
</script>

<template>
  <BaseModal :title="title" :max-width="maxWidth" @close="emit('close'); emit('stay')">
    <p class="unsaved-modal__text">{{ message }}</p>
    <template #footer>
      <button type="button" class="btn btn--secondary" @click="emit('stay')">
        {{ stayLabel }}
      </button>
      <button
        v-if="variant === 'save-or-discard'"
        type="button"
        class="btn btn--secondary"
        :disabled="confirmDisabled"
        @click="emit('confirm')"
      >
        {{ confirmLabel }}
      </button>
      <button
        v-if="variant === 'save-or-discard'"
        type="button"
        class="btn btn--primary"
        :disabled="saveDisabled"
        @click="emit('save')"
      >
        {{ saveLabel }}
      </button>
      <button
        v-else
        type="button"
        class="btn btn--danger"
        @click="emit('confirm')"
      >
        {{ confirmLabel }}
      </button>
    </template>
  </BaseModal>
</template>

<style scoped>
.unsaved-modal__text {
  margin: 0;
  font-size: 14px;
  color: var(--base-text);
  line-height: 1.55;
}
</style>
