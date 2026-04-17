<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import { useI18n } from "vue-i18n"
import { apiGet } from "@/composables/useApi"
import MainLayout from "@/layouts/MainLayout.vue"
import AppHeader from "@/components/layout/AppHeader.vue"
import AppFooter from "@/components/layout/AppFooter.vue"
import ResizablePanelLayout from "@/components/layout/ResizablePanelLayout.vue"
import { useRelationMatrixData } from "@/features/models-matrix/composables/useRelationMatrixData"
import { UNMAPPED_ENTITY_ID, type RelationMatrixFilters as RelationMatrixFilterState } from "@/features/models-matrix/types"
import type { NotationMetaResponse } from "@/types/api"
import { buildRelationMatrix, relationMatrixCellKey } from "@/features/models-matrix/utils/buildRelationMatrix"
import { downloadRelationMatrixCsv } from "@/features/models-matrix/utils/relationMatrixCsv"
import { exportRelationMatrixPng } from "@/features/models-matrix/utils/relationMatrixPng"
import RelationMatrixFilters from "@/features/models-matrix/components/RelationMatrixFilters.vue"
import RelationMatrixGrid from "@/features/models-matrix/components/RelationMatrixGrid.vue"
import RelationMatrixDetailsPanel from "@/features/models-matrix/components/RelationMatrixDetailsPanel.vue"

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const modelId = computed(() => String(route.params.id ?? ""))
const { loading, error, model, state, load } = useRelationMatrixData()
const fallbackNotationMetaById = ref<Record<string, NotationMetaResponse>>({})
let notationMetaRequestToken = 0

const matrixFilters = ref<RelationMatrixFilterState>({
  notationId: null,
  selectedRowIds: [],
  selectedColumnIds: [],
  selectedRelationIds: [],
  mappedOnly: false,
  heatmapEnabled: true,
  hideEmptyAxes: false,
})
const relationSelectionInitialized = ref(false)

const selectedCellKey = ref<string | null>(null)
const selectedRowId = ref<string | null>(null)
const selectedColumnId = ref<string | null>(null)

const matrix = computed(() => {
  const currentState = state.value
  if (!currentState) return null
  return buildRelationMatrix({
    filters: matrixFilters.value,
    nodes: currentState.nodes.filter(node => !node._isDeleted),
    links: currentState.links.filter(link => !link._isDeleted),
    nodeTypes: currentState.nodeTypes,
    linkTypes: currentState.linkTypes,
    components: currentState.components,
    relations: currentState.relations,
    notations: currentState.notations,
    labels: {
      unmapped: t("models.relationMatrixUnmapped"),
      unknownRelation: t("models.relationMatrixUnknownRelation"),
    },
  })
})

const selectedCell = computed(() => {
  if (!matrix.value || !selectedCellKey.value) return null
  return matrix.value.cells[selectedCellKey.value] ?? null
})

const rowCounts = computed<Record<string, number>>(() => {
  const matrixValue = matrix.value
  if (!matrixValue) return {}
  const counts: Record<string, number> = {}
  for (const cell of Object.values(matrixValue.cells)) {
    counts[cell.rowId] = (counts[cell.rowId] ?? 0) + cell.total
  }
  return counts
})

const columnCounts = computed<Record<string, number>>(() => {
  const matrixValue = matrix.value
  if (!matrixValue) return {}
  const counts: Record<string, number> = {}
  for (const cell of Object.values(matrixValue.cells)) {
    counts[cell.columnId] = (counts[cell.columnId] ?? 0) + cell.total
  }
  return counts
})

const rowNameById = computed(() => new Map(matrix.value?.rows.map(item => [item.id, item.name]) ?? []))
const columnNameById = computed(() => new Map(matrix.value?.columns.map(item => [item.id, item.name]) ?? []))

const selectedRowName = computed(() => {
  const cell = selectedCell.value
  return cell ? rowNameById.value.get(cell.rowId) ?? cell.rowId : ""
})

const selectedColumnName = computed(() => {
  const cell = selectedCell.value
  return cell ? columnNameById.value.get(cell.columnId) ?? cell.columnId : ""
})

const formatPropertyValue = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return t("models.relationMatrixValueEmpty")
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

