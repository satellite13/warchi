<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import BaseModal from '@/components/modals/BaseModal.vue'
import OutlineShapePreview from './OutlineShapePreview.vue'
import {
  setBulkShapeImportAction,
  type ShapeImportConflict,
  type ShapeImportResolution,
  type ShapeImportAction,
} from '@/features/notations/utils/importShapeConflicts'

const props = defineProps<{
  conflicts: ShapeImportConflict[]
  modelValue: ShapeImportResolution[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: ShapeImportResolution[]]
  confirm: []
  cancel: []
}>()

const { t } = useI18n()

function resolutionFor(importedId: string): ShapeImportResolution | undefined {
  return props.modelValue.find((r) => r.importedId === importedId)
}

function patchResolution(importedId: string, patch: Partial<ShapeImportResolution>) {
  emit(
    'update:modelValue',
    props.modelValue.map((row) => (row.importedId === importedId ? { ...row, ...patch } : row))
  )
}

function bulk(action: ShapeImportAction) {
  emit('update:modelValue', setBulkShapeImportAction(props.modelValue, action))
}

function selectedCandidate(conflict: ShapeImportConflict) {
  const res = resolutionFor(conflict.imported.id)
  return conflict.candidates.find((c) => c.id === res?.catalogShapeId) ?? conflict.candidates[0]
}

function geometryMatchesSelected(conflict: ShapeImportConflict): boolean {
  const selected = selectedCandidate(conflict)
  if (!selected) return false
  const idx = conflict.candidates.findIndex((c) => c.id === selected.id)
  return idx >= 0 ? conflict.geometryMatches[idx] === true : false
}

function candidateHint(permission: string | null | undefined): string {
  return permission === 'OWNER'
    ? t('notations.importShapeResolveCandidateOwner')
    : t('notations.importShapeResolveCandidateShared')
}
</script>

<template>
  <BaseModal
    :title="t('notations.importShapeResolveTitle')"
    max-width="720px"
    @close="emit('cancel')"
  >
    <p class="leave-dialog__text">{{ t('notations.importShapeResolveText') }}</p>

    <div class="shape-resolve__bulk">
      <button type="button" class="btn btn--secondary" @click="bulk('reuse')">
        {{ t('notations.importShapeResolveBulkReuse') }}
      </button>
      <button type="button" class="btn btn--secondary" @click="bulk('create')">
        {{ t('notations.importShapeResolveBulkCreate') }}
      </button>
    </div>

    <div
      v-for="conflict in conflicts"
      :key="conflict.imported.id"
      class="shape-resolve__row"
      :class="{ 'shape-resolve__row--warn': !geometryMatchesSelected(conflict) }"
    >
      <div class="shape-resolve__row-head">
        <strong>{{ conflict.imported.name }}</strong>
        <div class="shape-resolve__controls">
          <label v-if="conflict.candidates.length > 1" class="shape-resolve__field">
            <span>{{ t('notations.importShapeResolveCandidate') }}</span>
            <select
              :value="resolutionFor(conflict.imported.id)?.catalogShapeId"
              @change="
                patchResolution(conflict.imported.id, {
                  catalogShapeId: ($event.target as HTMLSelectElement).value,
                })
              "
            >
              <option v-for="c in conflict.candidates" :key="c.id" :value="c.id">
                {{ c.name }} · {{ candidateHint(c.accessPermission) }}
              </option>
            </select>
          </label>
          <label class="shape-resolve__field">
            <span>{{ t('notations.importShapeResolveAction') }}</span>
            <select
              :value="resolutionFor(conflict.imported.id)?.action"
              @change="
                patchResolution(conflict.imported.id, {
                  action: ($event.target as HTMLSelectElement).value as ShapeImportAction,
                })
              "
            >
              <option value="reuse">{{ t('notations.importShapeResolveReuse') }}</option>
              <option value="create">{{ t('notations.importShapeResolveCreate') }}</option>
            </select>
          </label>
        </div>
      </div>

      <div class="shape-resolve__previews">
        <OutlineShapePreview
          :outline-json="conflict.imported.outline"
          :label="t('notations.importShapeResolveFromFile')"
        />
        <OutlineShapePreview
          :outline-json="selectedCandidate(conflict)?.outline ?? null"
          :label="t('notations.importShapeResolveInCatalog')"
        />
      </div>

      <p
        class="shape-resolve__geom"
        :class="
          geometryMatchesSelected(conflict)
            ? 'shape-resolve__geom--ok'
            : 'shape-resolve__geom--warn'
        "
      >
        {{
          geometryMatchesSelected(conflict)
            ? t('notations.importShapeResolveGeometryMatch')
            : t('notations.importShapeResolveGeometryDiffer')
        }}
      </p>
    </div>

    <template #footer>
      <button type="button" class="btn btn--secondary" @click="emit('cancel')">
        {{ t('notations.importShapeResolveCancel') }}
      </button>
      <button type="button" class="btn btn--primary" @click="emit('confirm')">
        {{ t('notations.importShapeResolveContinue') }}
      </button>
    </template>
  </BaseModal>
</template>

<style scoped>
.leave-dialog__text {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-muted);
}
.shape-resolve__bulk {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: 0.75rem 0 1rem;
}
.shape-resolve__row {
  border: 1px solid var(--border, #d8d4ce);
  border-radius: 8px;
  padding: 0.75rem;
  margin-bottom: 0.75rem;
}
.shape-resolve__row--warn {
  border-color: var(--warning);
}
.shape-resolve__row-head {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}
.shape-resolve__controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}
.shape-resolve__field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.8rem;
  color: var(--text-muted);
}
.shape-resolve__field select {
  min-width: 10rem;
}
.shape-resolve__previews {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}
.shape-resolve__geom {
  margin: 0.5rem 0 0;
  font-size: 0.85rem;
}
.shape-resolve__geom--ok {
  color: var(--success);
}
.shape-resolve__geom--warn {
  color: var(--warning);
}
</style>
