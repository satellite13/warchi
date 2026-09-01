<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import BaseModal from '@/components/modals/BaseModal.vue'

defineProps<{
  targetName: string
  targetVersion: string
  unmappedComponents: string[]
  unmappedRelations: string[]
  migrating?: boolean
}>()

const emit = defineEmits<{
  close: []
  confirm: []
}>()

const { t } = useI18n()
</script>

<template>
  <BaseModal :title="t('diagram.migrateNotationTitle')" max-width="520px" @close="emit('close')">
    <p class="leave-text">
      {{
        t('diagram.migrateNotationConfirm', {
          name: targetName,
          version: targetVersion,
        })
      }}
    </p>
    <p class="leave-text">{{ t('diagram.migrateNotationHint') }}</p>
    <div
      v-if="unmappedComponents.length || unmappedRelations.length"
      class="leave-text leave-text--warning"
    >
      <p v-if="unmappedComponents.length">
        {{
          t('diagram.migrateNotationUnmappedComponents', {
            list: unmappedComponents.join(', '),
          })
        }}
      </p>
      <p v-if="unmappedRelations.length">
        {{
          t('diagram.migrateNotationUnmappedRelations', {
            list: unmappedRelations.join(', '),
          })
        }}
      </p>
    </div>
    <template #footer>
      <button type="button" class="btn btn--secondary" :disabled="migrating" @click="emit('close')">
        {{ t('common.cancel') }}
      </button>
      <button
        type="button"
        class="btn btn--primary"
        :disabled="migrating"
        @click="emit('confirm')"
      >
        {{ migrating ? t('diagram.migrateNotationInProgress') : t('diagram.migrateNotationAction') }}
      </button>
    </template>
  </BaseModal>
</template>

<style scoped>
.leave-text {
  margin: 0 0 12px;
  font-size: 14px;
  color: var(--text-muted);
  line-height: 1.55;
}

.leave-text--warning {
  color: var(--warning);
}

.leave-text--warning p {
  margin: 0 0 8px;
}
</style>