const collectPropertyStats = (
  nodeIds: string[],
  resolveProperties: (nodeId: string) => Record<string, unknown>
): Array<{ key: string; values: Array<{ label: string; count: number }> }> => {
  const byKey = new Map<string, Map<string, number>>()
  for (const nodeId of nodeIds) {
    const props = resolveProperties(nodeId)
    for (const [key, rawValue] of Object.entries(props)) {
      const value = formatPropertyValue(rawValue)
      const valueMap = byKey.get(key) ?? new Map<string, number>()
      valueMap.set(value, (valueMap.get(value) ?? 0) + 1)
      byKey.set(key, valueMap)
    }
  }
  return Array.from(byKey.entries())
    .map(([key, valuesMap]) => ({
      key,
      values: Array.from(valuesMap.entries())
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, undefined, { sensitivity: "base" })),
    }))
    .sort((a, b) => a.key.localeCompare(b.key, undefined, { sensitivity: "base" }))
}

const verticalInfo = computed(() => {
  const cell = selectedCell.value
  const currentState = state.value
  if (!cell || !currentState) return null

  const sourceNodeIds = Array.from(new Set(cell.items.map(item => item.sourceNodeId)))
  const rowId = cell.rowId
  const notationId = matrixFilters.value.notationId

  const component = currentState.components.find(item => item.id === rowId)
  const nodeType = component
    ? currentState.nodeTypes.find(item => item.id === component.nodeTypeId)
    : currentState.nodeTypes.find(item => item.id === rowId)

  const properties = collectPropertyStats(sourceNodeIds, nodeId => {
    const node = currentState.nodes.find(item => item.id === nodeId)
    if (!node) return {}
    if (notationId && rowId !== UNMAPPED_ENTITY_ID) {
      return node.parsedAttrs.componentProperties[notationId]?.[rowId] ?? {}
    }
    return node.parsedAttrs.typeProperties ?? {}
  })

  return {
    title: t("models.relationMatrixVerticalInfoTitle"),
    name: selectedRowName.value,
    id: rowId,
    nodeTypeName: nodeType?.name ?? null,
    nodesCount: sourceNodeIds.length,
    properties,
  }
})

const horizontalInfo = computed(() => {
  const cell = selectedCell.value
  const currentState = state.value
  if (!cell || !currentState) return null

  const targetNodeIds = Array.from(new Set(cell.items.map(item => item.targetNodeId)))
  const columnId = cell.columnId
  const notationId = matrixFilters.value.notationId

  const component = currentState.components.find(item => item.id === columnId)
  const nodeType = component
    ? currentState.nodeTypes.find(item => item.id === component.nodeTypeId)
    : currentState.nodeTypes.find(item => item.id === columnId)

  const properties = collectPropertyStats(targetNodeIds, nodeId => {
    const node = currentState.nodes.find(item => item.id === nodeId)
    if (!node) return {}
    if (notationId && columnId !== UNMAPPED_ENTITY_ID) {
      return node.parsedAttrs.componentProperties[notationId]?.[columnId] ?? {}
    }
    return node.parsedAttrs.typeProperties ?? {}
  })

  return {
    title: t("models.relationMatrixHorizontalInfoTitle"),
    name: selectedColumnName.value,
    id: columnId,
    nodeTypeName: nodeType?.name ?? null,
    nodesCount: targetNodeIds.length,
    properties,
  }
})

const diagramsByLinkId = computed(() => {
  const currentState = state.value
  const map = new Map<string, Array<{ id: string; name: string; version: string }>>()
  if (!currentState) return map
  for (const diagram of currentState.diagrams) {
    if (diagram._isDeleted) continue
    for (const edge of diagram.parsedAttrs.instances.edges) {
      const list = map.get(edge.modelLinkId) ?? []
      list.push({ id: diagram.id, name: diagram.name, version: diagram.version })
      map.set(edge.modelLinkId, list)
    }
  }
  return map
})

