<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { createId } from '@/domain/attrs/notationAttrs'
import type { EditorComponent, EditorRelation, EditorRelationRule } from '../types'
import { applyRelationRuleCell } from '../utils/applyRelationRuleCell'
import {
  buildRelationRulesMatrix,
  relationRulesMatrixCellKey,
  type RelationRulesMatrixFilters,
} from '../utils/buildRelationRulesMatrix'
import RelationRulesMatrixFiltersPanel from './RelationRulesMatrixFilters.vue'
import RelationRulesMatrixGrid from './RelationRulesMatrixGrid.vue'
import RelationRulesCellDialog from './RelationRulesCellDialog.vue'

const props = defineProps<{
  components: EditorComponent[]
  relations: EditorRelation[]
  relationRules: EditorRelationRule[]
  nodeTypes?: Array<{ id: string; name: string }>
  linkTypes?: Array<{ id: string; name: string }>
  onMutateRelationRules?: (apply: (rules: EditorRelationRule[]) => void) => void
}>()

const emit = defineEmits<{
  close: []
}>()

const { t } = useI18n()

const UNTYPED_NAMES = new Set(['diagram only'])
const normalizeName = (value: string | undefined): string => value?.trim().toLowerCase() ?? ''
const isUntypedTypeName = (name: string | undefined): boolean =>
  UNTYPED_NAMES.has(normalizeName(name))

const untypedNodeTypeIds = computed(
  () =>
    new Set(
      (props.nodeTypes ?? [])
        .filter(item => isUntypedTypeName(item.name))
        .map(item => item.id),
    ),
)

const untypedLinkTypeIds = computed(
  () =>
    new Set(
      (props.linkTypes ?? [])
        .filter(item => isUntypedTypeName(item.name))
        .map(item => item.id),
    ),
)

const filters = ref<RelationRulesMatrixFilters>({
  selectedRowIds: [],
  selectedColumnIds: [],
  selectedRelationIds: [],
  hideEmptyAxes: false,
})

const selectedCellKey = ref<string | null>(null)
const dialogFromId = ref<string | null>(null)
const dialogToId = ref<string | null>(null)
const clipboardRelationIds = ref<string[]>([])

const matrix = computed(() =>
  buildRelationRulesMatrix({
    filters: filters.value,
    components: props.components,
    relations: props.relations,
    relationRules: props.relationRules,
    untypedNodeTypeIds: untypedNodeTypeIds.value,
    untypedLinkTypeIds: untypedLinkTypeIds.value,
  }),
)

watch(
  () => matrix.value.rowOptions.map(o => o.id).join(','),
  () => {
    const ids = new Set(matrix.value.rowOptions.map(o => o.id))
    filters.value.selectedRowIds = filters.value.selectedRowIds.filter(id => ids.has(id))
    filters.value.selectedColumnIds = filters.value.selectedColumnIds.filter(id => ids.has(id))
  },
)

watch(
  () => matrix.value.relationOptions.map(o => o.id).join(','),
  () => {
    const ids = new Set(matrix.value.relationOptions.map(o => o.id))
    filters.value.selectedRelationIds = filters.value.selectedRelationIds.filter(id =>
      ids.has(id),
    )
    clipboardRelationIds.value = clipboardRelationIds.value.filter(id => ids.has(id))
  },
)

const nameByComponentId = computed(() => {
  const map = new Map<string, string>()
  for (const option of matrix.value.rowOptions) {
    map.set(option.id, option.name)
  }
  return map
})

const relationSelectOptions = computed(() =>
  matrix.value.relationOptions.map(r => ({ id: r.id, label: r.name })),
)

const dialogFromName = computed(() =>
  dialogFromId.value
    ? (nameByComponentId.value.get(dialogFromId.value) ?? dialogFromId.value)
    : '',
)
const dialogToName = computed(() =>
  dialogToId.value ? (nameByComponentId.value.get(dialogToId.value) ?? dialogToId.value) : '',
)

