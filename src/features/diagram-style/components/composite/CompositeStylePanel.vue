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
import type { OutlineSegment, ScaleSlice } from '@/domain/attrs/notationAttrs'
import type {
  DiagramStyle,
  CustomProperty,
  CompositeSerializedCComponent,
  StylePropertyBindingGroup,
  InsetScaleSides,
} from '@/domain/attrs/notationAttrs'
import { parseScaleSliceFromAttrs } from '@/types/shapes'
import {
  invalidateNodeShapeScaleSliceCatalog,
  rememberNodeShapeAttrs,
  resolveCustomScaleSlice,
} from '@/utils/resolveCustomScaleSlice'
import { DEFAULT_CORNER_CUT_PX } from '@/utils/diagramShapes'
import {
  getAllComponentPresets,
  getUserComponentPresets,
  saveUserComponentPreset,
  deleteUserComponentPreset,
  subscribeStylePresetsChanges,
} from '@/features/diagram-style/styles/stylePresets'

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
const lockTransform = ref(false)
const cornerRadius = ref(0)
const cornerCut = ref(DEFAULT_CORNER_CUT_PX)
const contentInset = ref<InsetSides>({ top: 0, right: 0, bottom: 0, left: 0 })
const contentInsetScale = ref<InsetScaleSides>({})

// Fill & Stroke
const fillColor = ref('#ffffff')
const fillOpacity = ref(1)
const strokeColor = ref('#333333')
const strokeOpacity = ref(1)
const strokeWidth = ref(1)
const opacity = ref(1)
const labelPlacement = ref<'center' | 'top' | 'bottom' | 'left' | 'right'>('center')
const labelGap = ref(4)

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
watch(
  catalogShapes,
  (shapes) => {
    rememberNodeShapeAttrs(shapes)
    if (customShapeId.value && !customScaleSlice.value && compositeShapeType.value === 'custom') {
      const resolved = resolveCustomScaleSlice({ customShapeId: customShapeId.value })
      if (resolved) {
        customScaleSlice.value = resolved
        emitStyle()
      }
    }
  },
  { immediate: true, deep: true }
)
function ensureCatalogShapesLoaded() {
  void fetchNodeShapes({ size: 200 })
}
function handleNodeShapesChanged() {
  invalidateNodeShapeScaleSliceCatalog()
  void fetchNodeShapes({ size: 200 })
}
const presetVersion = ref(0)
const stopStylePresetUpdates = subscribeStylePresetsChanges(() => {
  presetVersion.value += 1
})
onMounted(() => {
  window.addEventListener('warchi-node-shapes-changed', handleNodeShapesChanged)
})
onBeforeUnmount(() => {
  window.removeEventListener('warchi-node-shapes-changed', handleNodeShapesChanged)
  stopStylePresetUpdates()
})
const customShapeId = ref<string | null>(null)
const customOutline = ref<OutlineSegment[] | undefined>(undefined)
const customScaleSlice = ref<ScaleSlice | undefined>(undefined)

