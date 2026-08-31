<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import BaseModal from '@/components/modals/BaseModal.vue'

defineProps<{
  content: string
}>()

const emit = defineEmits<{
  close: []
  copy: []
}>()

const { t } = useI18n()
</script>

<template>
  <BaseModal :title="t('models.diagramJsonTitle')" max-width="600px" @close="emit('close')">
    <pre class="json-viewer">{{ content }}</pre>
    <template #footer>
      <button type="button" class="btn btn--secondary" @click="emit('copy')">
        {{ t('models.copy') }}
      </button>
      <button type="button" class="btn btn--secondary" @click="emit('close')">
        {{ t('common.close') }}
      </button>
    </template>
  </BaseModal>
</template>

<style scoped>
.json-viewer {
  margin: 0;
  padding: 12px;
  background: var(--surface-muted);
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 12px;
  font-family: 'SF Mono', 'Fira Code', monospace;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 420px;
  overflow: auto;
}
</style>
