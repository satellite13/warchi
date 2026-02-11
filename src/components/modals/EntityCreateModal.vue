<script setup lang="ts">
import { computed } from "vue";
import BaseModal from "./BaseModal.vue";
import NameVersionForm from "../forms/NameVersionForm.vue";

const props = withDefaults(defineProps<{
  title: string;
  name: string;
  version: string;
  nameLabel: string;
  versionLabel: string;
  namePlaceholder?: string;
  versionPlaceholder?: string;
  nameId?: string;
  versionId?: string;
  isSubmitting?: boolean;
  error?: string | null;
  submitLabel?: string;
  submittingLabel?: string;
  cancelLabel?: string;
}>(), {
  namePlaceholder: undefined,
  versionPlaceholder: undefined,
  nameId: undefined,
  versionId: undefined,
  error: null,
  submitLabel: "Создать",
  submittingLabel: "Создание...",
  cancelLabel: "Отмена"
});

const emit = defineEmits<{
  close: [];
  submit: [];
  "update:name": [string];
  "update:version": [string];
}>();

const nameModel = computed({
  get: () => props.name,
  set: (value) => emit("update:name", value)
});

const versionModel = computed({
  get: () => props.version,
  set: (value) => emit("update:version", value)
});
</script>

<template>
  <BaseModal :title="title" @close="emit('close')">
    <form class="create-form" @submit.prevent="emit('submit')">
      <NameVersionForm
        v-model:name="nameModel"
        v-model:version="versionModel"
        :name-label="nameLabel"
        :version-label="versionLabel"
        :name-placeholder="namePlaceholder"
        :version-placeholder="versionPlaceholder"
        :name-id="nameId"
        :version-id="versionId"
        :disabled="isSubmitting"
      />
      <div v-if="error" class="form-error">
        {{ error }}
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn--secondary" :disabled="isSubmitting" @click="emit('close')">
          {{ cancelLabel }}
        </button>
        <button type="submit" class="btn btn--primary" :disabled="isSubmitting">
          {{ isSubmitting ? submittingLabel : submitLabel }}
        </button>
      </div>
    </form>
  </BaseModal>
</template>

<style scoped>
.create-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-error {
  padding: 12px 16px;
  background: var(--danger-soft);
  color: var(--danger);
  border-radius: var(--radius-sm);
  font-size: 14px;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 8px;
}

.btn {
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 500;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease;
}

.btn--secondary {
  color: var(--text-muted);
  background: transparent;
  border: 1px solid var(--border);
}

.btn--secondary:hover:not(:disabled) {
  background: var(--surface-muted);
}

.btn--secondary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn--primary {
  color: #fff;
  background: var(--primary);
  border: none;
}

.btn--primary:hover:not(:disabled) {
  background: var(--primary-hover);
}

.btn--primary:disabled {
  background: var(--border-strong);
  cursor: not-allowed;
}
</style>
