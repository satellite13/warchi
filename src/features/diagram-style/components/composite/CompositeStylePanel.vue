<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import LabeledFieldRow from '../LabeledFieldRow.vue'
import LabeledNumberInput from '../LabeledNumberInput.vue'
import ColorWithAlphaField from '../ColorWithAlphaField.vue'
import StyleSection from '../StyleSection.vue'
import ToggleSwitch from '@/components/forms/ToggleSwitch.vue'
import InsetSidesInput from '@/components/forms/InsetSidesInput.vue'
import CompositeTreeEditor from './CompositeTreeEditor.vue'
import CompositeLivePreview from './CompositeLivePreview.vue'
import A5BindingsEditor from './A5BindingsEditor.vue'
import { useNodeShapes } from '@/composables/useNodeShapes'
import { validateCompositeDiagramStyle } from '@/features/notations/utils/validationIssues'
import { createDefaultCompositeContent } from '@/features/diagram-style/utils/compositeBindings'
import {
  toInsetSides,
  insetToPlain,
  type InsetSides,
} from '../../utils/styleHelpers'
import type { OutlineSegment } from '@/domain/attrs/notationAttrs'
import type {
  DiagramStyle,
  CustomProperty,
  CompositeSerializedCComponent,
  StylePropertyBindingGroup,
} from '@/domain/attrs/notationAttrs'

const props = defineProps<{
  currentDiagramStyle?: DiagramStyle
  componentProperties?: CustomProperty[]
  nodeTypeProperties?: CustomProperty[]
  canRestoreStyle?: boolean
}>()

const emit = defineEmits<{
  (e: 'style-change', style: DiagramStyle): void
  (e: 'restore-style'): void
}>()
const { t } = useI18n()

// Composite content
const compositeContentDraft = ref<CompositeSerializedCComponent>(createDefaultCompositeContent('Name'))
const styleBindingsDraft = ref<StylePropertyBindingGroup[]>([])
const compositeEditorMode = ref<'visual' | 'json'>('visual')
const compositeTreeTargets = ref<Array<{ id: string; label: string }>>([])
const treeSelectedNodeId = ref<string | null>(null)
const compositeContentJson = ref('')
const styleBindingsJson = ref('')
const compositeJsonError = ref<string | null>(null)
const styleBindingsJsonError = ref<string | null>(null)

// Composite-level settings
const compositeShapeType = ref<CompositeShape>('rectangle')
const compositeAutoSize = ref(false)
const compositeMinWidth = ref(0)
const compositeMinHeight = ref(0)

// Dimensions
const nodeWidth = ref(140)
const nodeHeight = ref(80)
const cornerRadius = ref(0)
const contentInset = ref<InsetSides>({ top: 0, right: 0, bottom: 0, left: 0 })

// Fill & Stroke
const fillColor = ref('#ffffff')
const fillOpacity = ref(1)
const strokeColor = ref('#333333')
const strokeOpacity = ref(1)
const strokeWidth = ref(1)
const opacity = ref(1)

// Ports
const portsTop = ref(0)
const portsBottom = ref(0)
const portsLeft = ref(0)
const portsRight = ref(0)

type CompositeShape = NonNullable<DiagramStyle['compositeShapeType']>

const COMPOSITE_SHAPE_OPTIONS: ReadonlyArray<{ value: CompositeShape; labelKey: string }> = [
  { value: 'rectangle', labelKey: 'nodeStyle.shapeRectangle' },
  { value: 'beveled-rectangle', labelKey: 'nodeStyle.shapeBeveledRectangle' },
  { value: 'diamond', labelKey: 'nodeStyle.shapeDiamond' },
  { value: 'circle', labelKey: 'nodeStyle.shapeCircle' },
  { value: 'trapezoid', labelKey: 'nodeStyle.shapeTrapezoid' },
  { value: 'slanted-rectangle', labelKey: 'nodeStyle.shapeSlantedRectangle' },
  { value: 'custom', labelKey: 'nodeStyle.customShape' },
]

// Custom shape catalog
const { list: catalogShapes, fetchList: fetchNodeShapes } = useNodeShapes()
const catalogShapeOptions = computed(() =>
  catalogShapes.value.map((s) => ({ id: s.id, label: s.name })),
)
function ensureCatalogShapesLoaded() {
  void fetchNodeShapes({ size: 200 })
}
function handleNodeShapesChanged() {
  void fetchNodeShapes({ size: 200 })
}
onMounted(() => {
  window.addEventListener('warchi-node-shapes-changed', handleNodeShapesChanged)
})
onBeforeUnmount(() => {
  window.removeEventListener('warchi-node-shapes-changed', handleNodeShapesChanged)
})
const customShapeId = ref<string | null>(null)
const customOutline = ref<OutlineSegment[] | undefined>(undefined)

