<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import BaseModal from '@/components/modals/BaseModal.vue'

const props = withDefaults(
  defineProps<{
    originalName: string
    originalVersion: string
    name: string
    version: string
    isSubmitting?: boolean
    error?: string | null
  }>(),
  {
    isSubmitting: false,
    error: null,
  }
)

const emit = defineEmits<{
  close: []
  submit: []
  'update:name': [string]
  'update:version': [string]
}>()

const { t } = useI18n()

const nameModel = computed({
  get: () => props.name,
  set: value => emit('update:name', value),
})

const versionModel = computed({
  get: () => props.version,
  set: value => emit('update:version', value),
})

const canSubmit = computed(
  () => !!props.name.trim() && !!props.version.trim() && !props.isSubmitting
)
</script>

<template>
  <BaseModal :title="t('models.packageImportModelExistsTitle')" @close="emit('close')">
    <form class="package-conflict-form" @submit.prevent="emit('submit')">
      <p class="package-conflict-form__hint">
        {{
          t('models.packageImportModelExistsHint', {
            name: originalName,
            version: originalVersion,
          })
        }}
      </p>
      <label class="package-conflict-form__field">
        <span class="package-conflict-form__label">{{ t('common.name') }}</span>
        <input
          v-model="nameModel"
          class="form-input form-input--lg"
          type="text"
          :disabled="isSubmitting"
          autofocus
        >
      </label>
      <label class="package-conflict-form__field">
        <span class="package-conflict-form__label">{{ t('common.version') }}</span>
        <input
          v-model="versionModel"
          class="form-input form-input--lg"
          type="text"
          :disabled="isSubmitting"
        >
      </label>
      <div v-if="error" class="package-conflict-form__error">{{ error }}</div>
      <div class="package-conflict-form__actions">
        <button
          type="button"
          class="btn btn--secondary"
          :disabled="isSubmitting"
          @click="emit('close')"
        >
          {{ t('common.cancel') }}
        </button>
        <button type="submit" class="btn btn--primary" :disabled="!canSubmit">
          {{ isSubmitting ? t('models.packageImporting') : t('models.packageImportRetry') }}
        </button>
      </div>
    </form>
  </BaseModal>
</template>

<style scoped>
.package-conflict-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.package-conflict-form__hint {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.95rem;
  line-height: 1.4;
}

.package-conflict-form__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.package-conflict-form__label {
  font-size: 0.875rem;
  color: var(--text-muted);
}

.package-conflict-form__error {
  color: var(--danger);
  font-size: 0.875rem;
}

.package-conflict-form__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
