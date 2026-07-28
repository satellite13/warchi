<script setup lang="ts">
import { computed, nextTick, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { RelationRulesMatrixResult } from '../utils/buildRelationRulesMatrix'
import { relationRulesMatrixCellKey } from '../utils/buildRelationRulesMatrix'

const props = defineProps<{
  matrix: RelationRulesMatrixResult
  selectedCellKey: string | null
}>()

const emit = defineEmits<{
  select: [fromId: string, toId: string]
  open: [fromId: string, toId: string]
}>()

const { t } = useI18n()

const rows = computed(() => props.matrix.rows)
const columns = computed(() => props.matrix.columns)

const heatColor = (total: number): string => {
  if (total <= 0) return 'transparent'
  if (props.matrix.maxCellTotal <= 0) return 'var(--primary-soft)'
  const ratio = total / props.matrix.maxCellTotal
  const alpha = 0.08 + ratio * 0.52
  return `rgba(124, 92, 252, ${alpha.toFixed(3)})`
}

const cellTitle = (fromId: string, toId: string): string => {
  const cell = props.matrix.cells[relationRulesMatrixCellKey(fromId, toId)]
  const hint = t('diagram.relationRulesMatrixCellHint')
  if (!cell || cell.total <= 0) {
    return `${t('diagram.relationRulesMatrixNoRules')}. ${hint}`
  }
  const names = cell.relationNames.join(', ')
  return `${t('diagram.relationRulesMatrixLinksCount')}: ${cell.total}${names ? ` — ${names}` : ''}. ${hint}`
}

const isSelected = (fromId: string, toId: string): boolean =>
  props.selectedCellKey === relationRulesMatrixCellKey(fromId, toId)

const cellDomId = (fromId: string, toId: string): string =>
  `rules-matrix-cell-${relationRulesMatrixCellKey(fromId, toId)}`

watch(
  () => props.selectedCellKey,
  async key => {
    if (!key) return
    await nextTick()
    const el = document.getElementById(`rules-matrix-cell-${key}`)
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  },
)
</script>

<template>
  <div class="rules-matrix-grid-wrap" tabindex="0">
    <div v-if="rows.length === 0 || columns.length === 0" class="rules-matrix-grid-wrap__empty">
      {{ t('diagram.relationRulesMatrixEmptyAxes') }}
    </div>
    <table v-else class="rules-matrix-grid">
      <thead>
        <tr>
          <th class="rules-matrix-grid__sticky rules-matrix-grid__sticky--left rules-matrix-grid__head">
            {{ t('diagram.relationRulesMatrixAxesLabel') }}
          </th>
          <th
            v-for="column in columns"
            :key="column.id"
            class="rules-matrix-grid__head"
            :title="column.name"
          >
            {{ column.name }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.id">
          <th
            class="rules-matrix-grid__sticky rules-matrix-grid__sticky--left rules-matrix-grid__row"
            :title="row.name"
          >
            {{ row.name }}
          </th>
          <td
            v-for="column in columns"
            :key="column.id"
            :id="cellDomId(row.id, column.id)"
            class="rules-matrix-grid__cell"
            :class="{ 'rules-matrix-grid__cell--active': isSelected(row.id, column.id) }"
            :style="{
              background: heatColor(
                matrix.cells[relationRulesMatrixCellKey(row.id, column.id)]?.total ?? 0,
              ),
            }"
            :title="cellTitle(row.id, column.id)"
            @click="emit('select', row.id, column.id)"
            @dblclick.prevent="emit('open', row.id, column.id)"
          >
            {{ matrix.cells[relationRulesMatrixCellKey(row.id, column.id)]?.total ?? 0 }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.rules-matrix-grid-wrap {
  overflow: auto;
  height: 100%;
  background: var(--surface);
  outline: none;
}

.rules-matrix-grid-wrap:focus-visible {
  box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--primary) 35%, transparent);
}

.rules-matrix-grid-wrap__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 24px;
  color: var(--text-subtle);
  font-size: 13px;
  text-align: center;
}

.rules-matrix-grid {
  border-collapse: collapse;
  min-width: max-content;
}

.rules-matrix-grid__head,
.rules-matrix-grid__row,
.rules-matrix-grid__cell {
  border: 1px solid var(--border);
  min-width: 88px;
  height: 36px;
  text-align: center;
  font-size: 12px;
  padding: 0 8px;
  background: var(--surface);
  user-select: none;
}

.rules-matrix-grid__head {
  position: sticky;
  top: 0;
  z-index: 2;
  background-color: var(--surface);
  max-width: 140px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rules-matrix-grid__row {
  text-align: left;
  min-width: 180px;
  max-width: 220px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  background-color: var(--surface);
  font-weight: 500;
}

.rules-matrix-grid__sticky {
  position: sticky;
  z-index: 3;
}

.rules-matrix-grid__sticky--left {
  left: 0;
}

.rules-matrix-grid__cell {
  cursor: pointer;
  transition: box-shadow 0.12s ease;
}

.rules-matrix-grid__cell:hover {
  box-shadow: inset 0 0 0 1px var(--primary);
}

.rules-matrix-grid__cell--active {
  box-shadow: inset 0 0 0 2px var(--primary);
  font-weight: 600;
}
</style>
