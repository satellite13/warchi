<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import { useI18n } from "vue-i18n"
import { apiGet } from "@/composables/useApi"
import { listParams } from '@/api/queryHelpers'
import type { ModelData, PaginatedResponse } from "@/types/entities"
import type {
  DiagramResponse,
  LinkResponse,
  LinkTypeResponse,
  NodeResponse,
  NodeTypeResponse,
} from "@/types/api"
import { type CompareSharedData, loadCompareSharedData } from "@/api/loadCompareSharedData"
import { useResizablePropsPanel } from "@/composables/useResizablePropsPanel"
import MainLayout from "@/layouts/MainLayout.vue"
import AppHeader from "@/components/layout/AppHeader.vue"
import AppFooter from "@/components/layout/AppFooter.vue"
import ModelDiagramCanvas from "@/features/models/components/ModelDiagramCanvas.vue"
import { compareVersions } from "@/utils/version"
import { paginatedContent } from "@/utils/paginatedResponse"
import {
  type SelectedElement,
  toEditorDiagram,
  useComparisonDiff,
} from "@/features/models/composables/useComparisonDiff"

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const modelId = computed(() => route.params.id as string)

const relatedVersions = ref<ModelData[]>([])
const leftVersionId = ref<string>("")
const rightVersionId = ref<string>("")
const diagramName = ref<string>("")

const leftData = ref<{
  nodes: NodeResponse[]
  links: LinkResponse[]
  diagrams: DiagramResponse[]
  nodeTypes: NodeTypeResponse[]
  linkTypes: LinkTypeResponse[]
} | null>(null)
const rightData = ref<{
  nodes: NodeResponse[]
  links: LinkResponse[]
  diagrams: DiagramResponse[]
  nodeTypes: NodeTypeResponse[]
  linkTypes: LinkTypeResponse[]
} | null>(null)
const sharedData = ref<CompareSharedData | null>(null)

const loading = ref(false)
const error = ref<string | null>(null)

/** Какая сторона считается базой (без подсветки); вторая сторона показывает изменения. */
const baseSide = ref<"left" | "right">("left")

const leftCanvasRef = ref<InstanceType<typeof ModelDiagramCanvas> | null>(null)
const rightCanvasRef = ref<InstanceType<typeof ModelDiagramCanvas> | null>(null)

const { propsPanelHeight, startPropsPanelResize } = useResizablePropsPanel(
  "warchi:model-visual-compare:props-panel-height",
)

const selectedElement = ref<SelectedElement | null>(null)

async function loadRelatedVersions(): Promise<void> {
  const id = modelId.value
  if (!id) return
  loading.value = true
  error.value = null
  try {
    const res = await apiGet<PaginatedResponse<ModelData>>(`/models/${id}/related-versions`)
    if (res.success) {
      const versions = paginatedContent(res.data)
      relatedVersions.value = versions
      if (versions.length >= 2 && !leftVersionId.value && !rightVersionId.value) {
        leftVersionId.value = versions[versions.length - 1]!.id
        rightVersionId.value = versions[0]!.id
      }
    } else {
      relatedVersions.value = []
      error.value = res.error.message
    }
  } catch (e) {
    relatedVersions.value = []
    error.value = e instanceof Error ? e.message : "Ошибка загрузки"
  } finally {
    loading.value = false
  }
}

async function loadVersionData(versionId: string): Promise<{
  nodes: NodeResponse[]
  links: LinkResponse[]
  diagrams: DiagramResponse[]
  nodeTypes: NodeTypeResponse[]
  linkTypes: LinkTypeResponse[]
} | null> {
  const listQuery = listParams()
  const [nodesRes, linksRes, diagramsRes, nodeTypesRes, linkTypesRes] =
    await Promise.all([
      apiGet<PaginatedResponse<NodeResponse>>(
        `/nodes?modelId=${encodeURIComponent(versionId)}&${listQuery.toString()}`
      ),
      apiGet<PaginatedResponse<LinkResponse>>(
        `/links?modelId=${encodeURIComponent(versionId)}&${listQuery.toString()}`
      ),
      apiGet<PaginatedResponse<DiagramResponse>>(
        `/diagrams?modelId=${encodeURIComponent(versionId)}&${listQuery.toString()}`
      ),
      apiGet<PaginatedResponse<NodeTypeResponse>>(
        `/node-types?modelId=${encodeURIComponent(versionId)}&${listQuery.toString()}`
      ),
      apiGet<PaginatedResponse<LinkTypeResponse>>(
        `/link-types?modelId=${encodeURIComponent(versionId)}&${listQuery.toString()}`
      ),
    ])
  if (!nodesRes.success || !linksRes.success || !diagramsRes.success) return null
  return {
    nodes: nodesRes.data.content ?? [],
    links: linksRes.data.content ?? [],
    diagrams: diagramsRes.data.content ?? [],
    nodeTypes: nodeTypesRes.success ? nodeTypesRes.data.content ?? [] : [],
    linkTypes: linkTypesRes.success ? linkTypesRes.data.content ?? [] : [],
  }
}