function handleCustomShapeSelect(shapeId: string) {
  const shape = catalogShapes.value.find((s) => s.id === shapeId)
  if (!shape) return
  customShapeId.value = shapeId
  try {
    customOutline.value = shape.outline ? (JSON.parse(shape.outline) as OutlineSegment[]) : undefined
  } catch {
    customOutline.value = undefined
  }
  emitStyle()
}

// Flat tree nodes for PatchPropertyEditor (type lookup)
function collectNodes(
  node: CompositeSerializedCComponent,
  out: Array<{ node: CompositeSerializedCComponent }>,
) {
  out.push({ node })
  if (node.content) collectNodes(node.content, out)
  if (Array.isArray(node.children)) node.children.forEach((c) => collectNodes(c, out))
}
const flatTreeNodes = computed(() => {
  const out: Array<{ node: CompositeSerializedCComponent }> = []
  collectNodes(compositeContentDraft.value, out)
  return out
})

// A5 props
const componentPropsForA5 = computed(() => props.componentProperties ?? [])
const stringProperties = computed(() => [
  ...(props.componentProperties ?? []),
  ...(props.nodeTypeProperties ?? []),
].filter(p => p.type === 'string'))
const nodeTypePropsForA5 = computed(() => props.nodeTypeProperties ?? [])

// Validation
const compositeValidationIssues = computed(() =>
  validateCompositeDiagramStyle(
    {
      nodeShape: 'composite',
      compositeContent: compositeContentDraft.value,
      stylePropertyBindings: styleBindingsDraft.value,
    },
    t,
  ),
)

// Section states
const sectionOpen = ref({
  shape: true,
  tree: true,
  fill: true,
  dimensions: false,
  bindings: false,
})

function toggleSection(key: keyof typeof sectionOpen.value) {
  sectionOpen.value[key] = !sectionOpen.value[key]
}

// Sync from prop
function loadFromStyle() {
  const ds = props.currentDiagramStyle
  if (!ds) return

  compositeShapeType.value =
    (ds.compositeShapeType as typeof compositeShapeType.value) ?? 'rectangle'
  compositeAutoSize.value = ds.compositeAutoSize ?? false
  compositeMinWidth.value = ds.compositeMinWidth ?? 0
  compositeMinHeight.value = ds.compositeMinHeight ?? 0

  nodeWidth.value = ds.width ?? 140
  nodeHeight.value = ds.height ?? 80
  cornerRadius.value = ds.cornerRadius ?? 0
  contentInset.value = toInsetSides(ds.contentInset, 0)

  fillColor.value = ds.fillColor ?? '#ffffff'
  fillOpacity.value = ds.fillOpacity ?? 1
  strokeColor.value = ds.strokeColor ?? '#333333'
  strokeOpacity.value = ds.strokeOpacity ?? 1
  strokeWidth.value = ds.strokeWidth ?? 1
  opacity.value = ds.opacity ?? 1

  portsTop.value = ds.portsTop ?? 0
  portsBottom.value = ds.portsBottom ?? 0
  portsLeft.value = ds.portsLeft ?? 0
  portsRight.value = ds.portsRight ?? 0

  customShapeId.value = ds.customShapeId ?? null
  customOutline.value = ds.customOutline ?? undefined
  if (compositeShapeType.value === 'custom') ensureCatalogShapesLoaded()

  compositeContentDraft.value = ds.compositeContent
    ? JSON.parse(JSON.stringify(ds.compositeContent))
    : createDefaultCompositeContent('Name')
  styleBindingsDraft.value = ds.stylePropertyBindings
    ? JSON.parse(JSON.stringify(ds.stylePropertyBindings))
    : []
  compositeContentJson.value = ds.compositeContent
    ? JSON.stringify(ds.compositeContent, null, 2)
    : ''
  styleBindingsJson.value = ds.stylePropertyBindings
    ? JSON.stringify(ds.stylePropertyBindings, null, 2)
    : ''
  compositeJsonError.value = null
  styleBindingsJsonError.value = null
}

watch(() => props.currentDiagramStyle, loadFromStyle, { immediate: true, deep: true })

