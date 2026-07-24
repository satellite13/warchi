<script setup lang="ts">
import { computed } from "vue"
import { useI18n } from "vue-i18n"
import type { RelationMatrixResult } from "../types"
import { relationMatrixCellKey } from "../utils/buildRelationMatrix"

const props = defineProps<{
  matrix: RelationMatrixResult
  selectedCellKey: string | null
  selectedRowId: string | null
  selectedColumnId: string | null
  heatmapEnabled: boolean
}>()

const emit = defineEmits<{
  select: [rowId: string, columnId: string]
  "select-row": [rowId: string]
  "select-column": [columnId: string]
}>()
const { t } = useI18n()

const columns = computed(() => props.matrix.columns)
const rows = computed(() => props.matrix.rows)

const heatColor = (total: number): string => {
  if (total <= 0) return "transparent"
  if (!props.heatmapEnabled || props.matrix.maxCellTotal <= 0) return "var(--primary-soft)"
  const ratio = total / props.matrix.maxCellTotal
  const alpha = 0.08 + ratio * 0.52
  return `rgba(124, 92, 252, ${alpha.toFixed(3)})`
}

const cellTitle = (rowId: string, columnId: string): string => {
  const cell = props.matrix.cells[relationMatrixCellKey(rowId, columnId)]
  if (!cell) return t("models.relationMatrixNoLinks")
  return `${t("models.relationMatrixLinksCount")}: ${cell.total}`
}

const isSelected = (rowId: string, columnId: string): boolean =>
  props.selectedCellKey === relationMatrixCellKey(rowId, columnId)

const isRowHighlighted = (rowId: string): boolean => props.selectedRowId === rowId
const isColumnHighlighted = (columnId: string): boolean => props.selectedColumnId === columnId
</script>

<template>
  <div class="matrix-grid-wrap">
    <table class="matrix-grid">
      <thead>
        <tr>
          <th class="matrix-grid__sticky matrix-grid__sticky--left matrix-grid__head-cell">
            {{ t("models.relationMatrixAxesLabel") }}
          </th>
          <th
            v-for="column in columns"
            :key="column.id"
            class="matrix-grid__head-cell matrix-grid__head-cell--clickable"
            :class="{ 'matrix-grid__head-cell--highlighted': isColumnHighlighted(column.id) }"
            @click="emit('select-column', column.id)"
          >
            {{ column.name }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.id">
          <th
            class="matrix-grid__sticky matrix-grid__sticky--left matrix-grid__row-cell matrix-grid__row-cell--clickable"
            :class="{ 'matrix-grid__row-cell--highlighted': isRowHighlighted(row.id) }"
            @click="emit('select-row', row.id)"
          >
            {{ row.name }}
          </th>
          <td
            v-for="column in columns"
            :key="column.id"
            class="matrix-grid__cell"
            :class="{
              'matrix-grid__cell--active': isSelected(row.id, column.id),
              'matrix-grid__cell--row-highlighted': isRowHighlighted(row.id),
              'matrix-grid__cell--column-highlighted': isColumnHighlighted(column.id),
              'matrix-grid__cell--allowed':
                matrix.cells[relationMatrixCellKey(row.id, column.id)]?.allowedByNotationRules,
            }"
            :style="{ background: heatColor(matrix.cells[relationMatrixCellKey(row.id, column.id)]?.total ?? 0) }"
            :title="cellTitle(row.id, column.id)"
            @click="emit('select', row.id, column.id)"
          >
            {{ matrix.cells[relationMatrixCellKey(row.id, column.id)]?.total ?? 0 }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.matrix-grid-wrap {
  overflow: auto;
  height: 100%;
  background: var(--surface);
}

.matrix-grid {
  border-collapse: collapse;
  min-width: max-content;
}

.matrix-grid__head-cell,
.matrix-grid__row-cell,
.matrix-grid__cell {
  border: 1px solid var(--border);
  min-width: 120px;
  height: 36px;
  text-align: center;
  font-size: 12px;
  padding: 0 8px;
  background: var(--surface);
}

.matrix-grid__head-cell {
  position: sticky;
  top: 0;
  z-index: 2;
  background-color: var(--surface);
}

.matrix-grid__head-cell--clickable {
  cursor: pointer;
}

.matrix-grid__head-cell--highlighted {
  background-color: var(--surface-strong);
  color: var(--primary);
}

.matrix-grid__row-cell {
  text-align: left;
  min-width: 220px;
  max-width: 220px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  background-color: var(--surface);
}

.matrix-grid__row-cell--clickable {
  cursor: pointer;
}

.matrix-grid__row-cell--highlighted {
  background-color: var(--surface-strong);
  color: var(--primary);
}

.matrix-grid__sticky {
  position: sticky;
  z-index: 3;
}

.matrix-grid__sticky--left {
  left: 0;
}

.matrix-grid__cell {
  cursor: pointer;
  transition: box-shadow 0.12s ease;
}

.matrix-grid__cell:hover {
  box-shadow: inset 0 0 0 1px var(--primary);
}

.matrix-grid__cell--active {
  box-shadow: inset 0 0 0 2px var(--primary);
  font-weight: 600;
}

.matrix-grid__cell--row-highlighted:not(.matrix-grid__cell--active),
.matrix-grid__cell--column-highlighted:not(.matrix-grid__cell--active) {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--primary) 45%, transparent);
}

.matrix-grid__cell--allowed {
  border-color: color-mix(in srgb, var(--success) 45%, var(--border));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--success) 30%, transparent);
}
</style>
