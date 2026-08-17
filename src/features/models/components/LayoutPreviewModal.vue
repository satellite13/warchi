<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import BaseModal from '@/components/modals/BaseModal.vue'
import type { DiagramAttrs } from '../modelAttrs'
import { defaultLayoutUiOptions, type LayoutUiOptions } from '../layout/layoutOptions'
import { buildLayoutSketchModel } from '../layout/layoutSketch'
import {
  runDiagramLayout,
  type DiagramLayoutMode,
} from '../layout/runDiagramLayout'

const props = defineProps<{
  open: boolean
  before: DiagramAttrs
  busy?: boolean
}>()

const emit = defineEmits<{
  close: []
  apply: [after: DiagramAttrs]
  error: [message: string]
}>()

const { t } = useI18n()

const mode = ref<DiagramLayoutMode>('layered')
const ui = ref<LayoutUiOptions>(defaultLayoutUiOptions('layered'))
const after = ref<DiagramAttrs | null>(null)
const view = ref<'before' | 'after'>('after')
const advancedOpen = ref(false)
const updating = ref(false)
const noopMessage = ref<string | null>(null)
const previewStale = ref(false)
let refreshSeq = 0

const viewAttrs = computed(() =>
  view.value === 'before' ? props.before : (after.value ?? props.before)
)

const sketch = computed(() => buildLayoutSketchModel(viewAttrs.value))

const showNeedsUpdateHint = computed(
  () => view.value === 'after' && !after.value && !updating.value && !noopMessage.value
)

const canApply = computed(
  () => Boolean(after.value) && !updating.value && !props.busy && !previewStale.value
)

const isLayered = computed(() => mode.value === 'layered')

async function refreshPreview() {
  const seq = ++refreshSeq
  updating.value = true
  noopMessage.value = null
  try {
    const result = await runDiagramLayout({
      diagram: props.before,
      mode: mode.value,
      uiOptions: ui.value,
    })
    if (seq !== refreshSeq || !props.open) return
    if (result.status === 'noop') {
      after.value = null
      previewStale.value = false
      noopMessage.value = t('toolbar.layoutPreviewNoop')
      return
    }
    if (result.status === 'error') {
      emit('error', result.message)
      return
    }
    after.value = result.diagram
    previewStale.value = false
    view.value = 'after'
  } finally {
    if (seq === refreshSeq) updating.value = false
  }
}

function markPreviewStale() {
  if (after.value) previewStale.value = true
}

function resetState() {
  refreshSeq += 1
  mode.value = 'layered'
  after.value = null
  view.value = 'after'
  advancedOpen.value = false
  noopMessage.value = null
  previewStale.value = false
  ui.value = defaultLayoutUiOptions('layered')
}

watch(
  () => props.open,
  open => {
    if (open) {
      resetState()
      void refreshPreview()
    } else {
      refreshSeq += 1
    }
  }
)

watch(mode, newMode => {
  after.value = null
  noopMessage.value = null
  previewStale.value = false
  view.value = 'before'
  ui.value = defaultLayoutUiOptions(newMode)
})

watch(
  ui,
  () => {
    markPreviewStale()
  },
  { deep: true }
)

function handleApply() {
  if (after.value && !previewStale.value) {
    emit('apply', after.value)
  }
}
</script>

