<script setup lang="ts">
import { ref, computed, onMounted, watch, onBeforeUnmount } from "vue"
import { useI18n } from "vue-i18n"
import { useNodeShapes } from "../../composables/useNodeShapes"
import type { NodeShapeResponse } from "../../types/api"
import { DEFAULT_RECTANGLE_OUTLINE } from "../notations/notationAttrs"
import type { OutlineSegment } from "../notations/notationAttrs"
import BaseModal from "../../components/modals/BaseModal.vue"
import DocumentEditorModal from "../../components/modals/DocumentEditorModal.vue"
import ShapeSidebar from "./components/ShapeSidebar.vue"
import ShapeForm from "./components/ShapeForm.vue"
import { apiPost } from "../../composables/useApi"

const { t } = useI18n()
const {
  list,
  isLoading,
  fetchList,
  fetchById,
  create,
  update,
  remove
} = useNodeShapes()

const selectedShapeId = ref<string | null>(null)
const selectedDetail = ref<NodeShapeResponse | null>(null)
const isSaving = ref(false)
const isDeleting = ref(false)
const saveError = ref<string | null>(null)
const localName = ref("")
const localOutline = ref<OutlineSegment[]>([])
const showDeleteConfirm = ref(false)

function parseOutlineJson(json: string | null): OutlineSegment[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json) as unknown
    return Array.isArray(parsed) ? (parsed as OutlineSegment[]) : []
  } catch {
    return []
  }
}

const canEditSelected = computed(() => selectedDetail.value?.canEdit ?? false)

/** Есть несохранённые изменения относительно данных с сервера */
const isDirty = computed(() => {
  const detail = selectedDetail.value
  if (!detail) return false
  const savedName = detail.name ?? ""
  const savedOutline = parseOutlineJson(detail.outline)
  if (localName.value !== savedName) return true
  return JSON.stringify(localOutline.value) !== JSON.stringify(savedOutline)
})

onMounted(() => {
  fetchList({ size: 200 }).then((ok) => {
    if (!ok) saveError.value = t("shapes.errorLoad")
  })
})

watch(selectedShapeId, async (id) => {
  selectedDetail.value = null
  localName.value = ""
  localOutline.value = []
  if (!id) return
  const detail = await fetchById(id)
  selectedDetail.value = detail
  if (detail) {
    localName.value = detail.name
    localOutline.value = parseOutlineJson(detail.outline).length
      ? parseOutlineJson(detail.outline)
      : [...DEFAULT_RECTANGLE_OUTLINE]
  }
})

function handleSelect(id: string) {
  selectedShapeId.value = id
}

async function handleAdd() {
  saveError.value = null
  const outlineJson = JSON.stringify(DEFAULT_RECTANGLE_OUTLINE)
  const created = await create({
    name: t("shapes.addShape"),
    outline: outlineJson
  })
  if (created) {
    await fetchList({ size: 200 })
    selectedShapeId.value = created.id
    selectedDetail.value = created
    localName.value = created.name
    localOutline.value =
      parseOutlineJson(created.outline).length > 0
        ? parseOutlineJson(created.outline)
        : [...DEFAULT_RECTANGLE_OUTLINE]
  } else {
    saveError.value = t("shapes.errorSave")
  }
}

async function handleSave() {
  if (!selectedDetail.value || !canEditSelected.value) return
  saveError.value = null
  isSaving.value = true
  const updated = await update(selectedDetail.value.id, {
    name: localName.value.trim() || selectedDetail.value.name,
    outline: JSON.stringify(localOutline.value),
    attrs: selectedDetail.value.attrs ?? undefined
  })
  isSaving.value = false
  if (updated) {
    selectedDetail.value = updated
    const idx = list.value.findIndex((s) => s.id === updated.id)
    if (idx >= 0) {
      list.value = [
        ...list.value.slice(0, idx),
        updated,
        ...list.value.slice(idx + 1)
      ]
    }
  } else {
    saveError.value = t("shapes.errorSave")
  }
}

function getShapeDocFileId(): string | null {
  const raw = selectedDetail.value?.attrs
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return typeof parsed.documentFileId === 'string' ? parsed.documentFileId : null
  } catch {
    return null
  }
}

function setShapeDocFileId(fileId: string) {
  if (!selectedDetail.value) return
  const raw = selectedDetail.value.attrs
  let parsed: Record<string, unknown> = {}
  if (raw) {
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>
    } catch {
      parsed = {}
    }
  }
  parsed.documentFileId = fileId
  selectedDetail.value = { ...selectedDetail.value, attrs: JSON.stringify(parsed) }
}

const showDocModal = ref(false)
const docModalFileId = ref<string | null>(null)

function openDocModal() {
  docModalFileId.value = getShapeDocFileId()
  showDocModal.value = true
}

async function handleDocSaved(fileId: string) {
  if (!selectedDetail.value || !canEditSelected.value) return
  setShapeDocFileId(fileId)
  const updated = await update(selectedDetail.value.id, {
    attrs: selectedDetail.value.attrs ?? undefined
  })
  if (updated) selectedDetail.value = updated
  await apiPost<{ fileId: string; label: string }>('/documents', {
    fileId,
    nodeShapeId: selectedDetail.value.id
  })
}

function handleDocModalClose() {
  showDocModal.value = false
  docModalFileId.value = null
}

function openDeleteConfirm() {
  showDeleteConfirm.value = true
}

async function confirmDelete() {
  if (!selectedDetail.value || !canEditSelected.value) return
  showDeleteConfirm.value = false
  isDeleting.value = true
  saveError.value = null
  const ok = await remove(selectedDetail.value.id)
  isDeleting.value = false
  if (ok) {
    selectedShapeId.value = null
    selectedDetail.value = null
    await fetchList({ size: 200 })
  } else {
    saveError.value = t("shapes.errorDelete")
  }
}