function emitStyle() {
  const style: DiagramStyle = {
    nodeShape: 'composite',
    compositeContent: compositeContentDraft.value,
    ...(styleBindingsDraft.value.length > 0
      ? { stylePropertyBindings: styleBindingsDraft.value }
      : {}),
    compositeShapeType: compositeShapeType.value,
    ...(compositeShapeType.value === 'custom' && customShapeId.value
      ? { customShapeId: customShapeId.value, customOutline: customOutline.value }
      : {}),
    compositeAutoSize: compositeAutoSize.value,
    compositeMinWidth: compositeMinWidth.value,
    compositeMinHeight: compositeMinHeight.value,
    fillColor: fillColor.value,
    fillOpacity: fillOpacity.value,
    strokeColor: strokeColor.value,
    strokeOpacity: strokeOpacity.value,
    strokeWidth: strokeWidth.value,
    cornerRadius: cornerRadius.value,
    opacity: opacity.value,
    width: nodeWidth.value,
    height: nodeHeight.value,
    contentInset: insetToPlain(contentInset.value),
    portsTop: portsTop.value,
    portsBottom: portsBottom.value,
    portsLeft: portsLeft.value,
    portsRight: portsRight.value,
    // Preserve label fields from original style
    labelColor: props.currentDiagramStyle?.labelColor,
    labelOpacity: props.currentDiagramStyle?.labelOpacity,
    labelFontSize: props.currentDiagramStyle?.labelFontSize,
    labelInset: props.currentDiagramStyle?.labelInset,
    labelAlign: props.currentDiagramStyle?.labelAlign,
    labelVerticalAlign: props.currentDiagramStyle?.labelVerticalAlign,
    labelTemplate: props.currentDiagramStyle?.labelTemplate,
    showLabel: props.currentDiagramStyle?.showLabel,
    // Preserve icon fields from original style
    iconName: props.currentDiagramStyle?.iconName,
    iconPlacement: props.currentDiagramStyle?.iconPlacement,
    iconWidth: props.currentDiagramStyle?.iconWidth,
    iconHeight: props.currentDiagramStyle?.iconHeight,
    iconInset: props.currentDiagramStyle?.iconInset,
    iconStrokeColor: props.currentDiagramStyle?.iconStrokeColor,
    iconFillColor: props.currentDiagramStyle?.iconFillColor,
  }
  emit('style-change', style)
}

function handleCompositeTreeUpdate(next: CompositeSerializedCComponent) {
  compositeContentDraft.value = JSON.parse(JSON.stringify(next))
  compositeContentJson.value = JSON.stringify(compositeContentDraft.value, null, 2)
  compositeJsonError.value = null
  emitStyle()
}

function handleA5BindingsUpdate(next: StylePropertyBindingGroup[]) {
  styleBindingsDraft.value = JSON.parse(JSON.stringify(next))
  styleBindingsJson.value = JSON.stringify(styleBindingsDraft.value, null, 2)
  styleBindingsJsonError.value = null
  emitStyle()
}

function applyCompositeContentJson() {
  try {
    const parsed = compositeContentJson.value.trim()
      ? JSON.parse(compositeContentJson.value)
      : createDefaultCompositeContent('Name')
    compositeContentDraft.value = parsed as CompositeSerializedCComponent
    compositeContentJson.value = JSON.stringify(parsed, null, 2)
    compositeJsonError.value = null
    emitStyle()
  } catch (e) {
    compositeJsonError.value = String(e)
  }
}

function applyStyleBindingsJson() {
  try {
    const parsed = styleBindingsJson.value.trim()
      ? JSON.parse(styleBindingsJson.value)
      : []
    styleBindingsDraft.value = parsed as StylePropertyBindingGroup[]
    styleBindingsJson.value = JSON.stringify(parsed, null, 2)
    styleBindingsJsonError.value = null
    emitStyle()
  } catch (e) {
    styleBindingsJsonError.value = String(e)
  }
}
</script>

