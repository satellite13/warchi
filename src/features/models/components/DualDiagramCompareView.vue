<script setup lang="ts">
import { computed, nextTick, ref, toRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ViewportState } from '@ngroznykh/papirus'
import type { CompareSharedData } from '@/api/loadCompareSharedData'
import { useResizablePropsPanel } from '@/composables/useResizablePropsPanel'
import MainLayout from '@/layouts/MainLayout.vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppFooter from '@/components/layout/AppFooter.vue'
import UiIcon from '@/components/ui/UiIcon.vue'
import ModelDiagramCanvas from '@/features/models/components/ModelDiagramCanvas.vue'
import type { NodeTypeResponse } from '@/types/api'
import type { EditorDiagram } from '@/features/models/types'
import {
  type ComparisonDataSet,
  type SelectedElement,
  useComparisonDiff,
} from '@/features/models/composables/useComparisonDiff'
import { loadString, saveString } from '@/utils/localStorage'

export type DualCompareSideData = ComparisonDataSet & {
  nodeTypes?: NodeTypeResponse[]
}

const props = defineProps<{
  error: string | null
  propsPanelStorageKey: string
  swapDisabled: boolean
  leftData: DualCompareSideData | null
  rightData: DualCompareSideData | null
  leftDiagram: EditorDiagram | null
  rightDiagram: EditorDiagram | null
  sharedData: CompareSharedData | null
}>()

const emit = defineEmits<{
  back: []
}>()

const { t } = useI18n()

const baseSide = ref<'left' | 'right'>('left')
const selectedElement = ref<SelectedElement | null>(null)

const leftCanvasRef = ref<InstanceType<typeof ModelDiagramCanvas> | null>(null)
const rightCanvasRef = ref<InstanceType<typeof ModelDiagramCanvas> | null>(null)

const SYNC_VIEWPORTS_KEY = 'warchi:compare-sync-viewports'
const syncViewports = ref(loadString(SYNC_VIEWPORTS_KEY, '1') !== '0')
const lastActiveSide = ref<'left' | 'right'>('left')
let applyingSync = false

function canvasFor(side: 'left' | 'right') {
  return side === 'left' ? leftCanvasRef.value : rightCanvasRef.value
}

function otherSide(side: 'left' | 'right'): 'left' | 'right' {
  return side === 'left' ? 'right' : 'left'
}

function applyViewportTo(side: 'left' | 'right', state: ViewportState): void {
  const canvas = canvasFor(side)
  if (!canvas) return
  applyingSync = true
  try {
    canvas.setViewport(state)
  } finally {
    applyingSync = false
  }
}

function handleViewportChange(side: 'left' | 'right', _viewport: ViewportState): void {
  lastActiveSide.value = side
  if (!syncViewports.value || applyingSync) return
  const src = canvasFor(side)?.getViewport()
  if (!src) return
  applyViewportTo(otherSide(side), src)
}

function snapOtherTo(side: 'left' | 'right'): void {
  const src = canvasFor(side)?.getViewport()
  if (!src) return
  applyViewportTo(otherSide(side), src)
}

function onSyncToggle(next: boolean): void {
  syncViewports.value = next
  saveString(SYNC_VIEWPORTS_KEY, next ? '1' : '0')
  if (next) snapOtherTo(lastActiveSide.value)
}

const { propsPanelHeight, startPropsPanelResize } = useResizablePropsPanel(props.propsPanelStorageKey)

const leftDataRef = computed(() => props.leftData)
const rightDataRef = computed(() => props.rightData)
const leftDiagramRef = computed(() => props.leftDiagram)
const rightDiagramRef = computed(() => props.rightDiagram)
const sharedDataRef = toRef(props, 'sharedData')

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
  leftData: leftDataRef,
  rightData: rightDataRef,
  leftDiagram: leftDiagramRef,
  rightDiagram: rightDiagramRef,
  sharedData: sharedDataRef,
  baseSide,
  selectedElement,
})

function centerBothCanvases(): void {
  nextTick(() => {
    requestAnimationFrame(() => {
      leftCanvasRef.value?.fitToView()
      rightCanvasRef.value?.fitToView()
      if (syncViewports.value) {
        const src = leftCanvasRef.value?.getViewport()
        if (src) applyViewportTo('right', src)
      }
    })
  })
}

watch(
  [() => props.leftDiagram, () => props.rightDiagram],
  () => {
    if (props.leftDiagram && props.rightDiagram) centerBothCanvases()
  },
  { immediate: true },
)
</script>

