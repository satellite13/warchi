<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
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
  sourceEmptyLabel?: string;
}>(), {
  namePlaceholder: undefined,
  versionPlaceholder: undefined,
  nameId: undefined,
  versionId: undefined,
  error: null,
  submitLabel: undefined,
  submittingLabel: undefined,
  cancelLabel: undefined,
  sourceVersions: () => [],
  sourceVersionId: null,
  sourceEmptyLabel: undefined
});

const { t } = useI18n();

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

const resolvedSubmitLabel = computed(() => props.submitLabel ?? t("common.create"));
const resolvedSubmittingLabel = computed(() => props.submittingLabel ?? t("common.creating"));
const resolvedCancelLabel = computed(() => props.cancelLabel ?? t("common.cancel"));
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
      <div v-if="sourceVersions.length > 0" class="source-version-field">
        <label class="source-version-field__label" for="source-version">{{ t("common.baseVersion") }}</label>
        <select
          id="source-version"
          v-model="sourceVersionModel"
          class="source-version-field__select"
          :disabled="isSubmitting"
        >
          <option value="">{{ props.sourceEmptyLabel ?? t("common.emptyNotation") }}</option>
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
        <button
          type="button"
          class="btn btn--secondary"
          :disabled="isSubmitting"
          @click="emit('close')"
        >
          {{ resolvedCancelLabel }}
        </button>
        <button
          type="submit"
          class="btn btn--primary"
          :disabled="isSubmitting"
        >
          {{ isSubmitting ? resolvedSubmittingLabel : resolvedSubmitLabel }}
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

.source-version-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.source-version-field__label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-muted);
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.source-version-field__select {
  box-sizing: border-box;
  height: 44px;
  padding: 12px 16px;
  font-size: 15px;
  line-height: 1.2;
  font-family: inherit;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-muted);
  color: var(--base-text);
  cursor: pointer;
  outline: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
}

.source-version-field__select:hover:not(:disabled) {
  border-color: var(--primary);
}

.source-version-field__select:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(124, 92, 252, 0.15);
  background: var(--surface);
}

.source-version-field__select:disabled {
  background: var(--surface-strong);
  color: var(--text-subtle);
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
</style>
