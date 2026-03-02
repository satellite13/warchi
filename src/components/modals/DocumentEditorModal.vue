<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import '@/config/mdEditor'
import { MdEditor, MdPreview } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'
import UnsavedBadge from "@/components/UnsavedBadge.vue"
import { useLocale } from "../../composables/useLocale"
import { useTypeDocument } from "../../features/types/composables/useTypeDocument"

const props = defineProps<{
  /** Display title (entity name) */
  title: string
  /** Existing document file ID, or null/undefined if no document yet */
  fileId: string | null | undefined
}>()

const emit = defineEmits<{
  close: []
  /** Emitted when document is saved for the first time (new fileId) or updated */
  saved: [fileId: string]
}>()

const { t } = useI18n()
const { currentLocale } = useLocale()

const editorLanguage = computed(() => {
  const map: Record<string, string> = { ru: 'ru-RU', en: 'en-US' }
  return map[currentLocale.value] ?? 'en-US'
})

const {
  documentContent,
  documentFileId,
  isDocLoading,
  isDocSaving,
  docError,
  docVersions,
  isLoadingVersions,
  isDocDirty,
  setDocumentContent,
  loadDocument,
  saveDocument,
  loadVersions,
  loadVersion,
  resetDocument,
} = useTypeDocument()

const isEditing = ref(false)
const showVersions = ref(false)
const viewingOldVersion = ref(false)
const viewingVersionNumber = ref<number | null>(null)

const canSave = computed(
  () => isDocDirty.value && !isDocSaving.value && !isDocLoading.value && !viewingOldVersion.value
)

onMounted(() => {
  loadDocument(props.fileId ?? null)
  if (!props.fileId) {
    isEditing.value = true
  }
})

function togglePreview() {
  if (viewingOldVersion.value) return
  isEditing.value = !isEditing.value
}

function handleContentChange(value: string) {
  if (viewingOldVersion.value) return
  setDocumentContent(value)
}

async function handleSave() {
  if (viewingOldVersion.value) return
  const fileId = await saveDocument()
  if (fileId) {
    emit('saved', fileId)
  }
}

function handleShowVersions() {
  showVersions.value = !showVersions.value
  if (showVersions.value && documentFileId.value) {
    loadVersions(documentFileId.value)
  }
}

function handleLoadVersion(versionNumber: number) {
  if (documentFileId.value) {
    loadVersion(documentFileId.value, versionNumber)
    showVersions.value = false
    isEditing.value = false
    viewingOldVersion.value = true
    viewingVersionNumber.value = versionNumber
  }
}

function handleBackToCurrent() {
  viewingOldVersion.value = false
  viewingVersionNumber.value = null
  isEditing.value = false
  loadDocument(props.fileId ?? null)
}

function handleClose() {
  resetDocument()
  emit('close')
}

// Keyboard handling for modal
const handleKeydown = (event: KeyboardEvent) => {
  // Only handle Escape when not editing in the markdown editor
  if (event.key === 'Escape') {
    // Check if focus is inside the markdown editor
    const activeElement = document.activeElement
    const isInEditor = activeElement?.closest('.md-editor') !== null
    if (isInEditor) return

    event.preventDefault()
    handleClose()
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleString()
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
  <Teleport to="body">
    <div class="doc-modal-overlay" @click.self="handleClose">
      <div class="doc-modal">
        <!-- Header -->
        <div class="doc-modal__header">
          <div class="doc-modal__header-left">
            <UiIcon name="description" class="doc-modal__icon" />
            <h2>{{ title }}</h2>
            <UnsavedBadge
              v-if="isDocDirty && !viewingOldVersion"
              tooltip-key="types.docNotSaved"
            />
            <span v-if="viewingOldVersion" class="doc-modal__version-badge">
              v{{ viewingVersionNumber }}
            </span>
          </div>
          <div class="doc-modal__header-actions">
            <template v-if="viewingOldVersion">
              <button
                type="button"
                class="doc-modal-btn doc-modal-btn--primary"
                @click="handleBackToCurrent"
              >
                <UiIcon name="undo" />
                {{ t('types.docBackToCurrent') }}
              </button>
            </template>
            <template v-else>
              <button
                type="button"
                class="doc-modal-btn doc-modal-btn--ghost"
                @click="togglePreview"
              >
                <UiIcon :name="isEditing ? 'visibility' : 'edit'" />
                {{ isEditing ? t('types.docPreview') : t('common.edit') }}
              </button>

              <button
                v-if="isDocDirty"
                type="button"
                class="doc-modal-btn doc-modal-btn--primary"
                :disabled="!canSave"
                @click="handleSave"
              >
                <UiIcon name="save" />
                {{ isDocSaving ? t('common.saving') : t('common.save') }}
              </button>
            </template>

            <button
              v-if="documentFileId"
              type="button"
              class="doc-modal-btn doc-modal-btn--ghost"
              :class="{ 'doc-modal-btn--active': showVersions }"
              @click="handleShowVersions"
            >
              <UiIcon name="history" />
              {{ t('types.docVersions') }}
            </button>

            <button type="button" class="doc-modal__close" @click="handleClose">
              <UiIcon name="cancel" />
            </button>
          </div>
        </div>

        <!-- Version history -->
        <div v-if="showVersions" class="doc-modal__versions">
          <div v-if="isLoadingVersions" class="doc-modal__versions-empty">
            {{ t('common.loading') }}
          </div>
          <div v-else-if="docVersions.length === 0" class="doc-modal__versions-empty">
            {{ t('types.docNoVersions') }}
          </div>
          <div v-else class="doc-modal__versions-list">
            <div
              v-for="ver in docVersions"
              :key="ver.versionNumber"
              class="doc-modal__version-item"
              role="button"
              tabindex="0"
              @click="handleLoadVersion(ver.versionNumber)"
              @keydown.enter="handleLoadVersion(ver.versionNumber)"
            >
              <span class="doc-modal__version-num">v{{ ver.versionNumber }}</span>
              <span class="doc-modal__version-date">{{ formatDate(ver.createdAt) }}</span>
              <span class="doc-modal__version-size">{{ formatSize(ver.size) }}</span>
            </div>
          </div>
        </div>

        <!-- Body -->
        <div class="doc-modal__body">
          <!-- Loading -->
          <div v-if="isDocLoading" class="doc-modal__placeholder">
            {{ t('common.loading') }}
          </div>

          <!-- Error -->
          <div v-else-if="docError" class="doc-modal__error">
            <UiIcon name="error" />
            {{ docError }}
          </div>

          <!-- Editor (disabled when viewing old version) -->
          <div v-else-if="isEditing && !viewingOldVersion" class="doc-modal__editor">
            <MdEditor
              :model-value="documentContent"
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

          <!-- Preview -->
          <div v-else class="doc-modal__preview">
            <div v-if="!documentContent" class="doc-modal__placeholder">
              {{ t('types.docEmpty') }}
            </div>
            <MdPreview v-else :model-value="documentContent" :language="editorLanguage" />
          </div>
        </div>
      </div>
    </div>
  </Teleport>
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
@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
@keyframes pulseGlow {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.doc-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.15s ease;
}

.doc-modal {
  width: 100%;
  max-width: 900px;
  height: 85vh;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-md);
  margin: 16px;
  display: flex;
  flex-direction: column;
  animation: slideUp 0.2s ease;
}

/* Header */
.doc-modal__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.doc-modal__header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.doc-modal__icon {
  width: 20px;
  height: 20px;
  color: var(--primary);
  flex-shrink: 0;
}

.doc-modal__header h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--base-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.doc-modal__version-badge {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  background: var(--surface-strong);
  border: 1px solid var(--border);
  padding: 2px 8px;
  border-radius: 999px;
  white-space: nowrap;
  flex-shrink: 0;
}

.doc-modal__header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.doc-modal__close {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-subtle);
  background: transparent;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease;
  margin-left: 4px;
}
.doc-modal__close:hover {
  background: var(--surface-strong);
  color: var(--text-muted);
}