<template>
  <MainLayout>
    <template #header>
      <AppHeader />
    </template>
    <template #default>
      <div class="ddc">
        <div class="ddc__topbar">
          <button
            type="button"
            class="ddc__back"
            :title="t('toolbar.backToModels')"
            @click="emit('back')"
          >
            <UiIcon name="arrow_back" />
          </button>

          <div class="ddc__selectors">
            <slot name="before-swap" />

            <button
              type="button"
              class="ddc__swap"
              :disabled="swapDisabled"
              :title="t('models.compareToggleBase')"
              @click="handleToggleBaseSide"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path
                  d="M5 3L2 6L5 9"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
                <path d="M2 6H14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
                <path
                  d="M13 15L16 12L13 9"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
                <path d="M16 12H4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
              </svg>
            </button>

            <slot name="after-swap" />
          </div>

          <slot name="topbar-extra" />

          <label class="ddc__sync" :title="t('models.compareSyncViewportsHint')">
            <input
              class="ddc__sync-input"
              type="checkbox"
              role="switch"
              :checked="syncViewports"
              @change="onSyncToggle(($event.target as HTMLInputElement).checked)"
            />
            <span class="ddc__sync-label">{{ t('models.compareSyncViewports') }}</span>
          </label>
        </div>

        <p v-if="error" class="ddc__error">{{ error }}</p>

        <div v-else class="ddc__body">
          <div class="ddc__panels">
            <div
              class="ddc__panel"
              :class="baseSide === 'left' ? 'ddc__panel--base' : 'ddc__panel--changes'"
            >
              <div class="ddc__panel-header">
                <span class="ddc__panel-side">{{ t('models.compareVersionLeft') }}</span>
                <span
                  class="ddc__role-badge"
                  :class="
                    baseSide === 'left' ? 'ddc__role-badge--base' : 'ddc__role-badge--changes'
                  "
                >
                  {{
                    baseSide === 'left'
                      ? t('models.compareBaseLabel')
                      : t('models.compareChangesLabel')
                  }}
                </span>
              </div>
              <div class="ddc__canvas-area">
                <ModelDiagramCanvas
                  v-if="leftDiagram && sharedData"
                  ref="leftCanvasRef"
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
                  @viewport-change="(vp) => handleViewportChange('left', vp)"
                />
                <div v-else class="ddc__placeholder">
                  {{ leftDiagram ? t('common.loading') : t('models.compareNoDiagram') }}
                </div>
              </div>
            </div>

            <div class="ddc__divider" />

            <div
              class="ddc__panel"
              :class="baseSide === 'right' ? 'ddc__panel--base' : 'ddc__panel--changes'"
            >
              <div class="ddc__panel-header">
                <span class="ddc__panel-side">{{ t('models.compareVersionRight') }}</span>
                <span
                  class="ddc__role-badge"
                  :class="
                    baseSide === 'right' ? 'ddc__role-badge--base' : 'ddc__role-badge--changes'
                  "
                >
                  {{
                    baseSide === 'right'
                      ? t('models.compareBaseLabel')
                      : t('models.compareChangesLabel')
                  }}
                </span>
              </div>
              <div class="ddc__canvas-area">
                <ModelDiagramCanvas
                  v-if="rightDiagram && sharedData"
                  ref="rightCanvasRef"
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
                  @viewport-change="(vp) => handleViewportChange('right', vp)"
                />
                <div v-else class="ddc__placeholder">
                  {{ rightDiagram ? t('common.loading') : t('models.compareNoDiagram') }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          v-if="selectedElementLabel"
          class="ddc__resizer"
          role="separator"
          aria-orientation="horizontal"
          :title="t('models.resizePropertiesPanelHeight')"
          @mousedown.prevent="startPropsPanelResize"
        >
          <span class="ddc__resizer-grip" />
        </div>
        <div
          v-if="selectedElementLabel"
          class="ddc__props"
          :style="{ height: propsPanelHeight + 'px' }"
        >
          <div class="ddc__props-header">
            <span class="ddc__props-label">{{ t('models.compareSelectedElement') }}</span>
            <span class="ddc__props-element">{{ selectedElementLabel }}</span>
          </div>
          <div class="ddc__props-scroll">
            <table class="ddc__table">
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
                  :class="{ 'ddc__row--diff': row.changed }"
                >
                  <td class="ddc__cell-key">{{ row.key }}</td>
                  <td
                    :class="
                      row.changed
                        ? selectedElementDiffKind === 'modified'
                          ? 'ddc__cell--modified'
                          : isLeftBaseForProps
                            ? 'ddc__cell--old'
                            : 'ddc__cell--new'
                        : ''
                    "
                  >
                    {{ isLeftBaseForProps ? row.base : row.target }}
                  </td>
                  <td
                    :class="
                      row.changed
                        ? selectedElementDiffKind === 'modified'
                          ? 'ddc__cell--modified'
                          : isLeftBaseForProps
                            ? 'ddc__cell--new'
                            : 'ddc__cell--old'
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
.ddc {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--base-bg);
}

