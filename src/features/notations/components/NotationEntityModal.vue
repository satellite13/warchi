<script setup lang="ts">
import { computed } from "vue"
import { useI18n } from "vue-i18n"
import BaseModal from "@/components/modals/BaseModal.vue"
import NameVersionForm from "@/components/forms/NameVersionForm.vue"
import SearchableSelect from "@/components/forms/SearchableSelect.vue"
import TagSuggestions from "./TagSuggestions.vue"
import type { EditorNodeType, EditorLinkType } from "../types"
import type { ComponentStylePreset, RelationStylePreset } from "@/features/diagram-style/styles/stylePresets"

const nameModel = defineModel<string>("name", { default: "" })
const tagsModel = defineModel<string>("tags", { default: "" })
const versionModel = defineModel<string>("version", { default: "1.0.0" })
const typeSelectionModel = defineModel<string>("typeSelection", { default: "" })
const newTypeNameModel = defineModel<string>("newTypeName", { default: "" })
const componentKindModel = defineModel<string>("componentKind", { default: "simple" })
const stylePresetModel = defineModel<string>("stylePreset", { default: "default" })

const props = defineProps<{
  title: string
  formId: string
  nameLabel: string
  namePlaceholder?: string
  versionLabel?: string
  versionPlaceholder?: string
  tagsLabel: string
  tagsPlaceholder?: string
  typeLabel: string
  typeOptions: (EditorNodeType | EditorLinkType)[]
  noTypeValue?: string
  noTypeLabel?: string
  newTypeValue: string
  newTypeLabel: string
  newTypePlaceholder?: string
  componentKindLabel?: string
  componentKindOptions?: Array<{ id: string; label: string }>
  styleLabel?: string
  stylePresets: (ComponentStylePreset | RelationStylePreset)[]
  suggestions: string[]
  error?: string | null
}>()

const emit = defineEmits<{
  close: []
  submit: []
  selectTag: [string]
}>()

const { t } = useI18n()

const typeSelectOptions = computed(() => [
  ...(props.noTypeValue && props.noTypeLabel
    ? [{ id: props.noTypeValue, label: props.noTypeLabel }]
    : []),
  { id: props.newTypeValue, label: `+ ${props.newTypeLabel}` },
  ...props.typeOptions.map((type) => ({ id: type.id, label: type.name }))
])

const stylePresetSelectOptions = computed(() => [
  ...props.stylePresets.filter((p) => !p._isUser),
  ...props.stylePresets.filter((p) => p._isUser)
].map((p) => ({ id: p.name, label: p.label })))
</script>

<template>
  <BaseModal
    :title="title"
    @close="emit('close')"
  >
    <form
      :id="formId"
      class="modal-form"
      @submit.prevent="emit('submit')"
    >
      <NameVersionForm
        v-model:name="nameModel"
        v-model:version="versionModel"
        :name-label="nameLabel"
        :version-label="versionLabel || t('common.version')"
        :name-placeholder="namePlaceholder"
        :version-placeholder="versionPlaceholder || '1.0.0'"
      />
      <label class="modal-label">
        {{ tagsLabel }}
        <input
          v-model="tagsModel"
          class="form-input form-input--lg"
          type="text"
          :placeholder="tagsPlaceholder"
        >
      </label>
      <TagSuggestions
        v-if="suggestions.length"
        :suggestions="suggestions"
        @select="emit('selectTag', $event)"
      />
      <label class="modal-label">
        {{ typeLabel }}
        <SearchableSelect
          v-model="typeSelectionModel"
          :options="typeSelectOptions"
          :placeholder="t('types.selectType')"
          :search-placeholder="t('common.search')"
          :empty-text="t('common.nothingFound')"
        />
      </label>
      <label
        v-if="componentKindOptions?.length"
        class="modal-label"
      >
        {{ componentKindLabel }}
        <SearchableSelect
          v-model="componentKindModel"
          :options="componentKindOptions"
          :placeholder="t('common.selectValue')"
          :search-placeholder="t('common.search')"
          :empty-text="t('common.nothingFound')"
        />
      </label>
      <label
        v-if="typeSelectionModel === newTypeValue"
        class="modal-label"
      >
        {{ newTypeLabel }}
        <input
          v-model="newTypeNameModel"
          class="form-input form-input--lg"
          type="text"
          :placeholder="newTypePlaceholder"
        >
      </label>
      <label class="modal-label">
        {{ styleLabel || t('nodeStyle.figureStyleLabel') }}
        <SearchableSelect
          v-model="stylePresetModel"
          :options="stylePresetSelectOptions"
          :placeholder="t('common.selectValue')"
          :search-placeholder="t('common.search')"
          :empty-text="t('common.nothingFound')"
        />
      </label>
      <p
        v-if="error"
        class="form-error"
      >
        {{ error }}
      </p>
    </form>
    <template #footer>
      <button
        type="button"
        class="btn btn--secondary"
        @click="emit('close')"
      >
        {{ t('common.cancel') }}
      </button>
      <button
        type="submit"
        :form="formId"
        class="btn btn--primary"
      >
        {{ t('common.create') }}
      </button>
    </template>
  </BaseModal>
</template>

<style scoped>
.modal-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.modal-label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-muted);
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.modal-label :deep(.searchable-select__control) {
  height: 40px;
  min-height: 40px;
  padding: 0 10px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--surface-muted);
  font-size: 13px;
  line-height: 1.2;
}

.modal-label :deep(.searchable-select__control:hover) {
  border-color: var(--border-strong);
}

.modal-label :deep(.searchable-select__value) {
  font-size: 13px;
}

.modal-label :deep(.searchable-select__arrow) {
  width: 16px;
  height: 16px;
}

.form-error {
  text-transform: none;
}

</style>