<template>
  <BaseModal
    v-if="open"
    :title="t('toolbar.layoutPreviewTitle')"
    max-width="min(96vw, 920px)"
    @close="emit('close')"
  >
    <div class="layout-preview">
      <div class="layout-preview__settings">
        <fieldset class="layout-preview__fieldset">
          <legend class="layout-preview__legend layout-preview__legend--sr">
            {{ t('toolbar.layoutPreviewTitle') }}
          </legend>
          <label class="layout-preview__radio">
            <input v-model="mode" type="radio" value="layered" />
            <span>{{ t('toolbar.layoutPreviewModeLayered') }}</span>
          </label>
          <label class="layout-preview__radio">
            <input v-model="mode" type="radio" value="overlap" />
            <span>{{ t('toolbar.layoutPreviewModeOverlap') }}</span>
          </label>
        </fieldset>

        <div class="layout-preview__fields">
          <label v-if="isLayered" class="layout-preview__field">
            <span class="layout-preview__label">{{ t('toolbar.layoutPreviewDirection') }}</span>
            <select v-model="ui.direction" class="form-select">
              <option value="AUTO">{{ t('toolbar.layoutPreviewDirectionAuto') }}</option>
              <option value="RIGHT">{{ t('toolbar.layoutPreviewDirectionRight') }}</option>
              <option value="DOWN">{{ t('toolbar.layoutPreviewDirectionDown') }}</option>
              <option value="LEFT">{{ t('toolbar.layoutPreviewDirectionLeft') }}</option>
              <option value="UP">{{ t('toolbar.layoutPreviewDirectionUp') }}</option>
            </select>
          </label>

          <label class="layout-preview__field">
            <span class="layout-preview__label">{{ t('toolbar.layoutPreviewNodeSpacing') }}</span>
            <input
              v-model.number="ui.nodeNodeSpacing"
              type="number"
              min="0"
              step="4"
              class="form-input"
            />
          </label>

          <label v-if="isLayered" class="layout-preview__field">
            <span class="layout-preview__label">{{ t('toolbar.layoutPreviewLayerSpacing') }}</span>
            <input
              v-model.number="ui.layerSpacing"
              type="number"
              min="0"
              step="4"
              class="form-input"
            />
          </label>

          <label class="layout-preview__field">
            <span class="layout-preview__label">{{ t('toolbar.layoutPreviewEdgeRouting') }}</span>
            <select v-model="ui.edgeRouting" class="form-select">
              <option value="ORTHOGONAL">{{ t('toolbar.layoutPreviewEdgeRoutingOrthogonal') }}</option>
              <option value="POLYLINE">{{ t('toolbar.layoutPreviewEdgeRoutingPolyline') }}</option>
            </select>
          </label>
        </div>

        <details
          class="layout-preview__advanced"
          :open="advancedOpen"
          @toggle="advancedOpen = ($event.target as HTMLDetailsElement).open"
        >
          <summary class="layout-preview__advanced-summary">
            {{ t('toolbar.layoutPreviewAdvanced') }}
          </summary>
          <div class="layout-preview__fields layout-preview__fields--advanced">
            <label v-if="isLayered" class="layout-preview__field">
              <span class="layout-preview__label">{{ t('toolbar.layoutPreviewPadding') }}</span>
              <input v-model="ui.padding" type="text" class="form-input" />
            </label>

            <label v-if="isLayered" class="layout-preview__field">
              <span class="layout-preview__label">{{ t('toolbar.layoutPreviewCrossing') }}</span>
              <select v-model="ui.crossingStrategy" class="form-select">
                <option value="">{{ t('toolbar.layoutPreviewCrossingDefault') }}</option>
                <option value="LAYER_SWEEP">{{ t('toolbar.layoutPreviewCrossingLayerSweep') }}</option>
                <option value="INTERACTIVE">{{ t('toolbar.layoutPreviewCrossingInteractive') }}</option>
              </select>
            </label>

            <label v-if="isLayered" class="layout-preview__field">
              <span class="layout-preview__label">{{ t('toolbar.layoutPreviewEdgeNodeSpacing') }}</span>
              <input
                :value="ui.edgeNodeSpacing ?? ''"
                type="number"
                min="0"
                step="4"
                class="form-input"
                @input="
                  ui.edgeNodeSpacing =
                    ($event.target as HTMLInputElement).value === ''
                      ? null
                      : Number(($event.target as HTMLInputElement).value)
                "
              />
            </label>

            <label v-if="!isLayered" class="layout-preview__checkbox">
              <input v-model="ui.sporeCompaction" type="checkbox" />
              <span>{{ t('toolbar.layoutPreviewCompaction') }}</span>
            </label>
          </div>
        </details>
      </div>

      <div class="layout-preview__preview">
        <div class="layout-preview__toggle" role="group" :aria-label="t('toolbar.layoutPreviewTitle')">
          <button
            type="button"
            class="layout-preview__toggle-btn"
            :class="{ 'layout-preview__toggle-btn--active': view === 'before' }"
            @click="view = 'before'"
          >
            {{ t('toolbar.layoutPreviewWas') }}
          </button>
          <button
            type="button"
            class="layout-preview__toggle-btn"
            :class="{ 'layout-preview__toggle-btn--active': view === 'after' }"
            @click="view = 'after'"
          >
            {{ t('toolbar.layoutPreviewWill') }}
          </button>
        </div>

        <div
          class="layout-preview__sketch-wrap"
          :class="{ 'layout-preview__sketch-wrap--stale': previewStale && after }"
        >
          <p v-if="noopMessage && view === 'after' && !after" class="layout-preview__noop">
            {{ noopMessage }}
          </p>
          <p v-else-if="showNeedsUpdateHint" class="layout-preview__noop">
            {{ t('toolbar.layoutPreviewNeedsUpdate') }}
          </p>
          <svg
            v-else
            :viewBox="`${sketch.viewBox.x} ${sketch.viewBox.y} ${sketch.viewBox.width} ${sketch.viewBox.height}`"
            class="layout-preview__svg"
            aria-hidden="true"
          >
            <rect
              v-for="n in sketch.nodes"
              :key="n.id"
              class="layout-preview__node"
              :x="n.x"
              :y="n.y"
              :width="n.width"
              :height="n.height"
              rx="4"
            />
          </svg>
        </div>

        <button
          type="button"
          class="btn layout-preview__update"
          :class="previewStale || showNeedsUpdateHint ? 'btn--primary' : 'btn--secondary'"
          :disabled="updating || busy"
          :title="
            previewStale
              ? t('toolbar.layoutPreviewStale')
              : showNeedsUpdateHint
                ? t('toolbar.layoutPreviewNeedsUpdate')
                : undefined
          "
          @click="refreshPreview"
        >
          <span
            v-if="previewStale || showNeedsUpdateHint"
            class="layout-preview__update-dot"
            aria-hidden="true"
          />
          {{ updating ? t('common.loading') : t('toolbar.layoutPreviewUpdate') }}
        </button>
      </div>
    </div>

    <template #footer>
      <button type="button" class="btn btn--secondary" @click="emit('close')">
        {{ t('toolbar.layoutPreviewCancel') }}
      </button>
      <button
        type="button"
        class="btn btn--primary"
        :disabled="!canApply"
        @click="handleApply"
      >
        {{ t('toolbar.layoutPreviewApply') }}
      </button>
    </template>
  </BaseModal>