const selectedLinkDetails = computed(() => {
  const cell = selectedCell.value
  const currentState = state.value
  if (!cell || !currentState) return []

  const linkById = new Map(currentState.links.map(link => [link.id, link]))
  const notationId = matrixFilters.value.notationId

  return cell.items.map(item => {
    const link = linkById.get(item.linkId)
    const customPropertiesRaw =
      notationId && link
        ? (link.parsedAttrs.relationProperties[notationId]?.[item.relationId] ?? {})
        : {}
    const customProperties = Object.entries(customPropertiesRaw).map(([key, value]) => ({
      key,
      value: formatPropertyValue(value),
    }))

    const usedInDiagrams = diagramsByLinkId.value.get(item.linkId) ?? []
    return {
      ...item,
      customProperties,
      usedInDiagrams,
    }
  })
})

const selectedNotationName = computed(() => {
  const notationId = matrixFilters.value.notationId
  if (!notationId || !state.value) return ""
  const notation = state.value.notations.find(item => item.id === notationId)
  if (notation) return `${notation.name} ${notation.version}`
  const fallback = fallbackNotationMetaById.value[notationId]
  if (fallback) return `${fallback.name} ${fallback.version}`
  return `${t("models.relationMatrixNotationFallbackPrefix")} ${notationId.slice(0, 8)}`
})

const notationOptions = computed(() => {
  const currentState = state.value
  if (!currentState) return []
  const notationById = new Map(currentState.notations.map(item => [item.id, item]))
  const usedNotationIds = Array.from(
    new Set(
      currentState.diagrams
        .filter(diagram => !diagram._isDeleted)
        .map(diagram => diagram.notationId)
        .filter(id => !!id)
    )
  )
  return usedNotationIds
    .map(notationId => {
      const known = notationById.get(notationId)
      if (known) {
        return { id: notationId, label: `${known.name} ${known.version}` }
      }
      const fallback = fallbackNotationMetaById.value[notationId]
      if (fallback) {
        return { id: notationId, label: `${fallback.name} ${fallback.version}` }
      }
      return { id: notationId, label: `${t("models.relationMatrixNotationFallbackPrefix")} ${notationId.slice(0, 8)}` }
    })
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }))
})

const sanitizeFileName = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9а-яё_-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")

const exportFilenameBase = computed(() => {
  const modelName = model.value?.name ?? "model"
  const suffix = matrixFilters.value.notationId ? "notation" : "types"
  return `${sanitizeFileName(modelName) || "model"}-relation-matrix-${suffix}`
})

const handleSelectCell = (rowId: string, columnId: string): void => {
  selectedCellKey.value = relationMatrixCellKey(rowId, columnId)
  selectedRowId.value = rowId
  selectedColumnId.value = columnId
}

const handleSelectRow = (rowId: string): void => {
  selectedRowId.value = selectedRowId.value === rowId ? null : rowId
}

const handleSelectColumn = (columnId: string): void => {
  selectedColumnId.value = selectedColumnId.value === columnId ? null : columnId
}

const handleOpenNode = (_nodeId: string): void => {
  router.push({
    name: "model-editor",
    params: { id: modelId.value },
  })
}

const handleOpenDiagram = (diagramId: string): void => {
  router.push({
    name: "model-editor",
    params: { id: modelId.value },
    query: { diagramId },
  })
}

const exportCsvLong = (): void => {
  if (!matrix.value) return
  downloadRelationMatrixCsv({
    matrix: matrix.value,
    format: "long",
    filenameBase: exportFilenameBase.value,
    notationId: matrixFilters.value.notationId,
    notationName: selectedNotationName.value,
  })
}

const exportCsvWide = (): void => {
  if (!matrix.value) return
  downloadRelationMatrixCsv({
    matrix: matrix.value,
    format: "wide",
    filenameBase: exportFilenameBase.value,
    notationId: matrixFilters.value.notationId,
    notationName: selectedNotationName.value,
  })
}

const exportPng = async (): Promise<void> => {
  if (!matrix.value) return
  await exportRelationMatrixPng({
    matrix: matrix.value,
    filenameBase: exportFilenameBase.value,
    title: t("models.relationMatrixTitle"),
    heatmapEnabled: matrixFilters.value.heatmapEnabled,
    axesLabel: t("models.relationMatrixAxesLabel"),
  })
}

watch(
  () => modelId.value,
  value => {
    if (value) void load(value)
  },
  { immediate: true }
)