async function loadSharedData(): Promise<void> {
  sharedData.value = await loadCompareSharedData()
}

async function loadBothVersions(): Promise<void> {
  const leftId = leftVersionId.value
  const rightId = rightVersionId.value
  if (!leftId || !rightId || leftId === rightId) {
    leftData.value = null
    rightData.value = null
    return
  }
  loading.value = true
  error.value = null
  try {
    const [left, right] = await Promise.all([
      loadVersionData(leftId),
      loadVersionData(rightId),
    ])
    leftData.value = left
    rightData.value = right
    if (left?.diagrams.length && !diagramName.value) {
      diagramName.value = left.diagrams[0]!.name
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Ошибка загрузки"
  } finally {
    loading.value = false
  }
}

/** Выбирает диаграмму с именем name с максимальной версией (как в редакторе модели). */
function getLatestDiagramByName(
  diagrams: DiagramResponse[],
  name: string
): DiagramResponse | undefined {
  const sameName = diagrams.filter((d) => d.name.trim() === name.trim())
  if (sameName.length === 0) return undefined
  return [...sameName].sort((a, b) => compareVersions(b.version, a.version))[0]
}

const diagramNames = computed(() => {
  const names = new Set<string>()
  leftData.value?.diagrams.forEach((d) => names.add(d.name))
  rightData.value?.diagrams.forEach((d) => names.add(d.name))
  return Array.from(names).sort()
})

const leftDiagram = computed(() => {
  const list = leftData.value?.diagrams ?? []
  const d = getLatestDiagramByName(list, diagramName.value)
  return d ? toEditorDiagram(d) : null
})

const rightDiagram = computed(() => {
  const list = rightData.value?.diagrams ?? []
  const d = getLatestDiagramByName(list, diagramName.value)
  return d ? toEditorDiagram(d) : null
})

const {
  leftEditorNodes,
  leftEditorLinks,
  rightEditorNodes,
  rightEditorLinks,
  leftCanvasDiffState,
  rightCanvasDiffState,
  handleToggleBaseSide,
  handleLeftSelectNodes,
  handleLeftSelectLink,
  handleLeftSelectEdgeInstanceId,
  handleRightSelectNodes,
  handleRightSelectLink,
  handleRightSelectEdgeInstanceId,
  selectedPropertyRows,
  selectedElementDiffKind,
  comparePropWasLabel,
  comparePropBecameLabel,
  isLeftBaseForProps,
  selectedElementLabel,
} = useComparisonDiff({
  leftData,
  rightData,
  leftDiagram,
  rightDiagram,
  sharedData,
  baseSide,
  selectedElement,
})

function handleBack(): void {
  router.push({ name: "model-editor", params: { id: modelId.value } })
}

watch(
  [modelId, leftVersionId, rightVersionId],
  () => {
    if (modelId.value) void loadRelatedVersions()
    if (leftVersionId.value && rightVersionId.value) void loadBothVersions()
  },
  { immediate: true }
)

watch(
  () => modelId.value,
  () => void loadSharedData(),
  { immediate: true }
)

function centerBothCanvases(): void {
  nextTick(() => {
    requestAnimationFrame(() => {
      leftCanvasRef.value?.fitToView()
      rightCanvasRef.value?.fitToView()
    })
  })
}

watch(
  [() => leftDiagram.value, () => rightDiagram.value, diagramName],
  () => {
    if (leftDiagram.value && rightDiagram.value) centerBothCanvases()
  },
  { immediate: true }
)
</script>

<template>
  <MainLayout>
    <template #header>
      <AppHeader />
    </template>
    <template #default>
      <div class="vc">
        <!-- Top bar -->
        <div class="vc__topbar">
          <button
            type="button"
            class="vc__back"
            :title="t('toolbar.backToModels')"
            @click="handleBack"
          >
            <UiIcon name="arrow_back" />
          </button>

          <div class="vc__selectors">
            <div class="vc__version-pick">
              <span class="vc__pick-label">{{ t('models.compareVersionLeft') }}</span>
              <select v-model="leftVersionId" class="vc__pick-select" :disabled="loading">
                <option value="">{{ t('models.compareSelectVersion') }}</option>
                <option
                  v-for="v in relatedVersions"
                  :key="v.id"
                  :value="v.id"
                  :disabled="v.id === rightVersionId"
                >
                  {{ v.name }} {{ v.version }}
                </option>
              </select>
            </div>

            <button
              type="button"
              class="vc__swap"
              :disabled="!leftVersionId || !rightVersionId || loading"
              :title="t('models.compareToggleBase')"
              @click="handleToggleBaseSide"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M5 3L2 6L5 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M2 6H14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                <path d="M13 15L16 12L13 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M16 12H4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </button>

            <div class="vc__version-pick">
              <span class="vc__pick-label">{{ t('models.compareVersionRight') }}</span>
              <select v-model="rightVersionId" class="vc__pick-select" :disabled="loading">
                <option value="">{{ t('models.compareSelectVersion') }}</option>
                <option
                  v-for="v in relatedVersions"
                  :key="v.id"
                  :value="v.id"
                  :disabled="v.id === leftVersionId"
                >
                  {{ v.name }} {{ v.version }}
                </option>
              </select>
            </div>
          </div>

          <div class="vc__diagram-pick">
            <span class="vc__pick-label">{{ t('models.compareDiagramName') }}</span>
            <select v-model="diagramName" class="vc__pick-select">
              <option v-for="name in diagramNames" :key="name" :value="name">{{ name }}</option>
            </select>
          </div>
        </div>

        <p v-if="error" class="vc__error">{{ error }}</p>

        <!-- Canvas area -->
        <div v-else class="vc__body">
          <div class="vc__panels">
            <!-- Left panel -->
            <div
              class="vc__panel"
              :class="baseSide === 'left' ? 'vc__panel--base' : 'vc__panel--changes'"
            >
              <div class="vc__panel-header">
                <span class="vc__panel-side">{{ t('models.compareVersionLeft') }}</span>
                <span
                  class="vc__role-badge"
                  :class="baseSide === 'left' ? 'vc__role-badge--base' : 'vc__role-badge--changes'"
                >
                  {{ baseSide === 'left' ? t('models.compareBaseLabel') : t('models.compareChangesLabel') }}
                </span>
              </div>
              <div class="vc__canvas-area">
                <ModelDiagramCanvas
                  ref="leftCanvasRef"
                  v-if="leftDiagram && sharedData"
                  :active-diagram="leftDiagram"
                  :nodes="leftEditorNodes"
                  :links="leftEditorLinks"
                  :relations="sharedData.relations"
                  :components="sharedData.components"
                  :node-types="leftData?.nodeTypes ?? []"
                  :relation-rules="sharedData.relationRules"
                  :selected-model-node-ids="[]"
                  :selected-model-link-id="null"
                  :grid-visible="true"
                  :mini-map-visible="false"
                  :palette-visible="false"
                  :read-only="true"
                  :diff-state-by-model-node-id="leftCanvasDiffState.diffStateByModelNodeId"
                  :diff-state-by-model-link-id="leftCanvasDiffState.diffStateByModelLinkId"
                  :diff-state-by-edge-instance-id="leftCanvasDiffState.diffStateByEdgeInstanceId"
                  @select-nodes="handleLeftSelectNodes"
                  @select-link="handleLeftSelectLink"
                  @select-edge-instance-id="handleLeftSelectEdgeInstanceId"
                />
                <div v-else class="vc__placeholder">
                  {{ leftDiagram ? t('common.loading') : t('models.compareNoDiagram') }}
                </div>
              </div>
            </div>

            <!-- Divider -->
            <div class="vc__divider" />

            <!-- Right panel -->
            <div
              class="vc__panel"
              :class="baseSide === 'right' ? 'vc__panel--base' : 'vc__panel--changes'"
            >
              <div class="vc__panel-header">
                <span class="vc__panel-side">{{ t('models.compareVersionRight') }}</span>
                <span
                  class="vc__role-badge"
                  :class="baseSide === 'right' ? 'vc__role-badge--base' : 'vc__role-badge--changes'"
                >
                  {{ baseSide === 'right' ? t('models.compareBaseLabel') : t('models.compareChangesLabel') }}
                </span>
              </div>
              <div class="vc__canvas-area">
                <ModelDiagramCanvas
                  ref="rightCanvasRef"
                  v-if="rightDiagram && sharedData"
                  :active-diagram="rightDiagram"
                  :nodes="rightEditorNodes"
                  :links="rightEditorLinks"
                  :relations="sharedData.relations"
                  :components="sharedData.components"
                  :node-types="rightData?.nodeTypes ?? []"
                  :relation-rules="sharedData.relationRules"
                  :selected-model-node-ids="[]"
                  :selected-model-link-id="null"
                  :grid-visible="true"
                  :mini-map-visible="false"
                  :palette-visible="false"
                  :read-only="true"
                  :diff-state-by-model-node-id="rightCanvasDiffState.diffStateByModelNodeId"
                  :diff-state-by-model-link-id="rightCanvasDiffState.diffStateByModelLinkId"
                  :diff-state-by-edge-instance-id="rightCanvasDiffState.diffStateByEdgeInstanceId"
                  @select-nodes="handleRightSelectNodes"
                  @select-link="handleRightSelectLink"
                  @select-edge-instance-id="handleRightSelectEdgeInstanceId"
                />
                <div v-else class="vc__placeholder">
                  {{ rightDiagram ? t('common.loading') : t('models.compareNoDiagram') }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Properties panel -->
        <div
          v-if="selectedElementLabel"
          class="vc__resizer"
          role="separator"
          aria-orientation="horizontal"
          :title="t('models.resizePropertiesPanelHeight')"
          @mousedown.prevent="startPropsPanelResize"
        >
          <span class="vc__resizer-grip" />
        </div>
        <div
          v-if="selectedElementLabel"
          class="vc__props"
          :style="{ height: propsPanelHeight + 'px' }"
        >
          <div class="vc__props-header">
            <span class="vc__props-label">{{ t('models.compareSelectedElement') }}</span>
            <span class="vc__props-element">{{ selectedElementLabel }}</span>
          </div>
          <div class="vc__props-scroll">
            <table class="vc__table">
              <thead>
                <tr>
                  <th>{{ t('models.comparePropName') }}</th>
                  <th>{{ isLeftBaseForProps ? comparePropWasLabel : comparePropBecameLabel }}</th>
                  <th>{{ isLeftBaseForProps ? comparePropBecameLabel : comparePropWasLabel }}</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in selectedPropertyRows"
                  :key="row.key"
                  :class="{ 'vc__row--diff': row.changed }"
                >
                  <td class="vc__cell-key">{{ row.key }}</td>
                  <td
                    :class="
                      row.changed
                        ? selectedElementDiffKind === 'modified'
                          ? 'vc__cell--modified'
                          : (isLeftBaseForProps ? 'vc__cell--old' : 'vc__cell--new')
                        : ''
                    "
                  >
                    {{ isLeftBaseForProps ? row.base : row.target }}
                  </td>
                  <td
                    :class="
                      row.changed
                        ? selectedElementDiffKind === 'modified'
                          ? 'vc__cell--modified'
                          : (isLeftBaseForProps ? 'vc__cell--new' : 'vc__cell--old')
                        : ''
                    "
                  >
                    {{ isLeftBaseForProps ? row.target : row.base }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </template>
    <template #footer>
      <AppFooter />
    </template>
  </MainLayout>
</template>

<style scoped>
/* ── Layout ── */
.vc {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--base-bg);
}

/* ── Top bar ── */
.vc__topbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}

.vc__back {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
}
.vc__back:hover {
  color: var(--primary);
  border-color: var(--primary);
  background: var(--primary-soft);
  box-shadow: var(--shadow-glow);
}

.vc__selectors {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.vc__version-pick,
.vc__diagram-pick {
  display: flex;
  align-items: center;
  gap: 6px;
}

.vc__pick-label {
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-subtle);
  white-space: nowrap;
}

.vc__pick-select {
  height: 32px;
  padding: 0 28px 0 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-muted);
  color: var(--base-text);
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: border-color 0.15s ease;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%239a9a9a' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
}
.vc__pick-select:hover {
  border-color: var(--border-strong);
}
.vc__pick-select:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 2px var(--primary-soft);
}