/* Buttons */
.doc-modal-btn {
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
  white-space: nowrap;
}
.doc-modal-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.doc-modal-btn .ui-icon {
  font-size: 15px;
}

.doc-modal-btn--ghost {
  background: var(--surface-strong);
  color: var(--text-muted);
  border-color: var(--border);
}
.doc-modal-btn--ghost:hover:not(:disabled) {
  background: var(--border);
  color: var(--base-text);
}
.doc-modal-btn--active {
  background: var(--primary-soft);
  color: var(--primary);
  border-color: var(--primary);
}
.doc-modal-btn--primary {
  background: var(--primary);
  color: #fff;
}
.doc-modal-btn--primary:hover:not(:disabled) {
  filter: brightness(0.95);
}

/* Versions */
.doc-modal__versions {
  border-bottom: 1px solid var(--border);
  padding: 8px 20px;
  background: var(--surface-muted);
  max-height: 160px;
  overflow-y: auto;
  flex-shrink: 0;
}

.doc-modal__versions-empty {
  font-size: 12px;
  color: var(--text-subtle);
  padding: 4px 0;
}

.doc-modal__versions-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.doc-modal__version-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 5px 8px;
  border-radius: 6px;
  font-size: 12px;
  color: var(--base-text);
  cursor: pointer;
  transition: background 0.15s ease;
}
.doc-modal__version-item:hover {
  background: var(--surface-strong);
}

.doc-modal__version-num {
  font-weight: 600;
  color: var(--primary);
  min-width: 28px;
}
.doc-modal__version-date {
  flex: 1;
  color: var(--text-muted);
}
.doc-modal__version-size {
  font-size: 11px;
  color: var(--text-subtle);
  font-family: 'SF Mono', 'Fira Code', monospace;
}

/* Body */
.doc-modal__body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.doc-modal__placeholder {
  padding: 40px 24px;
  text-align: center;
  font-size: 14px;
  color: var(--text-subtle);
}

.doc-modal__error {
  padding: 24px;
  font-size: 13px;
  color: var(--danger);
  display: flex;
  align-items: center;
  gap: 8px;
}
.doc-modal__error .ui-icon {
  width: 18px;
  height: 18px;
}

.doc-modal__editor {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.doc-modal__editor :deep(.md-editor) {
  height: 100%;
  border: none;
  border-radius: 0;
  --md-bk-color: var(--surface-muted);
}

.doc-modal__preview {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 24px;
}
.doc-modal__preview :deep(.md-editor-preview-wrapper) {
  padding: 0;
}
.doc-modal__preview :deep(h1),
.doc-modal__preview :deep(h2),
.doc-modal__preview :deep(h3) {
  margin-top: 0.8em;
  margin-bottom: 0.4em;
}
.doc-modal__preview :deep(p) {
  margin: 0.4em 0;
  font-size: 14px;
  line-height: 1.6;
}
</style>