watch(
  () => state.value,
  async currentState => {
    if (!currentState) {
      fallbackNotationMetaById.value = {}
      return
    }
    const usedNotationIds = Array.from(
      new Set(
        currentState.diagrams
          .filter(diagram => !diagram._isDeleted)
          .map(diagram => diagram.notationId)
          .filter(id => !!id)
      )
    )
    const knownIds = new Set(currentState.notations.map(item => item.id))
    const missingIds = usedNotationIds.filter(id => !knownIds.has(id))
    if (missingIds.length === 0) {
      fallbackNotationMetaById.value = {}
      return
    }

    const token = ++notationMetaRequestToken
    const entries = await Promise.all(
      missingIds.map(async notationId => {
        const metaPath = `/notations/${notationId}/meta?modelId=${encodeURIComponent(currentState.modelId)}`
        const result = await apiGet<NotationMetaResponse>(metaPath)
        if (!result.success) return null
        return [notationId, result.data] as const
      })
    )
    if (token !== notationMetaRequestToken) return
    fallbackNotationMetaById.value = Object.fromEntries(
      entries.filter((entry): entry is readonly [string, NotationMetaResponse] => !!entry)
    )
  },
  { immediate: true }
)

watch(
  () => matrixFilters.value.notationId,
  () => {
    selectedCellKey.value = null
    selectedRowId.value = null
    selectedColumnId.value = null
    matrixFilters.value.selectedRelationIds = []
    relationSelectionInitialized.value = false
  }
)

watch(
  () => matrix.value,
  matrixValue => {
    if (!matrixValue) return
    if (!relationSelectionInitialized.value && matrixValue.relationOptions.length > 0) {
      matrixFilters.value.selectedRelationIds = matrixValue.relationOptions.map(item => item.id)
      relationSelectionInitialized.value = true
      return
    }
    const rowIds = new Set(matrixValue.rowOptions.map(item => item.id))
    const columnIds = new Set(matrixValue.columnOptions.map(item => item.id))
    const relationIds = new Set(matrixValue.relationOptions.map(item => item.id))
    const nextRows = matrixFilters.value.selectedRowIds.filter(id => rowIds.has(id))
    const nextColumns = matrixFilters.value.selectedColumnIds.filter(id => columnIds.has(id))
    const nextRelations = matrixFilters.value.selectedRelationIds.filter(id => relationIds.has(id))
    if (nextRows.join("|") !== matrixFilters.value.selectedRowIds.join("|")) {
      matrixFilters.value.selectedRowIds = nextRows
    }
    if (nextColumns.join("|") !== matrixFilters.value.selectedColumnIds.join("|")) {
      matrixFilters.value.selectedColumnIds = nextColumns
    }
    if (nextRelations.join("|") !== matrixFilters.value.selectedRelationIds.join("|")) {
      matrixFilters.value.selectedRelationIds = nextRelations
    }
    if (selectedRowId.value && !rowIds.has(selectedRowId.value)) {
      selectedRowId.value = null
    }
    if (selectedColumnId.value && !columnIds.has(selectedColumnId.value)) {
      selectedColumnId.value = null
    }
  }
)
</script>

