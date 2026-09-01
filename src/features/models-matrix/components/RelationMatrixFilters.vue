<script setup lang="ts">
import { computed } from "vue"
import { useI18n } from "vue-i18n"
import ToggleSwitch from "@/components/forms/ToggleSwitch.vue"
import MultiSelect from "@/components/forms/MultiSelect.vue"
import SearchableSelect from "@/components/forms/SearchableSelect.vue"
import MatrixFiltersShell from "@/components/matrix/MatrixFiltersShell.vue"
import MatrixFilterGroup from "@/components/matrix/MatrixFilterGroup.vue"
import type { RelationMatrixEntityOption } from "../types"

const props = defineProps<{
  notationOptions: Array<{ id: string; label: string }>
  notationId: string | null
  rowOptions: RelationMatrixEntityOption[]
  columnOptions: RelationMatrixEntityOption[]
  relationOptions: RelationMatrixEntityOption[]
  rowCounts: Record<string, number>
  columnCounts: Record<string, number>
  selectedRowIds: string[]
  selectedColumnIds: string[]
  selectedRelationIds: string[]
  allowedOnly: boolean
  heatmapEnabled: boolean
  hideEmptyAxes: boolean
}>()

const emit = defineEmits<{
  "update:notationId": [value: string | null]
  "update:selectedRowIds": [value: string[]]
  "update:selectedColumnIds": [value: string[]]
  "update:selectedRelationIds": [value: string[]]
  "update:allowedOnly": [value: boolean]
  "update:heatmapEnabled": [value: boolean]
  "update:hideEmptyAxes": [value: boolean]
}>()

const { t } = useI18n()

const notationSelectValue = computed(() => props.notationId ?? "")
const notationSelectOptions = computed(() =>
  props.notationOptions.map(option => ({ id: option.id, label: option.label })),
)
const rowMultiOptions = computed(() =>
  props.rowOptions.map(option => ({
    id: option.id,
    label: `${option.name} (${props.rowCounts[option.id] ?? 0})`,
  })),
)
const columnMultiOptions = computed(() =>
  props.columnOptions.map(option => ({
    id: option.id,
    label: `${option.name} (${props.columnCounts[option.id] ?? 0})`,
  })),
)
const relationMultiOptions = computed(() =>
  props.relationOptions.map(option => ({ id: option.id, label: option.name })),
)
</script>

<template>
  <MatrixFiltersShell padding="sm">
    <MatrixFilterGroup :label="t('models.relationMatrixNotationLabel')">
      <SearchableSelect
        :model-value="notationSelectValue"
        :options="notationSelectOptions"
        :allow-empty="true"
        :empty-label="t('models.relationMatrixWithoutNotation')"
        :placeholder="t('models.relationMatrixWithoutNotation')"
        :search-placeholder="t('common.search')"
        :empty-text="t('common.nothingFound')"
        @update:model-value="emit('update:notationId', $event || null)"
      />
    </MatrixFilterGroup>

    <MatrixFilterGroup :label="t('models.relationMatrixRowsLabel')">
      <MultiSelect
        :model-value="selectedRowIds"
        :options="rowMultiOptions"
        :placeholder="t('common.selectValue')"
        :search-placeholder="t('common.search')"
        :empty-text="t('common.nothingFound')"
        @update:model-value="emit('update:selectedRowIds', $event)"
      />
    </MatrixFilterGroup>

    <MatrixFilterGroup :label="t('models.relationMatrixColumnsLabel')">
      <MultiSelect
        :model-value="selectedColumnIds"
        :options="columnMultiOptions"
        :placeholder="t('common.selectValue')"
        :search-placeholder="t('common.search')"
        :empty-text="t('common.nothingFound')"
        @update:model-value="emit('update:selectedColumnIds', $event)"
      />
    </MatrixFilterGroup>

    <MatrixFilterGroup :label="t('models.relationMatrixRelationsLabel')">
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
      <span :title="t('models.relationMatrixAllowedHint')">
        <ToggleSwitch :model-value="allowedOnly" @update:model-value="emit('update:allowedOnly', $event)">
          {{ t("models.relationMatrixAllowedOnly") }}
        </ToggleSwitch>
      </span>
      <ToggleSwitch :model-value="heatmapEnabled" @update:model-value="emit('update:heatmapEnabled', $event)">
        {{ t("models.relationMatrixHeatmapToggle") }}
      </ToggleSwitch>
      <ToggleSwitch
        :model-value="hideEmptyAxes"
        @update:model-value="emit('update:hideEmptyAxes', $event)"
      >
        {{ t("models.relationMatrixHideEmptyAxes") }}
      </ToggleSwitch>
    </template>
  </MatrixFiltersShell>
</template>