.vc__swap {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;
}
.vc__swap:hover:not(:disabled) {
  color: var(--primary);
  border-color: var(--primary);
  background: var(--primary-soft);
  transform: rotate(180deg);
}
.vc__swap:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.vc__error {
  padding: 16px;
  color: var(--danger);
  margin: 0;
  font-size: 13px;
}

/* ── Canvas area ── */
.vc__body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.vc__panels {
  display: flex;
  flex: 1;
  min-height: 0;
}

.vc__panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  transition: border-color 0.25s ease;
}

.vc__panel--base {
  border-top: 2px solid var(--border);
}
.vc__panel--changes {
  border-top: 2px solid var(--primary);
}

.vc__divider {
  width: 1px;
  background: var(--border);
  flex-shrink: 0;
  position: relative;
}
.vc__divider::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 7px;
  height: 40px;
  border-radius: 4px;
  background: var(--border);
  opacity: 0;
  transition: opacity 0.2s ease;
}
.vc__panels:hover .vc__divider::before {
  opacity: 1;
}

.vc__panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  background: var(--surface-muted);
  border-bottom: 1px solid var(--border);
}

.vc__panel-side {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-subtle);
}

.vc__role-badge {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 2px 8px;
  border-radius: 6px;
  transition: all 0.25s ease;
}
.vc__role-badge--base {
  background: var(--surface-strong);
  color: var(--text-muted);
}
.vc__role-badge--changes {
  background: var(--primary);
  color: #fff;
  box-shadow: 0 1px 4px rgba(124, 92, 252, 0.25);
}