</template>

<style scoped>
.layout-preview {
  display: grid;
  grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
  gap: 24px;
  min-height: 360px;
}

.layout-preview__settings {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.layout-preview__fieldset {
  margin: 0;
  padding: 0;
  border: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.layout-preview__legend--sr {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.layout-preview__radio {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--base-text);
  cursor: pointer;
}

.layout-preview__fields {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.layout-preview__fields--advanced {
  padding-top: 12px;
}

.layout-preview__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.layout-preview__label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted);
}

.layout-preview__checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--base-text);
  cursor: pointer;
}

.layout-preview__advanced {
  border-top: 1px solid var(--border);
  padding-top: 8px;
}

.layout-preview__advanced-summary {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted);
  cursor: pointer;
  user-select: none;
}

.layout-preview__preview {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.layout-preview__toggle {
  display: inline-flex;
  align-self: flex-start;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm, 6px);
  overflow: hidden;
}

.layout-preview__toggle-btn {
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-muted);
  background: var(--surface-muted);
  border: none;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.layout-preview__toggle-btn + .layout-preview__toggle-btn {
  border-left: 1px solid var(--border);
}

.layout-preview__toggle-btn--active {
  color: var(--base-text);
  background: var(--surface);
}

.layout-preview__toggle-btn:hover:not(.layout-preview__toggle-btn--active) {
  color: var(--base-text);
  background: var(--surface-strong, var(--surface-muted));
}

.layout-preview__sketch-wrap {
  flex: 1;
  min-height: 280px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm, 6px);
  background: var(--surface-muted);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.15s ease;
}

.layout-preview__sketch-wrap--stale {
  opacity: 0.55;
}

.layout-preview__svg {
  width: 100%;
  height: 100%;
  min-height: 280px;
  display: block;
}

.layout-preview__node {
  fill: var(--surface);
  stroke: var(--border);
  stroke-width: 1.5;
}

.layout-preview__noop {
  margin: 0;
  padding: 16px;
  font-size: 14px;
  color: var(--text-muted);
  text-align: center;
}

.layout-preview__update {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.layout-preview__update-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
  flex-shrink: 0;
}

@media (max-width: 720px) {
  .layout-preview {
    grid-template-columns: 1fr;
  }
}
</style>
