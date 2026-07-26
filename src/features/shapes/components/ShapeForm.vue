<script setup lang="ts">
import { useI18n } from "vue-i18n"
import type { NodeShapeResponse } from "@/types/api"
import type { OutlineSegment, ScaleSlice } from "@/domain/attrs/notationAttrs"
import EditorFormHeader from "@/components/forms/EditorFormHeader.vue"
import CustomOutlineEditor from "../CustomOutlineEditor.vue"
import ShapeScalePreview from "./ShapeScalePreview.vue"

defineProps<{
  selectedShape: NodeShapeResponse | null
  name: string
  outline: OutlineSegment[]
  scaleSlice: ScaleSlice | null
  scaleSliceEnabled: boolean
  ownerDisplayName: string
  canEdit: boolean
  canShare?: boolean
  isDirty: boolean
  isSaving: boolean
  isDeleting: boolean
  hasDoc?: boolean
}>()

const emit = defineEmits<{
  save: []
  delete: []
  share: []
  openDoc: []
  "update:name": [value: string]
  "update:outline": [value: OutlineSegment[]]
  "update:scaleSlice": [value: ScaleSlice | null]
  "update:scaleSliceEnabled": [value: boolean]
}>()

const { t } = useI18n()
</script>

<template>
  <div class="shape-form">
    <EditorFormHeader
      :title="name || t('shapes.title')"
      icon="hexagon"
      help-docs-section="shapes"
      :help-title="t('shapes.editorDescriptionLink')"
      :is-dirty="isDirty"
      :is-saving="isSaving"
      :is-deleting="isDeleting"
      :can-edit="canEdit"
      :can-share="!!canShare"
      :show-doc-button="canEdit || !!hasDoc"
      :has-doc="hasDoc"
      :doc-button-title="t('notations.documentation')"
      :show-unsaved-badge="false"
      :save-disabled="isSaving || isDeleting || !name.trim() || !isDirty"
      @save="emit('save')"
      @delete="emit('delete')"
      @share="emit('share')"
      @open-doc="emit('openDoc')"
    />

    <div class="shape-form__body">
      <p v-if="selectedShape && !canEdit" class="shape-form__no-edit">
        {{ t("shapes.noEditRights") }}
      </p>

      <div class="form-section">
        <h3 class="form-section__title">{{ t("types.main") }}</h3>
        <div class="form-row">
          <label class="form-label">{{ t("common.name") }}</label>
          <input
            :value="name"
            class="form-input"
            :placeholder="t('shapes.nameLabel')"
            :disabled="!canEdit"
            @input="emit('update:name', ($event.target as HTMLInputElement).value)"
          />
        </div>
        <div class="form-row">
          <label class="form-label">{{ t("common.author") }}</label>
          <div class="form-input form-input--readonly">{{ ownerDisplayName }}</div>
        </div>
        <div class="form-row form-row--toggle">
          <label class="form-label" for="shape-scale-slice-toggle">{{ t("shapes.scaleSliceToggle") }}</label>
          <input
            id="shape-scale-slice-toggle"
            type="checkbox"
            class="form-checkbox"
            :checked="scaleSliceEnabled"
            :disabled="!canEdit"
            @change="emit('update:scaleSliceEnabled', ($event.target as HTMLInputElement).checked)"
          />
        </div>
        <p v-if="scaleSliceEnabled" class="form-hint">{{ t("shapes.scaleSliceHint") }}</p>
      </div>

      <div class="form-section">
        <h3 class="form-section__title">{{ t("shapes.outlineLabel") }}</h3>
        <div v-if="outline.length > 0" class="shape-form__outline-workspace shape-form__outline-workspace--split">
          <div class="shape-form__outline-pane">
            <p class="shape-form__pane-label">{{ t("shapes.scaleSliceTemplate") }}</p>
            <CustomOutlineEditor
              :model-value="outline"
              :disabled="!canEdit"
              :scale-slice="scaleSlice"
              :show-scale-guides="scaleSliceEnabled"
              @update:model-value="emit('update:outline', $event)"
              @update:scale-slice="emit('update:scaleSlice', $event)"
            />
          </div>
          <div class="shape-form__preview-pane">
            <p class="shape-form__pane-label">{{ t("shapes.scaleSlicePreview") }}</p>
            <ShapeScalePreview
              :outline="outline"
              :scale-slice="scaleSliceEnabled ? scaleSlice : null"
              :disabled="!canEdit"
              :initial-width="scaleSlice?.refWidth ?? 180"
              :initial-height="scaleSlice?.refHeight ?? 120"
            />
          </div>
        </div>
        <p v-else class="form-section__empty">{{ t("shapes.outlinePlaceholder") }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes fadeSlideIn {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.shape-form {
  flex: 1;
  min-width: 0;
}

.shape-form__body {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.shape-form__no-edit {
  padding: 12px 16px;
  background: var(--surface-strong);
  border-radius: 10px;
  color: var(--text-muted);
  font-size: 13px;
  margin: 0;
  border: 1px solid var(--border);
}

.shape-form__outline-workspace {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 280px;
}

.shape-form__outline-workspace--split {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px;
  align-items: stretch;
}

@media (max-width: 1100px) {
  .shape-form__outline-workspace--split {
    grid-template-columns: 1fr;
  }
}

.shape-form__outline-pane,
.shape-form__preview-pane {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.shape-form__pane-label {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
}

.form-section {
  background: var(--surface);
  border-radius: 12px;
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: var(--shadow-sm);
  border: 1px solid var(--border);
  animation: fadeSlideIn 0.3s ease both;
}

.form-section__title {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.form-section__empty {
  margin: 0;
  font-size: 13px;
  color: var(--text-subtle);
}

.form-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.form-row--toggle {
  justify-content: flex-start;
}

.form-label {
  flex: 0 0 120px;
  font-size: 13px;
  color: var(--text-muted);
}

.form-checkbox {
  width: 16px;
  height: 16px;
  accent-color: var(--primary);
}

.form-hint {
  margin: 0;
  font-size: 12px;
  color: var(--text-subtle);
  line-height: 1.45;
}

.form-input {
  flex: 1;
  min-width: 0;
  padding: 8px 12px;
  font-size: 14px;
  font-family: inherit;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--base-text);
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.form-input--readonly {
  background: var(--surface-muted);
  color: var(--text-muted);
}

.form-input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px rgba(124, 92, 252, 0.12);
}

.form-input:disabled {
  background: var(--surface-muted);
  color: var(--text-subtle);
  cursor: not-allowed;
}
</style>
