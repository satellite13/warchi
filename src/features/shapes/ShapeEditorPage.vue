<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue"
import { useI18n } from "vue-i18n"
import { useNodeShapes } from "../../composables/useNodeShapes"
import type { NodeShapeResponse } from "../../types/api"
import { DEFAULT_RECTANGLE_OUTLINE } from "../notations/notationAttrs"
import type { OutlineSegment } from "../notations/notationAttrs"
import BaseModal from "../../components/modals/BaseModal.vue"
import CustomOutlineEditor from "./CustomOutlineEditor.vue"

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

async function handleSelect(id: string) {
  selectedShapeId.value = id
}

async function handleAdd() {
  saveError.value = null
  const outlineJson =
    JSON.stringify(DEFAULT_RECTANGLE_OUTLINE)
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
    outline: JSON.stringify(localOutline.value)
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
</script>

<template>
  <div class="shape-editor">
    <aside class="shape-editor__sidebar">
      <div class="shape-editor__sidebar-header">
        <h2 class="shape-editor__title">{{ t("shapes.title") }}</h2>
        <button
          type="button"
          class="btn btn--primary btn--sm"
          @click="handleAdd"
        >
          {{ t("shapes.addShape") }}
        </button>
      </div>
      <div v-if="isLoading" class="shape-editor__loading">
        {{ t("common.loading") }}
      </div>
      <ul v-else class="shape-editor__list">
        <li
          v-for="shape in list"
          :key="shape.id"
          class="shape-editor__item"
          :class="{ 'shape-editor__item--active': shape.id === selectedShapeId }"
        >
          <button
            type="button"
            class="shape-editor__item-btn"
            @click="handleSelect(shape.id)"
          >
            <span class="shape-editor__item-name">{{ shape.name }}</span>
            <span
              v-if="!shape.canEdit"
              class="shape-editor__item-readonly"
              :title="t('shapes.noEditRights')"
            >
              <span class="material-symbols-outlined">lock</span>
            </span>
          </button>
        </li>
      </ul>
    </aside>

    <main class="shape-editor__main">
      <div v-if="!selectedDetail" class="shape-editor__empty">
        <div class="empty-state">
          <span class="material-symbols-outlined empty-state__icon">hexagon</span>
          <p class="empty-state__text">{{ t("shapes.selectShape") }}</p>
          <p class="empty-state__hint">{{ t("shapes.orCreateNew") }}</p>
        </div>
      </div>

      <div v-else class="shape-editor__form">
        <p v-if="!canEditSelected" class="shape-editor__no-edit">
          {{ t("shapes.noEditRights") }}
        </p>
        <div class="shape-editor__field">
          <label class="shape-editor__label">{{ t("shapes.nameLabel") }}</label>
          <input
            v-model="localName"
            type="text"
            class="shape-editor__input"
            :disabled="!canEditSelected"
          />
        </div>
        <div class="shape-editor__field">
          <label class="shape-editor__label">{{ t("shapes.outlineLabel") }}</label>
          <CustomOutlineEditor
            v-if="localOutline.length > 0"
            v-model="localOutline"
            :disabled="!canEditSelected"
          />
          <p v-else class="shape-editor__outline-placeholder">
            {{ t("shapes.outlinePlaceholder") }}
          </p>
        </div>
        <div v-if="canEditSelected" class="shape-editor__actions">
          <button
            type="button"
            class="btn btn--primary"
            :disabled="isSaving"
            @click="handleSave"
          >
            {{ isSaving ? t("common.saving") : t("shapes.save") }}
          </button>
          <button
            type="button"
            class="btn btn--danger"
            :disabled="isDeleting"
            @click="openDeleteConfirm"
          >
            {{ isDeleting ? t("common.deleting") : t("shapes.delete") }}
          </button>
        </div>
        <p v-if="saveError" class="shape-editor__error">{{ saveError }}</p>
      </div>
    </main>

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
  </div>
</template>

<style scoped>
.shape-editor {
  display: flex;
  height: 100%;
  min-height: 0;
}

.shape-editor__sidebar {
  width: 280px;
  flex-shrink: 0;
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  background: var(--surface-muted);
}

.shape-editor__sidebar-header {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.shape-editor__title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--base-text);
}

.shape-editor__loading {
  padding: 16px;
  color: var(--text-muted);
}

.shape-editor__list {
  list-style: none;
  margin: 0;
  padding: 8px 0;
  overflow-y: auto;
}

.shape-editor__item {
  margin: 0;
}

.shape-editor__item-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 16px;
  text-align: left;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--base-text);
  font-size: 14px;
}

.shape-editor__item-btn:hover {
  background: var(--surface-strong);
}

.shape-editor__item--active .shape-editor__item-btn {
  background: var(--primary-soft);
  color: var(--primary);
}

.shape-editor__item-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shape-editor__item-readonly {
  color: var(--text-subtle);
  flex-shrink: 0;
}

.shape-editor__item-readonly .material-symbols-outlined {
  font-size: 18px;
}

.shape-editor__main {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.shape-editor__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 240px;
}

.empty-state {
  text-align: center;
  color: var(--text-muted);
}

.empty-state__icon {
  font-size: 48px;
  display: block;
  margin-bottom: 12px;
  opacity: 0.6;
}

.empty-state__text {
  margin: 0 0 4px;
  font-size: 16px;
}

.empty-state__hint {
  margin: 0;
  font-size: 14px;
  color: var(--text-subtle);
}

.shape-editor__form {
  max-width: 480px;
}

.shape-editor__no-edit {
  padding: 12px;
  background: var(--surface-strong);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  margin-bottom: 16px;
}

.shape-editor__field {
  margin-bottom: 16px;
}

.shape-editor__label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-muted);
  margin-bottom: 6px;
}

.shape-editor__input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 14px;
}

.shape-editor__input:disabled {
  background: var(--surface-muted);
  color: var(--text-subtle);
}

.shape-editor__outline-placeholder {
  padding: 12px;
  background: var(--surface-muted);
  border-radius: var(--radius-sm);
  color: var(--text-subtle);
  font-size: 13px;
  margin: 0;
}

.shape-editor__actions {
  display: flex;
  gap: 12px;
  margin-top: 20px;
}

.shape-editor__error {
  margin-top: 12px;
  color: var(--danger);
  font-size: 13px;
}

.shape-editor__delete-text {
  margin: 0;
  color: var(--base-text);
}
</style>
