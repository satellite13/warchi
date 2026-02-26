<script setup lang="ts">
import BaseModal from "../../../components/modals/BaseModal.vue";
import TagSuggestions from "./TagSuggestions.vue";
import type { EditorNodeType, EditorLinkType } from "../types";
import type { ComponentStylePreset, RelationStylePreset } from "../styles/stylePresets";

const nameModel = defineModel<string>("name", { default: "" });
const tagsModel = defineModel<string>("tags", { default: "" });
const versionModel = defineModel<string>("version", { default: "1.0.0" });
const typeSelectionModel = defineModel<string>("typeSelection", { default: "" });
const newTypeNameModel = defineModel<string>("newTypeName", { default: "" });
const stylePresetModel = defineModel<string>("stylePreset", { default: "default" });

defineProps<{
  title: string;
  formId: string;
  nameLabel: string;
  namePlaceholder?: string;
  versionLabel?: string;
  versionPlaceholder?: string;
  tagsLabel: string;
  tagsPlaceholder?: string;
  typeLabel: string;
  typeOptions: (EditorNodeType | EditorLinkType)[];
  newTypeValue: string;
  newTypeLabel: string;
  newTypePlaceholder?: string;
  styleLabel?: string;
  stylePresets: (ComponentStylePreset | RelationStylePreset)[];
  suggestions: string[];
  error?: string | null;
}>();

const emit = defineEmits<{
  close: [];
  submit: [];
  selectTag: [string];
}>();
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
        <select v-model="typeSelectionModel">
          <option :value="newTypeValue">+ {{ newTypeLabel }}</option>
          <option
            v-for="type in typeOptions"
            :key="type.id"
            :value="type.id"
          >
            {{ type.name }}
          </option>
        </select>
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
        {{ styleLabel || 'Стиль' }}
        <select v-model="stylePresetModel">
          <optgroup label="Встроенные">
            <option
              v-for="preset in stylePresets.filter(p => !p._isUser)"
              :key="preset.name"
              :value="preset.name"
            >
              {{ preset.label }}
            </option>
          </optgroup>
          <optgroup v-if="stylePresets.some(p => p._isUser)" label="Мои пресеты">
            <option
              v-for="preset in stylePresets.filter(p => p._isUser)"
              :key="preset.name"
              :value="preset.name"
            >
              {{ preset.label }}
            </option>
          </optgroup>
        </select>
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
