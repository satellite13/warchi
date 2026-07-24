<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ToggleSwitch from '@/components/forms/ToggleSwitch.vue'
import MultiSelect from '@/components/forms/MultiSelect.vue'
import type { RelationRulesMatrixAxisOption } from '../utils/buildRelationRulesMatrix'

const props = defineProps<{
  rowOptions: RelationRulesMatrixAxisOption[]
  columnOptions: RelationRulesMatrixAxisOption[]
  relationOptions: RelationRulesMatrixAxisOption[]
  selectedRowIds: string[]
  selectedColumnIds: string[]
  selectedRelationIds: string[]
  hideEmptyAxes: boolean
}>()

const emit = defineEmits<{
  'update:selectedRowIds': [value: string[]]
  'update:selectedColumnIds': [value: string[]]
  'update:selectedRelationIds': [value: string[]]
  'update:hideEmptyAxes': [value: boolean]
}>()

const { t } = useI18n()

const rowMultiOptions = computed(() =>
  props.rowOptions.map(option => ({ id: option.id, label: option.name })),
)
const columnMultiOptions = computed(() =>
  props.columnOptions.map(option => ({ id: option.id, label: option.name })),
)
const relationMultiOptions = computed(() =>
  props.relationOptions.map(option => ({ id: option.id, label: option.name })),
)

const selectAllRows = () => emit('update:selectedRowIds', props.rowOptions.map(o => o.id))
const clearRows = () => emit('update:selectedRowIds', [])
const selectAllColumns = () => emit('update:selectedColumnIds', props.columnOptions.map(o => o.id))
const clearColumns = () => emit('update:selectedColumnIds', [])
const selectAllRelations = () =>
  emit('update:selectedRelationIds', props.relationOptions.map(o => o.id))
const clearRelations = () => emit('update:selectedRelationIds', [])
</script>

<template>
  <section class="rules-matrix-filters">
    <div class="rules-matrix-filters__group">
      <div class="rules-matrix-filters__label-row">
        <label class="rules-matrix-filters__label">{{
          t('diagram.relationRulesMatrixRowsLabel')
        }}</label>
        <div class="rules-matrix-filters__actions">
          <button type="button" class="link-btn" @click="selectAllRows">
            {{ t('diagram.relationRulesMatrixSelectAll') }}
          </button>
          <button type="button" class="link-btn" @click="clearRows">
            {{ t('diagram.relationRulesMatrixClearSelection') }}
          </button>
        </div>
      </div>
      <MultiSelect
        :model-value="selectedRowIds"
        :options="rowMultiOptions"
        :placeholder="t('common.selectValue')"
        :search-placeholder="t('common.search')"
        :empty-text="t('common.nothingFound')"
        @update:model-value="emit('update:selectedRowIds', $event)"
      />
    </div>

    <div class="rules-matrix-filters__group">
      <div class="rules-matrix-filters__label-row">
        <label class="rules-matrix-filters__label">{{
          t('diagram.relationRulesMatrixColumnsLabel')
        }}</label>
        <div class="rules-matrix-filters__actions">
          <button type="button" class="link-btn" @click="selectAllColumns">
            {{ t('diagram.relationRulesMatrixSelectAll') }}
          </button>
          <button type="button" class="link-btn" @click="clearColumns">
            {{ t('diagram.relationRulesMatrixClearSelection') }}
          </button>
        </div>
      </div>
      <MultiSelect
        :model-value="selectedColumnIds"
        :options="columnMultiOptions"
        :placeholder="t('common.selectValue')"
        :search-placeholder="t('common.search')"
        :empty-text="t('common.nothingFound')"
        @update:model-value="emit('update:selectedColumnIds', $event)"
      />
    </div>

    <div class="rules-matrix-filters__group">
      <div class="rules-matrix-filters__label-row">
        <label class="rules-matrix-filters__label">{{
          t('diagram.relationRulesMatrixRelationsLabel')
        }}</label>
        <div class="rules-matrix-filters__actions">
          <button type="button" class="link-btn" @click="selectAllRelations">
            {{ t('diagram.relationRulesMatrixSelectAll') }}
          </button>
          <button type="button" class="link-btn" @click="clearRelations">
            {{ t('diagram.relationRulesMatrixClearSelection') }}
          </button>
        </div>
      </div>
      <MultiSelect
        :model-value="selectedRelationIds"
        :options="relationMultiOptions"
        :placeholder="t('common.selectValue')"
        :search-placeholder="t('common.search')"
        :empty-text="t('common.nothingFound')"
        @update:model-value="emit('update:selectedRelationIds', $event)"
      />
    </div>

    <div class="rules-matrix-filters__toggles">
      <ToggleSwitch
        :model-value="hideEmptyAxes"
        @update:model-value="emit('update:hideEmptyAxes', $event)"
      >
        {{ t('diagram.relationRulesMatrixHideEmptyAxes') }}
      </ToggleSwitch>
    </div>
  </section>
</template>

<style scoped>
.rules-matrix-filters {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  height: 100%;
  box-sizing: border-box;
  overflow: auto;
  background: var(--surface);
  border-right: 1px solid var(--border);
}

.rules-matrix-filters__group {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.rules-matrix-filters__label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.rules-matrix-filters__label {
  font-size: 11px;
  color: var(--text-subtle);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.rules-matrix-filters__actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.rules-matrix-filters__toggles {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

.link-btn {
  background: none;
  border: none;
  color: var(--primary);
  cursor: pointer;
  font-size: 11px;
  padding: 0;
}

.link-btn:hover {
  text-decoration: underline;
}
</style>
