<script setup lang="ts">
import { computed } from "vue"
import { useI18n } from "vue-i18n"
import ToggleSwitch from "@/components/forms/ToggleSwitch.vue"
import MultiSelect from "@/components/forms/MultiSelect.vue"
import SearchableSelect from "@/components/forms/SearchableSelect.vue"
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
  mappedOnly: boolean
  heatmapEnabled: boolean
  hideEmptyAxes: boolean
}>()

const emit = defineEmits<{
  "update:notationId": [value: string | null]
  "update:selectedRowIds": [value: string[]]
  "update:selectedColumnIds": [value: string[]]
  "update:selectedRelationIds": [value: string[]]
  "update:mappedOnly": [value: boolean]
  "update:heatmapEnabled": [value: boolean]
  "update:hideEmptyAxes": [value: boolean]
}>()

const { t } = useI18n()

const notationSelectValue = computed(() => props.notationId ?? "")
const notationSelectOptions = computed(() => props.notationOptions.map(option => ({ id: option.id, label: option.label })))
const rowMultiOptions = computed(() =>
  props.rowOptions.map(option => ({
    id: option.id,
    label: `${option.name} (${props.rowCounts[option.id] ?? 0})`,
  }))
)
const columnMultiOptions = computed(() =>
  props.columnOptions.map(option => ({
    id: option.id,
    label: `${option.name} (${props.columnCounts[option.id] ?? 0})`,
  }))
)
const relationMultiOptions = computed(() =>
  props.relationOptions.map(option => ({ id: option.id, label: option.name }))
)
</script>

<template>
  <section class="matrix-filters">
    <div class="matrix-filters__group">
      <label class="matrix-filters__label">{{ t("models.relationMatrixNotationLabel") }}</label>
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
    </div>

    <div class="matrix-filters__group">
      <label class="matrix-filters__label">{{ t("models.relationMatrixRowsLabel") }}</label>
      <MultiSelect
        :model-value="selectedRowIds"
        :options="rowMultiOptions"
        :placeholder="t('common.selectValue')"
        :search-placeholder="t('common.search')"
        :empty-text="t('common.nothingFound')"
        @update:model-value="emit('update:selectedRowIds', $event)"
      />
    </div>

    <div class="matrix-filters__group">
      <label class="matrix-filters__label">{{ t("models.relationMatrixColumnsLabel") }}</label>
      <MultiSelect
        :model-value="selectedColumnIds"
        :options="columnMultiOptions"
        :placeholder="t('common.selectValue')"
        :search-placeholder="t('common.search')"
        :empty-text="t('common.nothingFound')"
        @update:model-value="emit('update:selectedColumnIds', $event)"
      />
    </div>

    <div class="matrix-filters__group">
      <label class="matrix-filters__label">{{ t("models.relationMatrixRelationsLabel") }}</label>
      <MultiSelect
        :model-value="selectedRelationIds"
        :options="relationMultiOptions"
        :placeholder="t('common.selectValue')"
        :search-placeholder="t('common.search')"
        :empty-text="t('common.nothingFound')"
        @update:model-value="emit('update:selectedRelationIds', $event)"
      />
    </div>

    <div class="matrix-filters__toggles">
      <ToggleSwitch :model-value="mappedOnly" @update:model-value="emit('update:mappedOnly', $event)">
        {{ t("models.relationMatrixMappedOnly") }}
      </ToggleSwitch>
      <ToggleSwitch :model-value="heatmapEnabled" @update:model-value="emit('update:heatmapEnabled', $event)">
        {{ t("models.relationMatrixHeatmapToggle") }}
      </ToggleSwitch>
      <ToggleSwitch
        :model-value="hideEmptyAxes"
        @update:model-value="emit('update:hideEmptyAxes', $event)"
      >
        {{ t("models.relationMatrixHideEmptyAxes") }}
      </ToggleSwitch>
    </div>

  </section>
</template>

<style scoped>
.matrix-filters {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 10px;
  height: 100%;
  box-sizing: border-box;
  overflow: auto;
  background: var(--surface);
}

.matrix-filters__group {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.matrix-filters__label {
  font-size: 11px;
  color: var(--text-subtle);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.matrix-filters__toggles {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

</style>