// Toast for save/load errors (like TypeEditorPage)
const isToastVisible = ref(false)
let toastTimer: ReturnType<typeof setTimeout> | null = null

watch(saveError, (value) => {
  if (toastTimer) {
    clearTimeout(toastTimer)
    toastTimer = null
  }
  if (!value) {
    isToastVisible.value = false
    return
  }
  isToastVisible.value = true
  toastTimer = setTimeout(() => {
    isToastVisible.value = false
  }, 5000)
})

onBeforeUnmount(() => {
  if (toastTimer) {
    clearTimeout(toastTimer)
    toastTimer = null
  }
})
</script>

<template>
  <div class="shape-editor">
    <ShapeSidebar
      :shapes="list"
      :selected-shape-id="selectedShapeId"
      :is-loading="isLoading"
      @select-shape="handleSelect"
      @add-shape="handleAdd"
    />

    <main class="shape-editor__main">
      <div v-if="!selectedDetail" class="shape-editor__empty">
        <div class="empty-state">
          <UiIcon name="hexagon" class="empty-state__icon" />
          <p class="empty-state__text">{{ t("shapes.selectShape") }}</p>
          <p class="empty-state__hint">{{ t("shapes.orCreateNew") }}</p>
        </div>
      </div>

      <template v-else>
        <div class="shape-editor__content">
          <div class="shape-editor__center">
            <ShapeForm
              :selected-shape="selectedDetail"
              :name="localName"
              :outline="localOutline"
              :can-edit="canEditSelected"
              :is-dirty="isDirty"
              :is-saving="isSaving"
              :is-deleting="isDeleting"
              @save="handleSave"
              @delete="openDeleteConfirm"
              @update:name="localName = $event"
              @update:outline="localOutline = $event"
            />
            <div v-if="selectedDetail && canEditSelected" class="shape-editor__doc-row">
              <button type="button" class="btn btn--secondary" @click="openDocModal">
                <UiIcon name="menu_book" />
                {{ t("notations.documentation") }}
                <span v-if="getShapeDocFileId()" class="shape-editor__doc-badge">
                  <UiIcon name="check" />
                </span>
              </button>
            </div>
          </div>
        </div>
      </template>
    </main>

    <DocumentEditorModal
      v-if="showDocModal && selectedDetail"
      :title="selectedDetail.name"
      :file-id="docModalFileId"
      @close="handleDocModalClose"
      @saved="handleDocSaved"
    />

    <BaseModal
      v-if="showDeleteConfirm"
      :title="t('shapes.delete')"
      max-width="400px"
      @close="showDeleteConfirm = false"
    >
      <p class="shape-editor__delete-text">
        {{ t("shapes.deleteConfirm", { name: selectedDetail?.name ?? "" }) }}
      </p>
      <template #footer>
        <button type="button" class="btn btn--secondary" @click="showDeleteConfirm = false">
          {{ t("common.cancel") }}
        </button>
        <button type="button" class="btn btn--danger" @click="confirmDelete">
          {{ t("common.delete") }}
        </button>
      </template>
    </BaseModal>

    <Teleport to="body">
      <Transition name="toast">
        <div v-if="isToastVisible && saveError" class="save-toast save-toast--error">
          <UiIcon name="error" class="save-toast__icon" />
          <span>{{ saveError }}</span>
        </div>
      </Transition>
    </Teleport>
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

.shape-editor {
  display: flex;
  height: 100%;
  min-height: 0;
  background: var(--base-bg);
}

.shape-editor__main {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 28px 36px;
}

.shape-editor__content {
  display: flex;
  gap: 28px;
  align-items: flex-start;
  animation: fadeIn 0.25s ease;
}

.shape-editor__center {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.shape-editor__doc-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.shape-editor__doc-row .btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  font-size: 13px;
  font-family: inherit;
  font-weight: 500;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--base-text);
  cursor: pointer;
}

.shape-editor__doc-row .btn:hover {
  background: var(--surface-strong);
}

.shape-editor__doc-badge {
  display: inline-flex;
  color: var(--success);
  font-size: 14px;
}

.shape-editor__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  animation: fadeIn 0.4s ease;
}

.empty-state__icon {
  width: 56px;
  height: 56px;
  color: var(--border-strong);
  margin-bottom: 4px;
}

.empty-state__text {
  margin: 0;
  font-size: 15px;
  font-weight: 500;
  color: var(--text-muted);
}

.empty-state__hint {
  margin: 0;
  font-size: 13px;
  color: var(--text-subtle);
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 18px;
  font-size: 13px;
  font-family: inherit;
  font-weight: 500;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn--secondary {
  background: var(--surface-strong);
  color: var(--text-muted);
}

.btn--secondary:hover:not(:disabled) {
  background: var(--border);
  color: var(--base-text);
}

.btn--danger {
  background: var(--danger-soft);
  color: var(--danger);
}

.btn--danger:hover:not(:disabled) {
  filter: brightness(0.95);
}

.shape-editor__delete-text {
  margin: 0;
  font-size: 14px;
  color: var(--base-text);
  line-height: 1.55;
}

.save-toast {
  position: fixed;
  bottom: 48px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: var(--radius-sm);
  font-size: 14px;
  font-weight: 500;
  z-index: 2100;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
}

.save-toast--error {
  background: var(--danger-soft);
  color: var(--danger);
  border: 1px solid var(--danger-soft);
}

.save-toast__icon {
  width: 20px;
  height: 20px;
}

.toast-enter-active,
.toast-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(8px);
}
</style>
