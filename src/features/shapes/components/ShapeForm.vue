<script setup lang="ts">
import { RouterLink } from "vue-router"
import { useI18n } from "vue-i18n"
import type { NodeShapeResponse } from "@/types/api"
import type { OutlineSegment } from "@/domain/attrs/notationAttrs"
import CustomOutlineEditor from "../CustomOutlineEditor.vue"

defineProps<{
  selectedShape: NodeShapeResponse | null
  name: string
  outline: OutlineSegment[]
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
}>()

const { t } = useI18n()
</script>

<template>
  <div class="shape-form">
    <div class="shape-form__header">
      <div class="shape-form__title-row">
        <div class="shape-form__icon">
          <UiIcon name="hexagon" />
        </div>
        <h2 class="shape-form__title">
          {{ name || t("shapes.title") }}
        </h2>
        <button
          v-if="canEdit || hasDoc"
          type="button"
          class="shape-form__doc-btn"
          :title="t('notations.documentation')"
          @click="emit('openDoc')"
        >
          <UiIcon name="description" class="shape-form__doc-btn-icon" />
          <span v-if="hasDoc" class="shape-form__doc-badge">
            <UiIcon name="check" />
          </span>
        </button>
      </div>
      <div class="shape-form__actions">
        <RouterLink
          :to="{ name: 'docs-section', params: { section: 'shapes' } }"
          class="shape-form__help-link"
          :title="t('shapes.editorDescriptionLink')"
        >
          <UiIcon name="help" />
        </RouterLink>
        <template v-if="canEdit">
          <button
            v-if="canShare"
            type="button"
            class="btn btn--secondary"
            :disabled="isSaving || isDeleting"
            @click="emit('share')"
          >
            <UiIcon name="share" />
            {{ t("common.share") }}
          </button>
          <button
            type="button"
            class="btn btn--soft-danger"
            :disabled="isSaving || isDeleting"
            @click="emit('delete')"
          >
            <UiIcon name="delete" />
            {{ t("common.delete") }}
          </button>
          <button
            type="button"
            class="btn btn--primary"
            :disabled="isSaving || !name.trim() || !isDirty"
            @click="emit('save')"
          >
            <UiIcon name="save" />
            {{ isSaving ? t("common.saving") : t("common.save") }}
          </button>
        </template>
      </div>
    </div>

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
      </div>

      <div class="form-section">
        <h3 class="form-section__title">{{ t("shapes.outlineLabel") }}</h3>
        <CustomOutlineEditor
          v-if="outline.length > 0"
          :model-value="outline"
          :disabled="!canEdit"
          @update:model-value="emit('update:outline', $event)"
        />
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

.shape-form__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
  gap: 12px;
}

.shape-form__title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.shape-form__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--primary-soft);
  color: var(--primary);
  flex-shrink: 0;
}

.shape-form__icon .ui-icon {
  font-size: 20px;
}

.shape-form__title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--base-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: -0.01em;
}

.shape-form__doc-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: color 0.15s ease, background 0.15s ease;
  flex-shrink: 0;
}

.shape-form__doc-btn:hover {
  color: var(--primary);
  background: var(--primary-soft);
}

.shape-form__doc-btn-icon {
  width: 20px;
  height: 20px;
}

.shape-form__doc-badge {
  position: absolute;
  top: -2px;
  right: -2px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--success);
  color: #fff;
  font-size: 10px;
}

.shape-form__doc-badge .ui-icon {
  width: 10px;
  height: 10px;
}

.shape-form__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.shape-form__help-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: var(--btn-height);
  padding: 0 20px;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  text-decoration: none;
  font-size: 14px;
  font-family: inherit;
  font-weight: 500;
  transition: color 0.15s ease, background 0.15s ease;
  flex-shrink: 0;
  box-sizing: border-box;
}

.shape-form__help-link:hover {
  color: var(--primary);
  background: var(--primary-soft);
}

.shape-form__help-link .ui-icon {
  width: 18px;
  height: 18px;
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

.form-section:nth-child(3) {
  animation-delay: 40ms;
}

.form-section:nth-child(4) {
  animation-delay: 80ms;
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
