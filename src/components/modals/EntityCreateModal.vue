<script setup lang="ts">
import { computed } from "vue";
import BaseModal from "./BaseModal.vue";
import NameVersionForm from "../forms/NameVersionForm.vue";
import type { SourceVersion } from "../../composables/useEntityList";

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
  sourceVersions?: SourceVersion[];
  sourceVersionId?: string | null;
}>(), {
  namePlaceholder: undefined,
  versionPlaceholder: undefined,
  nameId: undefined,
  versionId: undefined,
  error: null,
  submitLabel: "Создать",
  submittingLabel: "Создание...",
  cancelLabel: "Отмена",
  sourceVersions: () => [],
  sourceVersionId: null
});

const emit = defineEmits<{
  close: [];
  submit: [];
  "update:name": [string];
  "update:version": [string];
  "update:sourceVersionId": [string | null];
}>();

const nameModel = computed({
  get: () => props.name,
  set: (value) => emit("update:name", value)
});

const versionModel = computed({
  get: () => props.version,
  set: (value) => emit("update:version", value)
});

const sourceVersionModel = computed({
  get: () => props.sourceVersionId ?? "",
  set: (value) => emit("update:sourceVersionId", value || null)
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
      <div v-if="sourceVersions.length > 0" class="form-field">
        <label class="form-label" for="source-version">Базовая версия</label>
        <select
          id="source-version"
          v-model="sourceVersionModel"
          class="form-select"
          :disabled="isSubmitting"
        >
          <option value="">Пустая нотация</option>
          <option
            v-for="sv in sourceVersions"
            :key="sv.id"
            :value="sv.id"
          >
            {{ sv.version }}
          </option>
        </select>
      </div>
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

.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-muted);
}

.form-select {
  padding: 10px 12px;
  font-size: 14px;
  font-family: inherit;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--base-text);
  cursor: pointer;
  transition: border-color 0.2s ease;
}

.form-select:hover:not(:disabled) {
  border-color: var(--primary);
}

.form-select:focus {
  outline: none;
  border-color: var(--primary);
}

.form-select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.form-error {
  padding: 12px 16px;
  background: var(--danger-soft);
  color: var(--danger);
  border-radius: var(--radius-sm);
  font-size: 14px;
  border: 1px solid rgba(239, 68, 68, 0.2);
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
  transition: background 0.2s ease, border-color 0.2s ease, opacity 0.2s ease;
  font-family: inherit;
  letter-spacing: 0.01em;
}

.btn--secondary {
  color: var(--text-muted);
  background: transparent;
  border: 1px solid var(--border);
}

.btn--secondary:hover:not(:disabled) {
  background: var(--surface-strong);
  color: var(--base-text);
}

.btn--secondary:disabled {
  opacity: 0.5;
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
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
