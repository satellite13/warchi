<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { MdEditor, MdPreview } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'
import { useLocale } from '../../../composables/useLocale'
import type { FileVersionResponse } from '../../../types/api'

const props = defineProps<{
  content: string
  fileId: string | null
  isLoading: boolean
  isSaving: boolean
  isDirty: boolean
  isNewType: boolean
  versions: FileVersionResponse[]
  isLoadingVersions: boolean
  error: string | null
}>()

const emit = defineEmits<{
  'update:content': [value: string]
  save: []
  loadVersions: []
  loadVersion: [versionNumber: number]
}>()

const { t } = useI18n()
const { currentLocale } = useLocale()

const editorLanguage = computed(() => {
  const map: Record<string, string> = { ru: 'ru-RU', en: 'en-US' }
  return map[currentLocale.value] ?? 'en-US'
})

const isEditing = ref(false)
const showPanel = ref(true)
const showVersions = ref(false)

const hasDocument = computed(() => !!props.fileId || props.content.length > 0)
const canSave = computed(() => props.isDirty && !props.isSaving && !props.isLoading)

function startEditing() {
  isEditing.value = true
}

function stopEditing() {
  isEditing.value = false
}

function handleContentChange(value: string) {
  emit('update:content', value)
}

function handleSave() {
  emit('save')
}

function handleShowVersions() {
  showVersions.value = !showVersions.value
  if (showVersions.value) {
    emit('loadVersions')
  }
}

function handleLoadVersion(versionNumber: number) {
  emit('loadVersion', versionNumber)
  showVersions.value = false
  isEditing.value = true
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr)
    return date.toLocaleString()
  } catch {
    return dateStr
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
</script>

<template>
  <div class="doc-panel">
    <div
      class="doc-panel__title doc-panel__title--toggle"
      role="button"
      tabindex="0"
      @click="showPanel = !showPanel"
      @keydown.enter="showPanel = !showPanel"
    >
      <span
        class="material-symbols-outlined doc-panel__chevron"
        :class="{ 'doc-panel__chevron--collapsed': !showPanel }"
        >expand_more</span
      >
      <span class="material-symbols-outlined doc-panel__icon">description</span>
      {{ t('types.documentation') }}
      <span v-if="isDirty" class="doc-panel__dirty-dot" :title="t('types.docNotSaved')"></span>
    </div>

    <template v-if="showPanel">
      <!-- New type not saved yet -->
      <div v-if="isNewType" class="doc-panel__empty">
        {{ t('types.docSaveTypeFirst') }}
      </div>

      <!-- Loading -->
      <div v-else-if="isLoading" class="doc-panel__empty">
        <span class="loading-pulse"></span>
        {{ t('common.loading') }}
      </div>

      <!-- Error -->
      <div v-else-if="error" class="doc-panel__error">
        <span class="material-symbols-outlined">error</span>
        {{ error }}
      </div>

      <!-- Editor / Preview / Empty -->
      <template v-else>
        <div class="doc-panel__actions">
          <template v-if="isEditing">
            <button type="button" class="doc-btn doc-btn--secondary" @click="stopEditing">
              <span class="material-symbols-outlined">visibility</span>
              {{ t('types.docPreview') }}
            </button>
          </template>
          <template v-else>
            <button type="button" class="doc-btn doc-btn--secondary" @click="startEditing">
              <span class="material-symbols-outlined">edit</span>
              {{ hasDocument ? t('common.edit') : t('types.docCreate') }}
            </button>
          </template>

          <button
            v-if="fileId"
            type="button"
            class="doc-btn doc-btn--secondary"
            :class="{ 'doc-btn--active': showVersions }"
            @click="handleShowVersions"
          >
            <span class="material-symbols-outlined">history</span>
            {{ t('types.docVersions') }}
          </button>

          <button
            v-if="isDirty"
            type="button"
            class="doc-btn doc-btn--primary"
            :disabled="!canSave"
            @click="handleSave"
          >
            <span class="material-symbols-outlined">save</span>
            {{ isSaving ? t('common.saving') : t('types.docSave') }}
          </button>
        </div>

        <!-- Version history -->
        <div v-if="showVersions" class="doc-versions">
          <div v-if="isLoadingVersions" class="doc-versions__empty">
            <span class="loading-pulse"></span>
            {{ t('common.loading') }}
          </div>
          <div v-else-if="versions.length === 0" class="doc-versions__empty">
            {{ t('types.docNoVersions') }}
          </div>
          <div v-else class="doc-versions__list">
            <div
              v-for="ver in versions"
              :key="ver.versionNumber"
              class="doc-version-item"
              role="button"
              tabindex="0"
              @click="handleLoadVersion(ver.versionNumber)"
              @keydown.enter="handleLoadVersion(ver.versionNumber)"
            >
              <span class="doc-version-item__number">v{{ ver.versionNumber }}</span>
              <span class="doc-version-item__date">{{ formatDate(ver.createdAt) }}</span>
              <span class="doc-version-item__size">{{ formatSize(ver.size) }}</span>
            </div>
          </div>
        </div>

        <!-- Editor mode -->
        <div v-if="isEditing" class="doc-editor-wrap">
          <MdEditor
            :model-value="content"
            :language="editorLanguage"
            :preview="false"
            :toolbars="[
              'bold',
              'underline',
              'italic',
              'strikeThrough',
              '-',
              'title',
              'sub',
              'sup',
              'quote',
              'unorderedList',
              'orderedList',
              'task',
              '-',
              'codeRow',
              'code',
              'link',
              'table',
              '-',
              'revoke',
              'next',
              '=',
              'preview',
              'fullscreen',
            ]"
            @change="handleContentChange"
          />
        </div>

        <!-- Preview mode -->
        <template v-else>
          <div v-if="!hasDocument" class="doc-panel__empty">
            {{ t('types.docEmpty') }}
          </div>
          <div v-else class="doc-preview-wrap">
            <MdPreview :model-value="content" :language="editorLanguage" />
          </div>
        </template>
      </template>
    </template>
  </div>