<template>
  <div class="csp">
    <!-- Header -->
    <div class="csp__header">
      <div class="csp__header-type">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="2" y="3" width="12" height="10" rx="2" stroke="currentColor" stroke-width="1.2"/>
          <line x1="5" y1="7" x2="11" y2="7" stroke="currentColor" stroke-width="1"/>
          <line x1="5" y1="10" x2="9" y2="10" stroke="currentColor" stroke-width="1"/>
        </svg>
        <span>{{ t('notations.compositeFigureStyleTab') }}</span>
      </div>
      <div v-if="canRestoreStyle" class="csp__header-actions">
        <button
          type="button"
          class="csp__header-btn"
          :title="t('nodeStyle.restoreFromNotation')"
          @click="emit('restore-style')"
        >
          <UiIcon name="restart_alt" />
        </button>
      </div>
    </div>

    <!-- Composite-level settings -->
    <StyleSection
      :title="t('nodeStyle.figure')"
      :open="sectionOpen.shape"
      @toggle="toggleSection('shape')"
    >
      <div class="csp__shapes">
        <button
          v-for="shape in COMPOSITE_SHAPE_OPTIONS"
          :key="shape.value"
          type="button"
          class="csp__shape-btn"
          :class="{ 'csp__shape-btn--active': compositeShapeType === shape.value }"
          :title="t(shape.labelKey)"
          @click="compositeShapeType = shape.value; if (shape.value === 'custom') ensureCatalogShapesLoaded(); emitStyle()"
        >
          <svg width="28" height="20" viewBox="0 0 28 20">
            <rect v-if="shape.value === 'rectangle'" x="2" y="3" width="24" height="14" rx="1" stroke="currentColor" stroke-width="1.2" fill="none"/>
            <polygon v-if="shape.value === 'beveled-rectangle'" points="5,3 23,3 26,6 26,17 23,20 5,20 2,17 2,6" stroke="currentColor" stroke-width="1.2" fill="none" transform="translate(0,-1.5)"/>
            <polygon v-if="shape.value === 'diamond'" points="14,1 27,10 14,19 1,10" stroke="currentColor" stroke-width="1.2" fill="none"/>
            <circle v-if="shape.value === 'circle'" cx="14" cy="10" r="8" stroke="currentColor" stroke-width="1.2" fill="none"/>
            <polygon v-if="shape.value === 'trapezoid'" points="5,3 23,3 26,17 2,17" stroke="currentColor" stroke-width="1.2" fill="none"/>
            <polygon v-if="shape.value === 'slanted-rectangle'" points="6,3 26,3 22,17 2,17" stroke="currentColor" stroke-width="1.2" fill="none"/>
            <rect v-if="shape.value === 'custom'" x="4" y="5" width="20" height="10" rx="1" stroke="currentColor" stroke-width="1.2" stroke-dasharray="3 2" fill="none"/>
          </svg>
        </button>
      </div>
      <LabeledFieldRow v-if="compositeShapeType === 'custom'" :label="t('nodeStyle.customShape')">
        <select
          class="csp__select"
          :value="customShapeId ?? ''"
          @change="handleCustomShapeSelect(($event.target as HTMLSelectElement).value)"
        >
          <option value="">{{ t('common.none') }}</option>
          <option
            v-for="opt in catalogShapeOptions"
            :key="opt.id"
            :value="opt.id"
          >{{ opt.label }}</option>
        </select>
      </LabeledFieldRow>
      <LabeledFieldRow :label="t('nodeStyle.compositeAutoSize')">
        <ToggleSwitch
          :model-value="compositeAutoSize"
          @update:model-value="
            compositeAutoSize = $event;
            emitStyle()
          "
        />
      </LabeledFieldRow>
      <div class="csp__grid-3">
        <LabeledNumberInput
          label="W"
          :model-value="nodeWidth"
          :min="10"
          :max="500"
          :step="10"
          @update:model-value="
            nodeWidth = Number($event);
            emitStyle()
          "
        />
        <LabeledNumberInput
          label="H"
          :model-value="nodeHeight"
          :min="10"
          :max="300"
          :step="10"
          @update:model-value="
            nodeHeight = Number($event);
            emitStyle()
          "
        />
        <LabeledNumberInput
          label="R"
          :model-value="cornerRadius"
          :min="0"
          :max="50"
          :step="1"
          @update:model-value="
            cornerRadius = Number($event);
            emitStyle()
          "
        />
      </div>
      <div class="csp__grid-2">
        <LabeledNumberInput
          :label="t('nodeStyle.compositeMinWidth')"
          :model-value="compositeMinWidth"
          :min="0"
          :max="1000"
          :step="10"
          @update:model-value="
            compositeMinWidth = Number($event);
            emitStyle()
          "
        />
        <LabeledNumberInput
          :label="t('nodeStyle.compositeMinHeight')"
          :model-value="compositeMinHeight"
          :min="0"
          :max="1000"
          :step="10"
          @update:model-value="
            compositeMinHeight = Number($event);
            emitStyle()
          "
        />
      </div>
      <InsetSidesInput
        :model-value="contentInset"
        :min="0"
        :max="100"
        :step="1"
        @update:model-value="
          contentInset = $event;
          emitStyle()
        "
      />
      <div class="csp__grid-4">
        <LabeledNumberInput
          label="PT"
          :model-value="portsTop"
          :min="0"
          :max="16"
          :step="1"
          @update:model-value="
            portsTop = Number($event);
            emitStyle()
          "
        />
        <LabeledNumberInput
          label="PB"
          :model-value="portsBottom"
          :min="0"
          :max="16"
          :step="1"
          @update:model-value="
            portsBottom = Number($event);
            emitStyle()
          "
        />
        <LabeledNumberInput
          label="PL"
          :model-value="portsLeft"
          :min="0"
          :max="16"
          :step="1"
          @update:model-value="
            portsLeft = Number($event);
            emitStyle()
          "
        />
        <LabeledNumberInput
          label="PR"
          :model-value="portsRight"
          :min="0"
          :max="16"
          :step="1"
          @update:model-value="
            portsRight = Number($event);
            emitStyle()
          "
        />
      </div>
    </StyleSection>

    <!-- Fill & Stroke -->
    <StyleSection
      :title="t('nodeStyle.fillAndStroke')"
      :open="sectionOpen.fill"
      @toggle="toggleSection('fill')"
    >
      <LabeledFieldRow :label="t('nodeStyle.fill')">
        <ColorWithAlphaField
          :model-value="fillColor"
          :alpha-value="fillOpacity"
          @update:model-value="
            fillColor = $event;
            emitStyle()
          "
          @update:alpha="
            fillOpacity = $event;
            emitStyle()
          "
        />
      </LabeledFieldRow>
      <LabeledFieldRow :label="t('nodeStyle.stroke')">
        <ColorWithAlphaField
          :model-value="strokeColor"
          :alpha-value="strokeOpacity"
          @update:model-value="
            strokeColor = $event;
            emitStyle()
          "
          @update:alpha="
            strokeOpacity = $event;
            emitStyle()
          "
        />
      </LabeledFieldRow>
      <LabeledFieldRow :label="t('nodeStyle.thickness')">
        <input
          type="range"
          class="csp__range"
          :value="strokeWidth"
          min="0"
          max="20"
          step="1"
          @input="
            strokeWidth = Number(($event.target as HTMLInputElement).value);
            emitStyle()
          "
        />
        <input
          type="number"
          class="csp__input-tiny"
          :value="strokeWidth"
          min="0"
          max="20"
          step="1"
          @input="
            strokeWidth = Number(($event.target as HTMLInputElement).value);
            emitStyle()
          "
        />
      </LabeledFieldRow>
      <LabeledFieldRow :label="t('nodeStyle.opacity')">
        <input
          type="range"
          class="csp__range"
          :value="opacity"
          min="0"
          max="1"
          step="0.05"
          @input="
            opacity = Number(($event.target as HTMLInputElement).value);
            emitStyle()
          "
        />
        <input
          type="number"
          class="csp__input-tiny"
          :value="opacity"
          min="0"
          max="1"
          step="0.05"
          @input="
            opacity = Number(($event.target as HTMLInputElement).value);
            emitStyle()
          "
        />
      </LabeledFieldRow>
    </StyleSection>

    <!-- Tree editor -->
    <StyleSection
      :title="t('notations.compositeFigureStyleTab')"
      :open="sectionOpen.tree"
      @toggle="toggleSection('tree')"
    >
      <div class="csp__mode-toggle">
        <button
          type="button"
          class="csp__mode-btn"
          :class="{ 'csp__mode-btn--active': compositeEditorMode === 'visual' }"
          @click="compositeEditorMode = 'visual'"
        >
          {{ t('nodeStyle.compositeVisualMode') }}
        </button>
        <button
          type="button"
          class="csp__mode-btn"
          :class="{ 'csp__mode-btn--active': compositeEditorMode === 'json' }"
          @click="compositeEditorMode = 'json'"
        >
          {{ t('nodeStyle.compositeJsonMode') }}
        </button>
      </div>

      <template v-if="compositeEditorMode === 'visual'">
        <CompositeTreeEditor
          :model-value="compositeContentDraft"
          :string-properties="stringProperties"
          @update:model-value="handleCompositeTreeUpdate"
          @update:selected-id="treeSelectedNodeId = $event"
          @target-options="
            (targets) => {
              compositeTreeTargets = targets
            }
          "
        />
        <CompositeLivePreview
          :content="compositeContentDraft"
          :height="120"
          :selected-node-id="treeSelectedNodeId"
        />
      </template>

      <template v-else>
        <div class="csp__json-field">
          <label class="csp__json-label">{{ t('nodeStyle.compositeContentJson') }}</label>
          <textarea
            class="csp__textarea"
            :value="compositeContentJson"
            rows="7"
            @input="compositeContentJson = ($event.target as HTMLTextAreaElement).value"
            @blur="applyCompositeContentJson"
          />
          <div class="csp__hint">
            {{ compositeJsonError || t('nodeStyle.compositeJsonHint') }}
          </div>
        </div>
        <div class="csp__json-field">
          <label class="csp__json-label">{{ t('nodeStyle.compositeBindingsJson') }}</label>
          <textarea
            class="csp__textarea"
            :value="styleBindingsJson"
            rows="6"
            @input="styleBindingsJson = ($event.target as HTMLTextAreaElement).value"
            @blur="applyStyleBindingsJson"
          />
          <div class="csp__hint">
            {{ styleBindingsJsonError || t('nodeStyle.compositeBindingsHint') }}
          </div>
        </div>
      </template>

      <div v-if="compositeValidationIssues.length > 0" class="csp__validation">
        <div
          v-for="issue in compositeValidationIssues"
          :key="`${issue.code}-${issue.path}`"
          class="csp__validation-item"
        >
          <strong>{{ issue.code }}</strong
          >: {{ issue.message }}
        </div>
      </div>
    </StyleSection>

    <!-- A5 Bindings -->
    <StyleSection
      :title="t('nodeStyle.a5Title')"
      :open="sectionOpen.bindings"
      @toggle="toggleSection('bindings')"
    >
      <A5BindingsEditor
        :model-value="styleBindingsDraft"
        :component-properties="componentPropsForA5"
        :node-type-properties="nodeTypePropsForA5"
        :target-options="compositeTreeTargets"
        :tree-nodes="flatTreeNodes"
        @update:model-value="handleA5BindingsUpdate"
      />
    </StyleSection>
  </div>