.ddc__topbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}

.ddc__back {
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
.ddc__back:hover {
  color: var(--primary);
  border-color: var(--primary);
  background: var(--primary-soft);
  box-shadow: var(--shadow-glow);
}

.ddc__selectors {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.ddc__swap {
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
.ddc__swap:hover:not(:disabled) {
  color: var(--primary);
  border-color: var(--primary);
  background: var(--primary-soft);
  transform: rotate(180deg);
}
.ddc__swap:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.ddc__sync {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-muted);
  cursor: pointer;
  user-select: none;
}
.ddc__sync-input {
  width: 34px;
  height: 18px;
  appearance: none;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface-muted);
  position: relative;
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease;
}
.ddc__sync-input::after {
  content: '';
  position: absolute;
  top: 1px;
  left: 1px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--surface);
  box-shadow: 0 0 0 1px var(--border);
  transition: transform 0.15s ease;
}
.ddc__sync-input:checked {
  background: var(--primary);
  border-color: var(--primary);
}
.ddc__sync-input:checked::after {
  transform: translateX(16px);
  box-shadow: none;
}
.ddc__sync-label {
  white-space: nowrap;
}

.ddc__error {
  padding: 16px;
  color: var(--danger);
  margin: 0;
  font-size: 13px;
}

.ddc__body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.ddc__panels {
  display: flex;
  flex: 1;
  min-height: 0;
}

.ddc__panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  transition: border-color 0.25s ease;
}

.ddc__panel--base {
  border-top: 2px solid var(--border);
}
.ddc__panel--changes {
  border-top: 2px solid var(--primary);
}

.ddc__divider {
  width: 1px;
  background: var(--border);
  flex-shrink: 0;
  position: relative;
}
.ddc__divider::before {
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
.ddc__panels:hover .ddc__divider::before {
  opacity: 1;
}

.ddc__panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  background: var(--surface-muted);
  border-bottom: 1px solid var(--border);
}

.ddc__panel-side {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-subtle);
}

.ddc__role-badge {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 2px 8px;
  border-radius: 6px;
  transition: all 0.25s ease;
}
.ddc__role-badge--base {
  background: var(--surface-strong);
  color: var(--text-muted);
}
.ddc__role-badge--changes {
  background: var(--primary);
  color: #fff;
  box-shadow: 0 1px 4px rgba(124, 92, 252, 0.25);
}

.ddc__canvas-area {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.ddc__placeholder {
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

.ddc__resizer {
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
.ddc__resizer:hover {
  background: var(--primary-soft);
}

.ddc__resizer-grip {
  width: 36px;
  height: 3px;
  border-radius: 2px;
  background: var(--border-strong);
  transition: all 0.15s ease;
}
.ddc__resizer:hover .ddc__resizer-grip {
  background: var(--primary);
  width: 48px;
}

.ddc__props {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border-top: 1px solid var(--border);
  overflow: hidden;
}

.ddc__props-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.ddc__props-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-subtle);
}

.ddc__props-element {
  font-size: 13px;
  font-weight: 500;
  color: var(--base-text);
  font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
}

.ddc__props-scroll {
  flex: 1;
  overflow: auto;
}

.ddc__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.ddc__table th {
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

.ddc__table td {
  padding: 5px 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
}

.ddc__table tbody tr:hover {
  background: var(--surface-muted);
}

.ddc__cell-key {
  font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
  font-size: 11px;
  color: var(--text-muted);
}

.ddc__row--diff {
  background: color-mix(in srgb, var(--warning) 4%, transparent);
}
.ddc__row--diff:hover {
  background: color-mix(in srgb, var(--warning) 8%, transparent) !important;
}

.ddc__cell--old {
  color: var(--danger);
  background: var(--danger-soft);
  font-weight: 500;
}

.ddc__cell--new {
  color: var(--success);
  background: var(--success-soft);
  font-weight: 500;
}

.ddc__cell--modified {
  color: var(--warning);
  background: color-mix(in srgb, var(--warning) 16%, transparent);
  font-weight: 500;
}
</style>

<!-- Slot content is compiled in parent scope; shared pick chrome for compare selectors. -->
<style>
.ddc-pick {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ddc-pick__label {
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-subtle);
  white-space: nowrap;
}

.ddc-pick__select {
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
.ddc-pick__select:hover {
  border-color: var(--border-strong);
}
.ddc-pick__select:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 2px var(--primary-soft);
}
</style>
