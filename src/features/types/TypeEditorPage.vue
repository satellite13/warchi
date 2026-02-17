<script setup lang="ts">
import { onMounted, ref, computed } from "vue"

import { useTypeEditor } from "./composables/useTypeEditor"
import { serializeTypeAttrs } from "../notations/notationAttrs"
import BaseModal from "../../components/modals/BaseModal.vue"
import TypeSidebar from "./components/TypeSidebar.vue"
import TypeForm from "./components/TypeForm.vue"
import TypeAside from "./components/TypeAside.vue"

const {
  nodeTypes,
  linkTypes,
  selectedType,
  isLoading,
  isSaving,
  saveError,
  loadAll,
  selectType,
  addType,
  saveType,
  deleteType,
  addCustomProperty,
  removeCustomProperty,
  typeUsages,
  isLoadingUsages,
  isDirty
} = useTypeEditor()

onMounted(() => {
  loadAll()
})

async function handleSave() {
  if (!selectedType.value) return
  await saveType(selectedType.value)
}

async function handleDelete() {
  if (!selectedType.value) return
  await deleteType(selectedType.value)
}

// --- Unsaved changes dialog ---
const pendingSelectId = ref<string | null>(null)
const showUnsavedDialog = ref(false)

function handleSelectType(id: string) {
  if (selectedType.value?.id === id) return
  if (isDirty.value) {
    pendingSelectId.value = id
    showUnsavedDialog.value = true
  } else {
    selectType(id)
  }
}

function handleAddType(kind: 'node' | 'link') {
  if (isDirty.value) {
    pendingSelectId.value = `__add_${kind}`
    showUnsavedDialog.value = true
  } else {
    addType(kind)
  }
}

function discardAndSwitch() {
  showUnsavedDialog.value = false
  const pending = pendingSelectId.value
  pendingSelectId.value = null
  if (pending?.startsWith('__add_')) {
    addType(pending.replace('__add_', '') as 'node' | 'link')
  } else if (pending) {
    selectType(pending)
  }
}

function cancelSwitch() {
  showUnsavedDialog.value = false
  pendingSelectId.value = null
}

const isTypeInUse = computed(() => typeUsages.value.length > 0)

// --- JSON preview ---
const attrsJson = computed(() => {
  if (!selectedType.value) return ""
  const raw = serializeTypeAttrs(selectedType.value.parsedAttrs)
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
})
</script>

<template>
  <div class="type-editor">
    <!-- Left panel: type lists -->
    <TypeSidebar
      :node-types="nodeTypes"
      :link-types="linkTypes"
      :selected-type-id="selectedType?.id ?? null"
      :is-loading="isLoading"
      @select-type="handleSelectType"
      @add-type="handleAddType"
    />

    <!-- Center + Right panels -->
    <main class="type-editor__main">
      <div v-if="!selectedType" class="type-editor__empty">
        <div class="empty-state">
          <span class="material-symbols-outlined empty-state__icon">edit_note</span>
          <p class="empty-state__text">Выберите тип для редактирования</p>
          <p class="empty-state__hint">или создайте новый, нажав + в боковой панели</p>
        </div>
      </div>

      <template v-else>
        <div class="type-editor__content">
          <TypeForm
            :selected-type="selectedType"
            :is-dirty="isDirty"
            :is-saving="isSaving"
            :save-error="saveError"
            :is-type-in-use="isTypeInUse"
            @save="handleSave"
            @delete="handleDelete"
            @add-property="addCustomProperty(selectedType)"
            @remove-property="removeCustomProperty(selectedType, $event)"
          />

          <TypeAside
            :attrs-json="attrsJson"
            :type-usages="typeUsages"
            :is-loading-usages="isLoadingUsages"
            :is-new-type="!!selectedType._isNew"
            :type-kind="selectedType.kind"
          />
        </div>
      </template>
    </main>

    <!-- Unsaved changes dialog -->
    <BaseModal
      v-if="showUnsavedDialog"
      title="Несохранённые изменения"
      max-width="400px"
      @close="cancelSwitch"
    >
      <p class="unsaved-dialog__text">У текущего типа есть несохранённые изменения. Отменить изменения и перейти?</p>
      <template #footer>
        <button type="button" class="btn btn--secondary" @click="cancelSwitch">Остаться</button>
        <button type="button" class="btn btn--danger" @click="discardAndSwitch">Отменить и перейти</button>
      </template>
    </BaseModal>
  </div>
</template>

<style scoped>
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* Layout */
.type-editor {
  display: flex;
  height: 100%;
  min-height: 0;
  background: var(--base-bg);
}

/* Main area */
.type-editor__main {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 28px 36px;
}

.type-editor__content {
  display: flex;
  gap: 28px;
  align-items: flex-start;
  animation: fadeIn 0.25s ease;
}

/* Empty state */
.type-editor__empty {
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
  font-size: 56px;
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

/* Buttons */
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

/* Unsaved dialog */
.unsaved-dialog__text {
  margin: 0;
  font-size: 14px;
  color: var(--base-text);
  line-height: 1.55;
}
</style>