const dialogSelectedRelationIds = computed(() => {
  if (!dialogFromId.value || !dialogToId.value) return []
  const rule = props.relationRules.find(
    r =>
      r.fromComponentId === dialogFromId.value &&
      r.toComponentId === dialogToId.value &&
      !r._isDeleted,
  )
  return rule ? [...rule.allowedRelationIds] : []
})

const showDialog = computed(() => Boolean(dialogFromId.value && dialogToId.value))

const selectCell = (fromId: string, toId: string) => {
  selectedCellKey.value = relationRulesMatrixCellKey(fromId, toId)
}

const openCellDialog = (fromId: string, toId: string) => {
  selectCell(fromId, toId)
  dialogFromId.value = fromId
  dialogToId.value = toId
}

const closeDialog = () => {
  dialogFromId.value = null
  dialogToId.value = null
}

const applyCell = (relationIds: string[]) => {
  if (!dialogFromId.value || !dialogToId.value) return
  const fromId = dialogFromId.value
  const toId = dialogToId.value
  props.onMutateRelationRules?.(rules => {
    applyRelationRuleCell(rules, fromId, toId, relationIds, createId)
  })
  closeDialog()
}

const copyCellRelations = (relationIds: string[]) => {
  clipboardRelationIds.value = Array.from(new Set(relationIds))
}

const relationIdsForCell = (fromId: string, toId: string): string[] => {
  const rule = props.relationRules.find(
    r => r.fromComponentId === fromId && r.toComponentId === toId && !r._isDeleted,
  )
  return rule ? [...rule.allowedRelationIds] : []
}

const parseSelectedCellKey = (): { fromId: string; toId: string } | null => {
  const key = selectedCellKey.value
  if (!key) return null
  const sep = key.indexOf('::')
  if (sep <= 0) return null
  return { fromId: key.slice(0, sep), toId: key.slice(sep + 2) }
}

const ensureSelectedCell = (): { fromId: string; toId: string } | null => {
  const existing = parseSelectedCellKey()
  if (existing) {
    const rowOk = matrix.value.rows.some(r => r.id === existing.fromId)
    const colOk = matrix.value.columns.some(c => c.id === existing.toId)
    if (rowOk && colOk) return existing
  }
  const firstRow = matrix.value.rows[0]
  const firstCol = matrix.value.columns[0]
  if (!firstRow || !firstCol) return null
  selectCell(firstRow.id, firstCol.id)
  return { fromId: firstRow.id, toId: firstCol.id }
}

const moveSelection = (dRow: number, dCol: number) => {
  const rows = matrix.value.rows
  const cols = matrix.value.columns
  if (rows.length === 0 || cols.length === 0) return

  const current = ensureSelectedCell()
  if (!current) return

  let rowIndex = rows.findIndex(r => r.id === current.fromId)
  let colIndex = cols.findIndex(c => c.id === current.toId)
  if (rowIndex < 0) rowIndex = 0
  if (colIndex < 0) colIndex = 0

  const nextRow = Math.max(0, Math.min(rows.length - 1, rowIndex + dRow))
  const nextCol = Math.max(0, Math.min(cols.length - 1, colIndex + dCol))
  const row = rows[nextRow]
  const col = cols[nextCol]
  if (!row || !col) return
  selectCell(row.id, col.id)
}

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  )
}

const isInFilters = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false
  return Boolean(target.closest('.rules-matrix-overlay__filters'))
}

const applyCellTo = (fromId: string, toId: string, relationIds: string[]) => {
  props.onMutateRelationRules?.(rules => {
    applyRelationRuleCell(rules, fromId, toId, relationIds, createId)
  })
}

const onKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    if (showDialog.value) {
      closeDialog()
      event.stopPropagation()
      return
    }
    emit('close')
    return
  }

  if (showDialog.value || isEditableTarget(event.target) || isInFilters(event.target)) return

  const arrowMap: Record<string, [number, number]> = {
    ArrowUp: [-1, 0],
    ArrowDown: [1, 0],
    ArrowLeft: [0, -1],
    ArrowRight: [0, 1],
  }
  const delta = arrowMap[event.key]
  if (delta) {
    event.preventDefault()
    moveSelection(delta[0], delta[1])
    return
  }

  if (event.key === 'Enter') {
    const cell = ensureSelectedCell()
    if (!cell) return
    event.preventDefault()
    openCellDialog(cell.fromId, cell.toId)
    return
  }

  const mod = event.metaKey || event.ctrlKey
  if (!mod) return
  const cell = ensureSelectedCell()
  if (!cell) return
  const key = event.key.toLowerCase()
  if (key === 'c') {
    event.preventDefault()
    copyCellRelations(relationIdsForCell(cell.fromId, cell.toId))
    return
  }
  if (key === 'v') {
    if (clipboardRelationIds.value.length === 0) return
    event.preventDefault()
    applyCellTo(cell.fromId, cell.toId, clipboardRelationIds.value)
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown, true)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown, true)
})
</script>

<template>
  <div class="rules-matrix-overlay" role="dialog" aria-modal="true">
    <div class="rules-matrix-overlay__header">
      <div class="rules-matrix-overlay__header-text">
        <h2 class="rules-matrix-overlay__title">{{ t('diagram.relationRulesMatrixTitle') }}</h2>
        <p v-if="clipboardRelationIds.length > 0" class="rules-matrix-overlay__clipboard">
          {{
            t('diagram.relationRulesMatrixClipboardHint', { count: clipboardRelationIds.length })
          }}
        </p>
      </div>
      <button
        type="button"
        class="rules-matrix-overlay__close"
        :title="t('common.close')"
        :aria-label="t('common.close')"
        @click="emit('close')"
      >
        <UiIcon name="close" />
      </button>
    </div>

    <div class="rules-matrix-overlay__body">
      <aside class="rules-matrix-overlay__filters">
        <RelationRulesMatrixFiltersPanel
          :row-options="matrix.rowOptions"
          :column-options="matrix.columnOptions"
          :relation-options="matrix.relationOptions"
          :selected-row-ids="filters.selectedRowIds"
          :selected-column-ids="filters.selectedColumnIds"
          :selected-relation-ids="filters.selectedRelationIds"
          :hide-empty-axes="filters.hideEmptyAxes"
          @update:selected-row-ids="filters.selectedRowIds = $event"
          @update:selected-column-ids="filters.selectedColumnIds = $event"
          @update:selected-relation-ids="filters.selectedRelationIds = $event"
          @update:hide-empty-axes="filters.hideEmptyAxes = $event"
        />
      </aside>
      <div class="rules-matrix-overlay__grid">
        <RelationRulesMatrixGrid
          :matrix="matrix"
          :selected-cell-key="selectedCellKey"
          @select="selectCell"
          @open="openCellDialog"
        />
      </div>
    </div>

    <RelationRulesCellDialog
      v-if="showDialog"
      :from-name="dialogFromName"
      :to-name="dialogToName"
      :relation-options="relationSelectOptions"
      :selected-relation-ids="dialogSelectedRelationIds"
      :clipboard-relation-ids="clipboardRelationIds"
      @close="closeDialog"
      @apply="applyCell"
      @copy="copyCellRelations"
    />
  </div>
</template>

<style scoped>
.rules-matrix-overlay {
  position: fixed;
  inset: 0;
  /* Below BaseModal (z-index: 1000) so the cell dialog is visible above the matrix */
  z-index: 900;
  display: flex;
  flex-direction: column;
  background: var(--base-bg);
}

.rules-matrix-overlay__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  flex-shrink: 0;
}

.rules-matrix-overlay__header-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.rules-matrix-overlay__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.rules-matrix-overlay__clipboard {
  margin: 0;
  font-size: 12px;
  color: var(--text-subtle);
}

.rules-matrix-overlay__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}

.rules-matrix-overlay__close:hover {
  background: var(--surface-muted);
  color: var(--base-text);
}

.rules-matrix-overlay__body {
  display: flex;
  flex: 1;
  min-height: 0;
}

.rules-matrix-overlay__filters {
  width: 280px;
  flex-shrink: 0;
  min-height: 0;
}

.rules-matrix-overlay__grid {
  flex: 1;
  min-width: 0;
  min-height: 0;
}
</style>
