<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ToggleSwitch from '@/components/forms/ToggleSwitch.vue'
import MultiSelect from '@/components/forms/MultiSelect.vue'
import MatrixFiltersShell from '@/components/matrix/MatrixFiltersShell.vue'
import MatrixFilterGroup from '@/components/matrix/MatrixFilterGroup.vue'
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
  <MatrixFiltersShell bordered>
    <MatrixFilterGroup :label="t('diagram.relationRulesMatrixRowsLabel')">
      <template #actions>
        <button type="button" class="link-btn" @click="selectAllRows">
          {{ t('diagram.relationRulesMatrixSelectAll') }}
        </button>
        <button type="button" class="link-btn" @click="clearRows">
          {{ t('diagram.relationRulesMatrixClearSelection') }}
        </button>
      </template>
      <MultiSelect
        :model-value="selectedRowIds"
        :options="rowMultiOptions"
        :placeholder="t('common.selectValue')"
        :search-placeholder="t('common.search')"
        :empty-text="t('common.nothingFound')"
        @update:model-value="emit('update:selectedRowIds', $event)"
      />
    </MatrixFilterGroup>

    <MatrixFilterGroup :label="t('diagram.relationRulesMatrixColumnsLabel')">
      <template #actions>
        <button type="button" class="link-btn" @click="selectAllColumns">
          {{ t('diagram.relationRulesMatrixSelectAll') }}
        </button>
        <button type="button" class="link-btn" @click="clearColumns">
          {{ t('diagram.relationRulesMatrixClearSelection') }}
        </button>
      </template>
      <MultiSelect
        :model-value="selectedColumnIds"
        :options="columnMultiOptions"
        :placeholder="t('common.selectValue')"
        :search-placeholder="t('common.search')"
        :empty-text="t('common.nothingFound')"
        @update:model-value="emit('update:selectedColumnIds', $event)"
      />
    </MatrixFilterGroup>

    <MatrixFilterGroup :label="t('diagram.relationRulesMatrixRelationsLabel')">
      <template #actions>
        <button type="button" class="link-btn" @click="selectAllRelations">
          {{ t('diagram.relationRulesMatrixSelectAll') }}
        </button>
        <button type="button" class="link-btn" @click="clearRelations">
          {{ t('diagram.relationRulesMatrixClearSelection') }}
        </button>
      </template>
      <MultiSelect
        :model-value="selectedRelationIds"
        :options="relationMultiOptions"
        :placeholder="t('common.selectValue')"
        :search-placeholder="t('common.search')"
        :empty-text="t('common.nothingFound')"
        @update:model-value="emit('update:selectedRelationIds', $event)"
      />
    </MatrixFilterGroup>

    <template #toggles>
      <ToggleSwitch
        :model-value="hideEmptyAxes"
        @update:model-value="emit('update:hideEmptyAxes', $event)"
      >
        {{ t('diagram.relationRulesMatrixHideEmptyAxes') }}
      </ToggleSwitch>
    </template>
  </MatrixFiltersShell>
</template>

<style scoped>
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
