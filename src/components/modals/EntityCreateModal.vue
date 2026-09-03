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
    <form id="entity-create-form" class="create-form" @submit.prevent="emit('submit')">
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
          class="form-select form-select--lg"
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
    </form>
    <template #footer>
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
        form="entity-create-form"
        class="btn btn--primary"
        :disabled="isSubmitting"
      >
        {{ isSubmitting ? resolvedSubmittingLabel : resolvedSubmitLabel }}
      </button>
    </template>
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
</style>
