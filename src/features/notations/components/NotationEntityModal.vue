<script setup lang="ts">
import { computed } from "vue"
import { useI18n } from "vue-i18n"
import BaseModal from "@/components/modals/BaseModal.vue"
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
      <label class="modal-label">
        {{ nameLabel }}
        <input
          v-model="nameModel"
          type="text"
          :placeholder="namePlaceholder"
        >
      </label>
      <label class="modal-label">
        {{ versionLabel || 'Версия' }}
        <input
          v-model="versionModel"
          type="text"
          :placeholder="versionPlaceholder || '1.0.0'"
        >
      </label>
      <label class="modal-label">
        {{ tagsLabel }}
        <input
          v-model="tagsModel"
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
        Отмена
      </button>
      <button
        type="submit"
        :form="formId"
        class="btn btn--primary"
      >
        Добавить
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

.modal-label input,
.modal-label select {
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  font-size: 14px;
  font-family: inherit;
  color: var(--base-text);
  background: var(--surface-muted);
  box-sizing: border-box;
  height: 40px;
  outline: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
  text-transform: none;
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

.modal-label input:focus,
.modal-label select:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(124, 92, 252, 0.12);
  background: var(--surface);
}

.modal-label input::placeholder {
  color: var(--text-subtle);
}

.form-error {
  padding: 12px 16px;
  background: var(--danger-soft);
  color: var(--danger);
  border-radius: var(--radius-sm);
  font-size: 14px;
  border: 1px solid rgba(220, 53, 69, 0.15);
  text-transform: none;
}

</style>
