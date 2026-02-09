<script setup lang="ts">
import BaseModal from "../../../components/BaseModal.vue";
import TagSuggestions from "./TagSuggestions.vue";
import type { EditorNodeType, EditorLinkType } from "../types";

const nameModel = defineModel<string>("name", { default: "" });
const tagsModel = defineModel<string>("tags", { default: "" });
const versionModel = defineModel<string>("version", { default: "1.0.0" });
const typeSelectionModel = defineModel<string>("typeSelection", { default: "" });
const newTypeNameModel = defineModel<string>("newTypeName", { default: "" });

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
  gap: 12px;
}

.modal-label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: #5f6368;
}

.modal-label input,
.modal-label select {
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid #dfe1e5;
  font-size: 13px;
  color: #1f1f1f;
  box-sizing: border-box;
  height: 36px;
}

.form-error {
  padding: 12px 16px;
  background: #fdecea;
  color: #b3261e;
  border-radius: 8px;
  font-size: 14px;
}

.btn {
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 500;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease;
}

.btn--secondary {
  color: #5f6368;
  background: transparent;
  border: 1px solid #e0e0e0;
}

.btn--secondary:hover {
  background: #f8f9fa;
}

.btn--primary {
  color: #fff;
  background: #1a73e8;
  border: none;
}

.btn--primary:hover {
  background: #1557b0;
}
</style>