</template>

<style scoped>
.csp {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
}

.csp__header {
  padding: 10px 8px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.csp__header-type {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 3px 8px 3px 6px;
  border-radius: 5px;
  color: var(--primary);
  background: var(--primary-soft);
}

.csp__header-type svg {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.csp__header-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.csp__header-btn {
  width: 22px;
  height: 22px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--text-muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;
}

.csp__header-btn:hover {
  color: var(--primary);
  border-color: var(--primary);
  background: var(--primary-soft);
}

.csp__header-btn :deep(.ui-icon) {
  width: 16px;
  height: 16px;
}

.csp__grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.csp__grid-3 {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 6px;
}

.csp__grid-4 {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr;
  gap: 6px;
}

.csp__shapes {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.csp__shape-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 28px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--text-subtle);
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.csp__shape-btn:hover {
  background: var(--surface-muted);
  border-color: var(--border-strong);
}

.csp__shape-btn--active {
  border-color: var(--primary);
  color: var(--primary);
  background: var(--primary-soft);
}

.csp__select {
  flex: 1;
  height: 28px;
  padding: 0 8px;
  font-size: 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-muted);
  color: var(--base-text);
}

.csp__range {
  flex: 1;
  min-width: 0;
}

.csp__input-tiny {
  width: 48px;
  height: 28px;
  padding: 0 4px;
  font-size: 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-muted);
  color: var(--base-text);
  text-align: center;
}

.csp__mode-toggle {
  display: flex;
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
}

.csp__mode-btn {
  flex: 1;
  height: 28px;
  border: none;
  background: var(--surface-muted);
  font-size: 11px;
  color: var(--text-subtle);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.csp__mode-btn:not(:last-child) {
  border-right: 1px solid var(--border);
}

.csp__mode-btn--active {
  background: var(--primary-soft);
  color: var(--primary);
  font-weight: 600;
}

.csp__json-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.csp__json-label {
  font-size: 10px;
  color: var(--text-subtle);
}

.csp__textarea {
  width: 100%;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-muted);
  color: var(--base-text);
  padding: 6px 8px;
  resize: vertical;
}

.csp__hint {
  font-size: 10px;
  color: var(--text-subtle);
}

.csp__validation {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 8px;
  border: 1px solid var(--danger);
  border-radius: 6px;
  background: color-mix(in srgb, var(--danger) 6%, transparent);
}

.csp__validation-item {
  font-size: 11px;
  color: var(--danger);
}
</style>