.vc__canvas-area {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.vc__placeholder {
  flex: 1;
  display: grid;
  place-items: center;
  color: var(--text-subtle);
  font-size: 13px;
  background:
    radial-gradient(circle at 50% 50%, var(--surface-muted) 0%, transparent 70%),
    repeating-linear-gradient(
      0deg,
      transparent,
      transparent 19px,
      var(--border) 19px,
      var(--border) 20px
    ),
    repeating-linear-gradient(
      90deg,
      transparent,
      transparent 19px,
      var(--border) 19px,
      var(--border) 20px
    );
  background-size: 100% 100%, 20px 20px, 20px 20px;
  opacity: 0.7;
}

/* ── Resizer ── */
.vc__resizer {
  flex-shrink: 0;
  height: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: row-resize;
  background: var(--surface);
  border-top: 1px solid var(--border);
  transition: background 0.15s ease;
}
.vc__resizer:hover {
  background: var(--primary-soft);
}

.vc__resizer-grip {
  width: 36px;
  height: 3px;
  border-radius: 2px;
  background: var(--border-strong);
  transition: all 0.15s ease;
}
.vc__resizer:hover .vc__resizer-grip {
  background: var(--primary);
  width: 48px;
}

/* ── Properties panel ── */
.vc__props {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border-top: 1px solid var(--border);
  overflow: hidden;
}

.vc__props-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.vc__props-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-subtle);
}

.vc__props-element {
  font-size: 13px;
  font-weight: 500;
  color: var(--base-text);
  font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
}

.vc__props-scroll {
  flex: 1;
  overflow: auto;
}

.vc__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.vc__table th {
  padding: 6px 12px;
  text-align: left;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-subtle);
  background: var(--surface-muted);
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  z-index: 1;
}

.vc__table td {
  padding: 5px 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
}

.vc__table tbody tr:hover {
  background: var(--surface-muted);
}

.vc__cell-key {
  font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
  font-size: 11px;
  color: var(--text-muted);
}

.vc__row--diff {
  background: color-mix(in srgb, var(--warning) 4%, transparent);
}
.vc__row--diff:hover {
  background: color-mix(in srgb, var(--warning) 8%, transparent) !important;
}

.vc__cell--old {
  color: var(--danger);
  background: var(--danger-soft);
  font-weight: 500;
}

.vc__cell--new {
  color: var(--success);
  background: var(--success-soft);
  font-weight: 500;
}

.vc__cell--modified {
  color: var(--warning);
  background: color-mix(in srgb, var(--warning) 16%, transparent);
  font-weight: 500;
}
</style>