</template>

<style scoped>
@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes pulseGlow {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}

.doc-panel {
  background: var(--surface);
  border-radius: 12px;
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: var(--shadow-sm);
  border: 1px solid var(--border);
  animation: fadeIn 0.3s ease both;
}

.doc-panel__title {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  display: flex;
  align-items: center;
  gap: 6px;
}

.doc-panel__title--toggle {
  cursor: pointer;
  user-select: none;
  padding: 2px 0;
  border-radius: 6px;
  transition: color 0.15s ease;
}

.doc-panel__title--toggle:hover {
  color: var(--base-text);
}

.doc-panel__icon {
  font-size: 16px;
}

.doc-panel__chevron {
  font-size: 18px;
  transition: transform 0.2s ease;
}

.doc-panel__chevron--collapsed {
  transform: rotate(-90deg);
}

.doc-panel__dirty-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--warning);
  flex-shrink: 0;
  animation: pulseGlow 1.5s ease-in-out infinite;
  margin-left: 4px;
}

.doc-panel__empty {
  font-size: 13px;
  color: var(--text-subtle);
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 4px;
}

.doc-panel__error {
  font-size: 13px;
  color: var(--danger);
  display: flex;
  align-items: center;
  gap: 6px;
}

.doc-panel__error .material-symbols-outlined {
  font-size: 16px;
}

.loading-pulse {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--primary);
  animation: pulseGlow 1s ease-in-out infinite;
  flex-shrink: 0;
}

/* Actions */
.doc-panel__actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.doc-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px;
  font-size: 12px;
  font-family: inherit;
  font-weight: 500;
  border: 1px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.doc-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.doc-btn .material-symbols-outlined {
  font-size: 15px;
}

.doc-btn--secondary {
  background: var(--surface-strong);
  color: var(--text-muted);
  border-color: var(--border);
}

.doc-btn--secondary:hover:not(:disabled) {
  background: var(--border);
  color: var(--base-text);
}

.doc-btn--active {
  background: var(--primary-soft);
  color: var(--primary);
  border-color: var(--primary);
}

.doc-btn--primary {
  background: var(--primary);
  color: #fff;
}

.doc-btn--primary:hover:not(:disabled) {
  filter: brightness(0.95);
}

/* Versions */
.doc-versions {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px;
  background: var(--surface-muted);
  animation: fadeIn 0.2s ease;
}

.doc-versions__empty {
  font-size: 12px;
  color: var(--text-subtle);
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px;
}

.doc-versions__list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 160px;
  overflow-y: auto;
}

.doc-version-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border-radius: 6px;
  font-size: 12px;
  color: var(--base-text);
  cursor: pointer;
  transition: background 0.15s ease;
}

.doc-version-item:hover {
  background: var(--surface-strong);
}

.doc-version-item__number {
  font-weight: 600;
  color: var(--primary);
  min-width: 28px;
}

.doc-version-item__date {
  flex: 1;
  color: var(--text-muted);
}

.doc-version-item__size {
  font-size: 11px;
  color: var(--text-subtle);
  font-family: 'SF Mono', 'Fira Code', monospace;
}

/* Editor wrapper */
.doc-editor-wrap {
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--border);
  animation: fadeIn 0.2s ease;
}

.doc-editor-wrap :deep(.md-editor) {
  --md-bk-color: var(--surface-muted);
  border: none;
}

/* Preview wrapper */
.doc-preview-wrap {
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--border);
  padding: 12px 16px;
  background: var(--surface-muted);
  max-height: 400px;
  overflow-y: auto;
  animation: fadeIn 0.2s ease;
}

.doc-preview-wrap :deep(.md-editor-preview-wrapper) {
  padding: 0;
}

.doc-preview-wrap :deep(h1),
.doc-preview-wrap :deep(h2),
.doc-preview-wrap :deep(h3) {
  margin-top: 0.8em;
  margin-bottom: 0.4em;
}

.doc-preview-wrap :deep(p) {
  margin: 0.4em 0;
  font-size: 14px;
  line-height: 1.6;
}
</style>