<template>
  <MainLayout>
    <template #header>
      <AppHeader />
    </template>
    <template #default>
      <div class="relation-matrix">
        <div class="relation-matrix__topbar">
          <button
            class="relation-matrix__back"
            type="button"
            :title="t('toolbar.backToModels')"
            @click="router.push({ name: 'model-editor', params: { id: modelId } })"
          >
            <UiIcon name="arrow_back" />
          </button>
          <div class="relation-matrix__titles">
            <h1 class="relation-matrix__title">{{ t("models.relationMatrixTitle") }}</h1>
            <p class="relation-matrix__subtitle">{{ model?.name }} {{ model?.version }}</p>
          </div>
          <div class="relation-matrix__actions">
            <button
              type="button"
              class="relation-matrix__action-btn"
              :title="t('models.relationMatrixExportCsvLong')"
              @click="exportCsvLong"
            >
              <UiIcon name="description" />
            </button>
            <button
              type="button"
              class="relation-matrix__action-btn"
              :title="t('models.relationMatrixExportCsvWide')"
              @click="exportCsvWide"
            >
              <UiIcon name="table_view" />
            </button>
            <button
              type="button"
              class="relation-matrix__action-btn"
              :title="t('models.relationMatrixExportPng')"
              @click="exportPng"
            >
              <UiIcon name="image" />
            </button>
          </div>
        </div>

        <p v-if="error" class="relation-matrix__error">{{ error }}</p>
        <p v-else-if="loading" class="relation-matrix__loading">{{ t("common.loading") }}</p>
        <template v-else-if="matrix">
          <ResizablePanelLayout
            storage-key="warchi:model-relation-matrix:workspace"
            :default-left-width="320"
            :default-right-width="360"
            :left-resizer-title="t('models.resizeLeftPanelWidth')"
            :right-resizer-title="t('models.resizeRightPanelWidth')"
            :collapse-left-title="t('models.hideLeftPanel')"
            :expand-left-title="t('models.showLeftPanel')"
            :collapse-right-title="t('models.hideRightPanel')"
            :expand-right-title="t('models.showRightPanel')"
          >
            <template #left>
              <RelationMatrixFilters
                :notation-options="notationOptions"
                :notation-id="matrixFilters.notationId"
                :row-options="matrix.rowOptions"
                :column-options="matrix.columnOptions"
                :relation-options="matrix.relationOptions"
                :row-counts="rowCounts"
                :column-counts="columnCounts"
                :selected-row-ids="matrixFilters.selectedRowIds"
                :selected-column-ids="matrixFilters.selectedColumnIds"
                :selected-relation-ids="matrixFilters.selectedRelationIds"
                :mapped-only="matrixFilters.mappedOnly"
                :heatmap-enabled="matrixFilters.heatmapEnabled"
                :hide-empty-axes="matrixFilters.hideEmptyAxes"
                @update:notation-id="matrixFilters.notationId = $event"
                @update:selected-row-ids="matrixFilters.selectedRowIds = $event"
                @update:selected-column-ids="matrixFilters.selectedColumnIds = $event"
                @update:selected-relation-ids="matrixFilters.selectedRelationIds = $event"
                @update:mapped-only="matrixFilters.mappedOnly = $event"
                @update:heatmap-enabled="matrixFilters.heatmapEnabled = $event"
                @update:hide-empty-axes="matrixFilters.hideEmptyAxes = $event"
              />
            </template>
            <RelationMatrixGrid
              class="relation-matrix__grid"
              :matrix="matrix"
              :selected-cell-key="selectedCellKey"
              :selected-row-id="selectedRowId"
              :selected-column-id="selectedColumnId"
              :heatmap-enabled="matrixFilters.heatmapEnabled"
              @select="handleSelectCell"
              @select-row="handleSelectRow"
              @select-column="handleSelectColumn"
            />
            <template #right>
              <RelationMatrixDetailsPanel
                class="relation-matrix__details"
                :cell="selectedCell"
                :row-name="selectedRowName"
                :column-name="selectedColumnName"
                :vertical-info="verticalInfo"
                :horizontal-info="horizontalInfo"
                :link-details="selectedLinkDetails"
                @open-node="handleOpenNode"
                @open-diagram="handleOpenDiagram"
              />
            </template>
          </ResizablePanelLayout>
        </template>
      </div>
    </template>
    <template #footer>
      <AppFooter />
    </template>
  </MainLayout>
</template>

<style scoped>
.relation-matrix {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--base-bg);
}

.relation-matrix__topbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}

.relation-matrix__back {
  width: 34px;
  height: 34px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text-muted);
  cursor: pointer;
}

.relation-matrix__titles {
  min-width: 0;
}

.relation-matrix__actions {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.relation-matrix__action-btn {
  width: 34px;
  height: 34px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text-muted);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;
}

.relation-matrix__action-btn:hover {
  color: var(--primary);
  border-color: var(--primary);
  background: var(--primary-soft);
}

.relation-matrix__title {
  margin: 0;
  font-size: 16px;
}

.relation-matrix__subtitle {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--text-subtle);
}

.relation-matrix__error,
.relation-matrix__loading {
  margin: 0;
  padding: 14px 16px;
  color: var(--text-muted);
}

.relation-matrix__error {
  color: var(--danger);
}

.relation-matrix__grid {
  flex: 1;
  min-width: 0;
  min-height: 0;
}

.relation-matrix__details {
  height: 100%;
}

.relation-matrix :deep(.rpl-wrapper) {
  flex: 1;
  min-height: 0;
}
</style>