function handleCustomShapeSelect(shapeId: string) {
  const shape = catalogShapes.value.find((s) => s.id === shapeId)
  if (!shape) return
  customShapeId.value = shapeId
  try {
    customOutline.value = shape.outline ? (JSON.parse(shape.outline) as OutlineSegment[]) : undefined
  } catch {
    customOutline.value = undefined
  }
  customScaleSlice.value = parseScaleSliceFromAttrs(shape.attrs) ?? undefined
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
  label: true,
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
  lockTransform.value = ds.lockTransform === true
  cornerRadius.value = ds.cornerRadius ?? 0
  cornerCut.value = ds.cornerCut ?? DEFAULT_CORNER_CUT_PX
  contentInset.value = toInsetSides(ds.contentInset, 0)
  contentInsetScale.value = { ...(ds.contentInsetScale ?? {}) }

  fillColor.value = ds.fillColor ?? '#ffffff'
  fillOpacity.value = ds.fillOpacity ?? 1
  strokeColor.value = ds.strokeColor ?? '#333333'
  strokeOpacity.value = ds.strokeOpacity ?? 1
  strokeWidth.value = ds.strokeWidth ?? 1
  opacity.value = ds.opacity ?? 1
  labelPlacement.value =
    ds.labelPlacement === 'top' ||
    ds.labelPlacement === 'bottom' ||
    ds.labelPlacement === 'left' ||
    ds.labelPlacement === 'right'
      ? ds.labelPlacement
      : 'center'
  labelGap.value = ds.labelGap ?? 4

  portsTop.value = ds.portsTop ?? 0
  portsBottom.value = ds.portsBottom ?? 0
  portsLeft.value = ds.portsLeft ?? 0
  portsRight.value = ds.portsRight ?? 0

  customShapeId.value = ds.customShapeId ?? null
  customOutline.value = ds.customOutline ?? undefined
  customScaleSlice.value =
    ds.customScaleSlice ?? resolveCustomScaleSlice(ds) ?? undefined
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
      ? {
          customShapeId: customShapeId.value,
          customOutline: customOutline.value,
          ...(customScaleSlice.value ? { customScaleSlice: customScaleSlice.value } : {}),
        }
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
    ...(compositeShapeType.value === 'beveled-rectangle'
      ? { cornerCut: cornerCut.value }
      : {}),
    opacity: opacity.value,
    width: nodeWidth.value,
    height: nodeHeight.value,
    ...(lockTransform.value ? { lockTransform: true } : {}),
    contentInset: insetToPlain(contentInset.value),
    ...(contentInsetScale.value.top ||
    contentInsetScale.value.right ||
    contentInsetScale.value.bottom ||
    contentInsetScale.value.left
      ? { contentInsetScale: { ...contentInsetScale.value } }
      : {}),
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
    labelPlacement: labelPlacement.value,
    ...(labelPlacement.value !== 'center' ? { labelGap: labelGap.value } : {}),
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

const selectedComponentPreset = ref('custom')
const showSavePresetForm = ref(false)
const newPresetName = ref('')
const userComponentPresets = computed(() => {
  void presetVersion.value
  return getUserComponentPresets()
})
const builtInComponentPresets = computed(() => {
  void presetVersion.value
  return getAllComponentPresets().filter((preset) => !preset._isUser)
})

function openSavePresetForm() {
  newPresetName.value = ''
  showSavePresetForm.value = true
}

function cancelSavePreset() {
  showSavePresetForm.value = false
  newPresetName.value = ''
}

function confirmSavePreset() {
  const label = newPresetName.value.trim()
  if (!label) return
  const name = `user_${Date.now()}`
  const style: DiagramStyle = {
    fillColor: fillColor.value,
    fillOpacity: fillOpacity.value,
    strokeColor: strokeColor.value,
    strokeOpacity: strokeOpacity.value,
    strokeWidth: strokeWidth.value,
    cornerRadius: cornerRadius.value,
    ...(compositeShapeType.value === 'beveled-rectangle' ? { cornerCut: cornerCut.value } : {}),
    opacity: opacity.value,
    width: nodeWidth.value,
    height: nodeHeight.value,
    ...(lockTransform.value ? { lockTransform: true } : {}),
    contentInset: insetToPlain(contentInset.value),
    ...(contentInsetScale.value.top ||
    contentInsetScale.value.right ||
    contentInsetScale.value.bottom ||
    contentInsetScale.value.left
      ? { contentInsetScale: { ...contentInsetScale.value } }
      : {}),
    labelPlacement: labelPlacement.value,
    ...(labelPlacement.value !== 'center' ? { labelGap: labelGap.value } : {}),
  }
  saveUserComponentPreset({ name, label, style })
  selectedComponentPreset.value = name
  presetVersion.value += 1
  showSavePresetForm.value = false
  newPresetName.value = ''
}

function applyComponentPreset(presetName: string) {
  const preset = getAllComponentPresets().find((item) => item.name === presetName)
  if (!preset) return
  const style = preset.style
  if (typeof style.width === 'number') nodeWidth.value = style.width
  if (typeof style.height === 'number') nodeHeight.value = style.height
  lockTransform.value = style.lockTransform === true
  if (style.contentInset !== undefined) {
    contentInset.value = toInsetSides(style.contentInset, 0)
    contentInsetScale.value = { ...(style.contentInsetScale ?? {}) }
  }
  if (
    style.labelPlacement === 'top' ||
    style.labelPlacement === 'bottom' ||
    style.labelPlacement === 'left' ||
    style.labelPlacement === 'right' ||
    style.labelPlacement === 'center' ||
    style.labelPlacement === 'auto'
  ) {
    labelPlacement.value = style.labelPlacement === 'auto' ? 'center' : style.labelPlacement
  }
  if (typeof style.labelGap === 'number' && Number.isFinite(style.labelGap)) {
    labelGap.value = style.labelGap
  }
  if (style.fillColor) fillColor.value = style.fillColor
  if (style.fillOpacity !== undefined) fillOpacity.value = style.fillOpacity
  if (style.strokeColor) strokeColor.value = style.strokeColor
  if (style.strokeOpacity !== undefined) strokeOpacity.value = style.strokeOpacity
  if (typeof style.strokeWidth === 'number') strokeWidth.value = style.strokeWidth
  if (typeof style.cornerRadius === 'number') cornerRadius.value = style.cornerRadius
  if (typeof style.opacity === 'number') opacity.value = style.opacity
  emitStyle()
}

function handleDeleteUserPreset(presetName: string) {
  deleteUserComponentPreset(presetName)
  if (selectedComponentPreset.value === presetName) selectedComponentPreset.value = 'custom'
  presetVersion.value += 1
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

function handleLabelPlacementChange(value: string) {
  labelPlacement.value =
    value === 'top' || value === 'bottom' || value === 'left' || value === 'right'
      ? value
      : 'center'
  emitStyle()
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
    <div class="csp__preset">
      <select
        class="form-select form-select--sm"
        :value="selectedComponentPreset"
        @change="
          applyComponentPreset(($event.target as HTMLSelectElement).value);
          selectedComponentPreset = ($event.target as HTMLSelectElement).value
        "
      >
        <option value="custom">{{ t('nodeStyle.customPreset') }}</option>
        <optgroup :label="t('nodeStyle.builtInPresets')">
          <option
            v-for="preset in builtInComponentPresets"
            :key="preset.name"
            :value="preset.name"
          >{{ preset.label }}</option>
        </optgroup>
        <optgroup v-if="userComponentPresets.length" :label="t('nodeStyle.myPresets')">
          <option
            v-for="preset in userComponentPresets"
            :key="preset.name"
            :value="preset.name"
          >{{ preset.label }}</option>
        </optgroup>
      </select>
      <button type="button" class="csp__preset-btn" :title="t('nodeStyle.saveAsPreset')" @click="openSavePresetForm">
        <UiIcon name="bookmark_add" />
      </button>
      <button
        v-if="userComponentPresets.some((preset) => preset.name === selectedComponentPreset)"
        type="button"
        class="csp__preset-btn csp__preset-btn--danger"
        :title="t('nodeStyle.deletePreset')"
        @click="handleDeleteUserPreset(selectedComponentPreset)"
      >
        <UiIcon name="delete" />
      </button>
    </div>
    <div v-if="showSavePresetForm" class="csp__save-form">
      <input
        v-model="newPresetName"
        class="form-input form-input--sm"
        :placeholder="t('nodeStyle.presetNamePlaceholder')"
        @keyup.enter="confirmSavePreset"
        @keyup.escape="cancelSavePreset"
      >
      <button type="button" class="csp__preset-btn" @click="confirmSavePreset">
        <UiIcon name="check" />
      </button>
      <button type="button" class="csp__preset-btn" @click="cancelSavePreset">
        <UiIcon name="close" />
      </button>
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
      <LabeledFieldRow :label="t('nodeStyle.lockTransform')">
        <ToggleSwitch
          :model-value="lockTransform"
          @update:model-value="
            lockTransform = $event;
            emitStyle()
          "
        />
      </LabeledFieldRow>
      <p class="csp__hint">{{ t('nodeStyle.lockTransformHint') }}</p>
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
          v-if="compositeShapeType === 'rectangle'"
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
        <LabeledNumberInput
          v-if="compositeShapeType === 'beveled-rectangle'"
          :label="t('nodeStyle.cornerCut')"
          :model-value="cornerCut"
          :min="0"
          :max="80"
          :step="1"
          @update:model-value="
            cornerCut = Number($event);
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
        :scale-value="contentInsetScale"
        :min="0"
        :max="100"
        :step="1"
        @update:model-value="
          contentInset = $event;
          emitStyle()
        "
        @update:scale-value="
          contentInsetScale = $event;
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

    <StyleSection
      :title="t('nodeStyle.label')"
      :open="sectionOpen.label"
      @toggle="toggleSection('label')"
    >
      <LabeledFieldRow :label="t('nodeStyle.position')">
        <select
          class="form-select form-select--sm"
          :value="labelPlacement"
          @change="handleLabelPlacementChange(($event.target as HTMLSelectElement).value)"
        >
          <option value="center">{{ t('nodeStyle.labelPlacementInside') }}</option>
          <option value="top">{{ t('nodeStyle.positionTop') }}</option>
          <option value="bottom">{{ t('nodeStyle.positionBottom') }}</option>
          <option value="left">{{ t('nodeStyle.positionLeft') }}</option>
          <option value="right">{{ t('nodeStyle.positionRight') }}</option>
        </select>
      </LabeledFieldRow>
      <LabeledNumberInput
        v-if="labelPlacement !== 'center'"
        :label="t('nodeStyle.gap')"
        :model-value="labelGap"
        :min="0"
        :max="80"
        :step="1"
        @update:model-value="
          labelGap = Number($event);
          emitStyle()
        "
      />
      <p class="csp__hint">{{ t('nodeStyle.labelPlacementCompositeHint') }}</p>
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
          :label-placement="labelPlacement"
          :label-gap="labelGap"
          :shape-type="compositeShapeType"
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

.csp__preset,
.csp__save-form {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.csp__preset .form-select,
.csp__save-form .form-input {
  flex: 1;
  min-width: 0;
}

.csp__preset-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}

.csp__preset-btn:hover {
  background: var(--surface-strong);
  color: var(--base-text);
}

.csp__preset-btn--danger:hover {
  background: var(--danger-soft);
  color: var(--danger);
}

.csp__preset-btn :deep(.ui-icon) {
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
