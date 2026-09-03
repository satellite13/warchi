<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import EditorFormHeader from '@/components/forms/EditorFormHeader.vue'
import ValidationScriptCodeEditor from './ValidationScriptCodeEditor.vue'
import ValidationScriptApiHelpPanel from './ValidationScriptApiHelpPanel.vue'

defineProps<{
  name: string
  description: string
  source: string
  ownerDisplayName: string
  canEdit: boolean
  canShare: boolean
  isDirty: boolean
  isSaving: boolean
  isDeleting: boolean
  canSave: boolean
}>()

const emit = defineEmits<{
  save: []
  delete: []
  share: []
  'update:name': [value: string]
  'update:description': [value: string]
  'update:source': [value: string]
}>()

const { t } = useI18n()
</script>

<template>
  <div class="script-form">
    <EditorFormHeader
      :title="name || t('validationScripts.title')"
      icon="terminal"
      help-docs-section="validationScripts"
      :help-title="t('validationScripts.helpTitle')"
      :is-dirty="isDirty"
      :is-saving="isSaving"
      :is-deleting="isDeleting"
      :can-edit="canEdit"
      :can-share="canShare"
      :show-doc-button="false"
      :show-unsaved-badge="false"
      :save-disabled="isSaving || isDeleting || !canSave"
      @save="emit('save')"
      @delete="emit('delete')"
      @share="emit('share')"
    />

    <p v-if="!canEdit" class="script-form__banner">
      {{ t('validationScripts.noEditRights') }}
    </p>

    <div class="script-form__meta">
      <label class="script-form__field script-form__field--name">
        <span class="script-form__label">{{ t('common.name') }}</span>
        <input
          class="form-input"
          :value="name"
          :placeholder="t('validationScripts.nameLabel')"
          :disabled="!canEdit"
          @input="emit('update:name', ($event.target as HTMLInputElement).value)"
        />
      </label>
      <label class="script-form__field script-form__field--desc">
        <span class="script-form__label">{{ t('validationScripts.descriptionLabel') }}</span>
        <input
          class="form-input"
          :value="description"
          :placeholder="t('validationScripts.descriptionPlaceholder')"
          :disabled="!canEdit"
          @input="emit('update:description', ($event.target as HTMLInputElement).value)"
        />
      </label>
      <div class="script-form__author" :title="t('common.author')">
        <UiIcon name="person" class="script-form__author-icon" />
        <span>{{ ownerDisplayName }}</span>
      </div>
    </div>

    <div class="script-form__workspace">
      <section class="script-form__code-panel">
        <div class="script-form__code-bar">
          <span class="script-form__code-lang">JavaScript</span>
          <span class="script-form__code-hint">{{ t('validationScripts.sourceHint') }}</span>
        </div>
        <ValidationScriptCodeEditor
          class="script-form__code"
          :model-value="source"
          :readonly="!canEdit"
          @update:model-value="emit('update:source', $event)"
        />
      </section>
      <ValidationScriptApiHelpPanel class="script-form__api-help" />
    </div>
  </div>
</template>

<style scoped>
.script-form {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  gap: 12px;
}

.script-form__banner {
  margin: 0;
  padding: 10px 14px;
  font-size: 13px;
  color: var(--text-muted);
  background: var(--surface-strong);
  border: 1px solid var(--border);
  border-radius: 10px;
}

.script-form__meta {
  display: grid;
  grid-template-columns: minmax(160px, 0.9fr) minmax(220px, 1.4fr) auto;
  gap: 12px;
  align-items: end;
  padding: 14px 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: var(--shadow-sm);
}

@media (max-width: 960px) {
  .script-form__meta {
    grid-template-columns: 1fr;
    align-items: stretch;
  }
}

.script-form__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.script-form__label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.script-form__author {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 0 2px 2px;
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
}

.script-form__author-icon {
  width: 16px;
  height: 16px;
  color: var(--text-subtle);
}

.script-form__workspace {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(240px, 300px);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: var(--shadow-sm);
  overflow: hidden;
  background: var(--surface);
}

@media (max-width: 1100px) {
  .script-form__workspace {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(0, 1fr) minmax(180px, 40%);
  }

  .script-form__api-help {
    border-left: none;
    border-top: 1px solid var(--border);
  }
}

.script-form__code-panel {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.script-form__api-help {
  min-height: 0;
}

.script-form__code-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-muted);
}

.script-form__code-lang {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--primary);
}

.script-form__code-hint {
  font-size: 12px;
  color: var(--text-subtle);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.script-form__code {
  flex: 1;
  min-height: 0;
}
</style>
