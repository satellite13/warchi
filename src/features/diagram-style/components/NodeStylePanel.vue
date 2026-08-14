<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from "vue";
import { useI18n } from "vue-i18n";
import { TextLabel, CustomShapeNode } from "@ngroznykh/papirus";
import type {
  ArrowMarkerConfig,
  InteractionManager,
  DiagramRenderer,
  Node,
  Edge,
  TextStyle,
} from "@ngroznykh/papirus";
import SketchColorField from "./SketchColorField.vue";
import ColorWithAlphaField from "./ColorWithAlphaField.vue";
import EdgeStyleSection from "./EdgeStyleSection.vue";
import LabelStyleSection from "./LabelStyleSection.vue";
import LabeledFieldRow from "./LabeledFieldRow.vue";
import LabeledNumberInput from "./LabeledNumberInput.vue";
import NodeStyleSection from "./NodeStyleSection.vue";
import LazyIconImg from "@/components/forms/LazyIconImg.vue";
import SearchableSelect from "@/components/forms/SearchableSelect.vue";
import InsetSidesInput from "@/components/forms/InsetSidesInput.vue";
import ToggleSwitch from "@/components/forms/ToggleSwitch.vue";
import type {
  DiagramStyle,
  CustomProperty,
  CompositeSerializedCComponent,
  StylePropertyBindingGroup,
  InsetScaleSides,
} from "@/domain/attrs/notationAttrs";
import { applyContentInsetFromStyle } from "@/features/diagram-style/utils/applyContentInsetFromStyle";
import { parseScaleSliceFromAttrs } from "@/types/shapes";
import {
  invalidateNodeShapeScaleSliceCatalog,
  rememberNodeShapeAttrs,
  resolveCustomScaleSlice,
} from "@/utils/resolveCustomScaleSlice";
import { useNodeShapes } from "@/composables/useNodeShapes";
import { ICON_SELECT_MIN_SEARCH_LENGTH } from "@/config/iconOptions";
import { useLibraryIcons } from "@/composables/useLibraryIcons";
import {
  getAllComponentPresets,
  getAllRelationPresets,
  saveUserComponentPreset,
  saveUserRelationPreset,
  deleteUserComponentPreset,
  deleteUserRelationPreset,
  type ComponentStylePreset,
  type RelationStylePreset
} from "@/features/diagram-style/styles/stylePresets";
import {
  normalizeIconPlacement,
  toInsetSides,
  toInsetNumber,
  insetToPlain,
  setLabelSpacing,
  type IconPlacement,
  type InsetSides,
} from "../utils/styleHelpers";
import { useNodeStyleState, type NodeShape } from "../composables/useNodeStyleState";
import { useEdgeStyleState } from "../composables/useEdgeStyleState";
import type {
  ExtendedEdgeProps,
  ExtendedEdgeStyle,
  ExtendedNodeProps,
  ExtendedNodeStyle,
  ExtendedTextStyle,
} from "../types/papirusExtended";
import A5BindingsEditor from "./composite/A5BindingsEditor.vue";
import CompositeTreeEditor from "./composite/CompositeTreeEditor.vue";
import CompositeLivePreview from "./composite/CompositeLivePreview.vue";
import { validateCompositeDiagramStyle } from "@/features/notations/utils/validationIssues";
import { createDefaultCompositeContent } from "@/features/diagram-style/utils/compositeBindings";
import { diagramShapeFactories, DEFAULT_CORNER_CUT_PX } from "@/utils/diagramShapes";

const props = defineProps<{
  selectedElementId: string | null;
  interactionManager: InteractionManager | null;
  renderer: DiagramRenderer | null;
  canRestoreStyle?: boolean;
  currentDiagramStyle?: DiagramStyle;
  componentProperties?: CustomProperty[];
  nodeTypeProperties?: CustomProperty[];
  mode?: 'default' | 'composite-only';
}>();

type EdgeKind = "straight" | "polyline" | "editable-polyline" | "bezier";
type MarkerKind = "none" | "arrow" | "open" | "diamond" | "circle" | "square" | "stealth";

const emit = defineEmits<{
  (e: "style-change", style: DiagramStyle): void;
  (e: "restore-style"): void;
}>();
const { t } = useI18n();
const { selectOptions: iconSelectOptions, markupFor, ensureLoaded: ensureLibraryIcons } = useLibraryIcons();
void ensureLibraryIcons();
const panelMode = computed(() => props.mode ?? 'default');

// NodeShape type imported from useNodeStyleState composable

function emitNodeStyle() {
  emit("style-change", buildNodeStyle());
}

function emitEdgeStyle() {
  emit("style-change", buildEdgeStyle());
}

// Determine if the selected element is a node or edge
const elementType = computed<"node" | "edge" | null>(() => {
  if (!props.selectedElementId || !props.renderer) return null;
  if (props.renderer.getEdge(props.selectedElementId)) return "edge";
  if (props.renderer.getNode(props.selectedElementId)) return "node";
  return null;
});

// Reactivity trigger for localStorage-based user presets
const presetVersion = ref(0);

// Load style presets (built-in + user)
const componentStylePresets = computed<ComponentStylePreset[]>(() => {
  void presetVersion.value; // dependency for reactivity
  return getAllComponentPresets();
});
const relationStylePresets = computed<RelationStylePreset[]>(() => {
  void presetVersion.value;
  return getAllRelationPresets();
});

const builtInComponentPresets = computed(() => componentStylePresets.value.filter(p => !p._isUser));
const userComponentPresets = computed(() => componentStylePresets.value.filter(p => p._isUser));
const builtInRelationPresets = computed(() => relationStylePresets.value.filter(p => !p._isUser));
const userRelationPresets = computed(() => relationStylePresets.value.filter(p => p._isUser));

// Current selected preset
const selectedComponentPreset = ref("custom");
const selectedRelationPreset = ref("custom");

// Save-as-preset state
const showSavePresetForm = ref(false);
const newPresetName = ref("");

function openSavePresetForm() {
  newPresetName.value = "";
  showSavePresetForm.value = true;
}

function cancelSavePreset() {
  showSavePresetForm.value = false;
  newPresetName.value = "";
}

function confirmSavePreset() {
  const label = newPresetName.value.trim();
  if (!label) return;

  const name = `user_${Date.now()}`;

  if (elementType.value === "edge") {
    const style: import("@/domain/attrs/notationAttrs").DiagramStyle = {
      strokeColor: edgeStrokeColor.value,
      strokeOpacity: edgeStrokeOpacity.value,
      strokeWidth: edgeStrokeWidth.value,
      opacity: edgeOpacity.value,
      edgeType: edgeType.value,
      startMarkerType: edgeStartMarker.value,
      endMarkerType: edgeEndMarker.value,
      labelColor: edgeLabelColor.value,
      labelOpacity: edgeLabelOpacity.value,
      labelFontSize: edgeLabelFontSize.value,
      labelInset: insetToPlain(edgeLabelInset.value),
      edgeLabelOffset: edgeLabelOffset.value,
      edgeLabelLineGap: edgeLabelLineGap.value,
      labelBgColor: edgeLabelBgColor.value,
      labelBgOpacity: edgeLabelBgOpacity.value,
      labelBgBorderRadius: edgeLabelBgBorderRadius.value,
      startMarkerSize: edgeStartMarkerSize.value,
      startMarkerFillColor: edgeStartMarkerFillColor.value,
      startMarkerFillOpacity: edgeStartMarkerFillOpacity.value,
      endMarkerSize: edgeEndMarkerSize.value,
      endMarkerFillColor: edgeEndMarkerFillColor.value,
      endMarkerFillOpacity: edgeEndMarkerFillOpacity.value
    };
    const edgeTemplate = edgeLabelTemplate.value.trim();
    if (edgeTemplate) {
      style.labelTemplate = edgeTemplate;
    }
    if (edgeLineStyle.value === "dashed") {
      const pattern = edgeLineDashPattern.value.trim() || "8,4";
      style.lineDash = pattern.split(",").map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
    }
    saveUserRelationPreset({ name, label, style });
    selectedRelationPreset.value = name;
  } else {
    const style: import("@/domain/attrs/notationAttrs").DiagramStyle = {
      nodeShape: nodeShape.value,
      fillColor: fillColor.value,
      fillOpacity: fillOpacity.value,
      strokeColor: strokeColor.value,
      strokeOpacity: strokeOpacity.value,
      strokeWidth: strokeWidth.value,
      cornerRadius: cornerRadius.value,
      ...(nodeShape.value === "beveled-rectangle" ||
      (nodeShape.value === "composite" && compositeShapeType.value === "beveled-rectangle")
        ? { cornerCut: cornerCut.value }
        : {}),
      opacity: opacity.value,
      labelColor: labelColor.value,
      labelOpacity: labelOpacity.value,
      labelFontSize: labelFontSize.value,
      labelInset: insetToPlain(labelInset.value),
      labelAlign: labelAlign.value,
      labelVerticalAlign: labelVerticalAlign.value,
      showLabel: showLabel.value,
      width: nodeWidth.value,
      height: nodeHeight.value,
      contentInset: insetToPlain(contentInset.value),
      ...(contentInsetScale.value.top ||
      contentInsetScale.value.right ||
      contentInsetScale.value.bottom ||
      contentInsetScale.value.left
        ? { contentInsetScale: { ...contentInsetScale.value } }
        : {}),
      portsTop: nodePortsTop.value,
      portsBottom: nodePortsBottom.value,
      portsLeft: nodePortsLeft.value,
      portsRight: nodePortsRight.value,
      ...(iconName.value
        ? {
            iconName: iconName.value,
            iconPlacement: iconPlacement.value,
            iconWidth: iconWidth.value,
            iconHeight: iconHeight.value,
            iconInset: iconInset.value,
            iconStrokeColor: iconStrokeColor.value,
            iconFillColor: iconFillColor.value
          }
        : {})
    };
    if (lineStyle.value === "dashed") {
      const pattern = lineDashPattern.value.trim() || "8,4";
      style.lineDash = pattern.split(",").map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
    }
    saveUserComponentPreset({ name, label, style });
    selectedComponentPreset.value = name;
  }

  presetVersion.value++;
  showSavePresetForm.value = false;
  newPresetName.value = "";
}

function handleDeleteUserPreset(presetName: string, kind: "component" | "relation") {
  if (kind === "component") {
    deleteUserComponentPreset(presetName);
    if (selectedComponentPreset.value === presetName) {
      selectedComponentPreset.value = "custom";
    }
  } else {
    deleteUserRelationPreset(presetName);
    if (selectedRelationPreset.value === presetName) {
      selectedRelationPreset.value = "custom";
    }
  }
  presetVersion.value++;
}

// Apply component preset
function applyComponentPreset(presetName: string) {
  const preset = componentStylePresets.value.find(p => p.name === presetName);
  if (!preset) return;
  
  const style = preset.style;
  
  // Update all node style refs (preserve current width/height if not in preset)
  nodeShape.value =
    style.nodeShape === "custom"
      ? "custom"
      : NODE_SHAPE_OPTIONS.some((option) => option.value === style.nodeShape)
        ? (style.nodeShape as NodeShape)
        : "rectangle";
  if (nodeShape.value === "custom") {
    customOutlineRef.value = style.customOutline ?? undefined;
    customShapeIdRef.value = style.customShapeId ?? null;
    customScaleSliceRef.value =
      style.customScaleSlice ?? resolveCustomScaleSlice(style) ?? undefined;
  } else {
    customOutlineRef.value = undefined;
    customShapeIdRef.value = null;
    customScaleSliceRef.value = undefined;
  }
  fillColor.value = style.fillColor ?? "#ffffff";
  fillOpacity.value = style.fillOpacity ?? 1;
  strokeColor.value = style.strokeColor ?? "#333333";
  strokeOpacity.value = style.strokeOpacity ?? 1;
  strokeWidth.value = style.strokeWidth ?? 2;
  cornerRadius.value = style.cornerRadius ?? 0;
  cornerCut.value = style.cornerCut ?? DEFAULT_CORNER_CUT_PX;
  opacity.value = style.opacity ?? 1;
  labelColor.value = style.labelColor ?? "#333333";
  labelOpacity.value = style.labelOpacity ?? 1;
  labelFontSize.value = style.labelFontSize ?? 14;
  labelInset.value = toInsetSides(style.labelInset, 8);
  labelVerticalAlign.value = (style.labelVerticalAlign as "top" | "middle" | "bottom") ?? "middle";
  showLabel.value = style.showLabel !== false;
  // Only update dimensions if explicitly specified in preset
  if (style.width !== undefined) nodeWidth.value = style.width;
  if (style.height !== undefined) nodeHeight.value = style.height;
  contentInset.value = toInsetSides(style.contentInset, 0);
  contentInsetScale.value = { ...(style.contentInsetScale ?? {}) };
  nodePortsTop.value = style.portsTop ?? 3;
  nodePortsBottom.value = style.portsBottom ?? 3;
  nodePortsLeft.value = style.portsLeft ?? 1;
  nodePortsRight.value = style.portsRight ?? 1;
  
  if (style.lineDash && style.lineDash.length > 0) {
    lineStyle.value = "dashed";
    lineDashPattern.value = style.lineDash.join(",");
  } else {
    lineStyle.value = "solid";
    lineDashPattern.value = "8,4";
  }
  
  if (style.iconName) {
    iconName.value = style.iconName;
    iconPlacement.value = normalizeIconPlacement(style.iconPlacement, "top-left");
    iconWidth.value = style.iconWidth ?? 20;
    iconHeight.value = style.iconHeight ?? 20;
    iconInset.value = toInsetNumber(
      style.iconInset ?? style.iconPadding ?? style.iconMargin ?? style.iconGap,
      6
    );
    iconStrokeColor.value = style.iconStrokeColor ?? "#000000";
    iconFillColor.value = style.iconFillColor ?? "#000000";
  } else {
    iconName.value = "";
  }
  
  // Apply to node and emit
  applyNodeStyle({
    fillColor: fillColor.value,
    fillOpacity: fillOpacity.value,
    strokeColor: strokeColor.value,
    strokeOpacity: strokeOpacity.value,
    strokeWidth: strokeWidth.value,
    opacity: opacity.value,
    lineDash: style.lineDash
  });
  
  // Apply label properties and dimensions
  if (!props.selectedElementId || !props.interactionManager) return;
  props.interactionManager.changeNodeProperties(props.selectedElementId, (node) => {
    if (!showLabel.value) {
      node.label = undefined;
    } else if (node.label) {
      node.label.style = textStyleWith(node.label.style, {
        color: labelColor.value,
        fontSize: labelFontSize.value,
        opacity: labelOpacity.value,
        verticalAlign: labelVerticalAlign.value
      });
      setLabelSpacing(node.label, { inset: insetToPlain(labelInset.value) });
    }
    const nodeRuntime = node as unknown as ExtendedNodeProps;
    applyContentInsetFromStyle(nodeRuntime, {
      contentInset: insetToPlain(contentInset.value),
      contentInsetScale: contentInsetScale.value,
      width: nodeWidth.value,
      height: nodeHeight.value,
    });
    
    // Apply dimensions and corner radius
    node.width = nodeWidth.value;
    node.height = nodeHeight.value;
    nodeRuntime.cornerRadius = cornerRadius.value;
    nodeRuntime.anchorPoints = {
      top: nodePortsTop.value,
      bottom: nodePortsBottom.value,
      left: nodePortsLeft.value,
      right: nodePortsRight.value
    };
    
    if (iconName.value) {
      const nodeRuntime = node as unknown as ExtendedNodeProps;
      nodeRuntime.icon = iconConfig();
    } else {
      const nodeRuntime = node as unknown as ExtendedNodeProps;
      nodeRuntime.icon = undefined;
    }
  });
  
  emitNodeStyle();
}

// Apply edge preset
function applyEdgePreset(presetName: string) {
  const preset = relationStylePresets.value.find(p => p.name === presetName);
  if (!preset) return;
  
  const style = preset.style;
  
  // Update all edge style refs
  edgeStrokeColor.value = style.strokeColor ?? "#666666";
  edgeStrokeOpacity.value = style.strokeOpacity ?? 1;
  edgeStrokeWidth.value = style.strokeWidth ?? 2;
  edgeOpacity.value = style.opacity ?? 1;
  edgeType.value = toEdgeKind(style.edgeType, "polyline");
  edgeStartMarker.value = toMarkerKind(style.startMarkerType, "none");
  edgeEndMarker.value = toMarkerKind(style.endMarkerType, "open");
  edgeLabelColor.value = style.labelColor ?? "#333333";
  edgeLabelOpacity.value = style.labelOpacity ?? 1;
  edgeLabelFontSize.value = style.labelFontSize ?? 14;
  edgeLabelInset.value = toInsetSides(style.labelInset, 8);
  edgeLabelOffset.value = style.edgeLabelOffset ?? edgeLabelOffset.value;
  edgeLabelLineGap.value = style.edgeLabelLineGap ?? false;
  edgeLabelBgColor.value = style.labelBgColor ?? "#ffffff";
  edgeLabelBgOpacity.value = style.labelBgOpacity ?? 1;
  edgeLabelBgBorderRadius.value = style.labelBgBorderRadius ?? 2;
  
  if (style.lineDash && style.lineDash.length > 0) {
    edgeLineStyle.value = "dashed";
    edgeLineDashPattern.value = style.lineDash.join(",");
  } else {
    edgeLineStyle.value = "solid";
    edgeLineDashPattern.value = "8,4";
  }
  
  // Marker sizes
  edgeStartMarkerSize.value = style.startMarkerSize ?? 12;
  edgeStartMarkerFillColor.value = style.startMarkerFillColor ?? "#000000";
  edgeStartMarkerFillOpacity.value = style.startMarkerFillOpacity ?? 1;
  edgeEndMarkerSize.value = style.endMarkerSize ?? 12;
  edgeEndMarkerFillColor.value = style.endMarkerFillColor ?? "#000000";
  edgeEndMarkerFillOpacity.value = style.endMarkerFillOpacity ?? 1;
  
  // Apply to edge and emit
  applyEdgeStyle({
    strokeColor: edgeStrokeColor.value,
    strokeOpacity: edgeStrokeOpacity.value,
    strokeWidth: edgeStrokeWidth.value,
    opacity: edgeOpacity.value,
    lineDash: style.lineDash
  });
  
  if (!props.selectedElementId || !props.interactionManager) return;
  props.interactionManager.changeEdgeProperties(props.selectedElementId, (edge) => {
    edge.type = edgeType.value;
    edge.startMarker = buildMarkerConfig(edgeStartMarker.value, edgeStartMarkerSize.value, edgeStartMarkerFillColor.value, edgeStartMarkerFillOpacity.value);
    edge.endMarker = buildMarkerConfig(edgeEndMarker.value, edgeEndMarkerSize.value, edgeEndMarkerFillColor.value, edgeEndMarkerFillOpacity.value);
    if (edge.label) {
      edge.label.style = textStyleWith(edge.label.style, {
        color: edgeLabelColor.value,
        fontSize: edgeLabelFontSize.value,
        opacity: edgeLabelOpacity.value
      });
      setLabelSpacing(edge.label, { inset: insetToPlain(edgeLabelInset.value) });
    }
    edge.labelOffset = edgeLabelOffset.value;
    edge.labelLineGap = edgeLabelLineGap.value;
    const edgeRuntime = edge as unknown as ExtendedEdgeProps;
    edgeRuntime.labelBackground = {
      color: edgeLabelBgColor.value,
      opacity: edgeLabelBgOpacity.value,
      borderRadius: edgeLabelBgBorderRadius.value
    };
  });
  
  emitEdgeStyle();
}

const NODE_SHAPE_OPTIONS: ReadonlyArray<{ value: NodeShape; labelKey: string }> = [
  { value: "rectangle", labelKey: "nodeStyle.shapeRectangle" },
  { value: "beveled-rectangle", labelKey: "nodeStyle.shapeBeveledRectangle" },
  { value: "diamond", labelKey: "nodeStyle.shapeDiamond" },
  { value: "circle", labelKey: "nodeStyle.shapeCircle" },
  { value: "trapezoid", labelKey: "nodeStyle.shapeTrapezoid" },
  { value: "slanted-rectangle", labelKey: "nodeStyle.shapeSlantedRectangle" },
  { value: "custom", labelKey: "nodeStyle.customShape" },
  { value: "composite", labelKey: "nodeStyle.shapeComposite" }
];

const visibleNodeShapeOptions = computed(() =>
  panelMode.value === 'composite-only'
    ? NODE_SHAPE_OPTIONS.filter((shape) => shape.value === 'composite')
    : NODE_SHAPE_OPTIONS.filter((shape) => shape.value !== 'composite')
);

const showCompositeEditor = computed(
  () => panelMode.value === 'composite-only' && nodeShape.value === 'composite',
);

const panelMounted = ref(true);
const { list: catalogShapes, fetchList: fetchNodeShapes } = useNodeShapes({
  beforeUpdate: () => panelMounted.value
});
function ensureCatalogShapesLoaded() {
  void fetchNodeShapes({ size: 200 });
}
function handleNodeShapesChanged() {
  invalidateNodeShapeScaleSliceCatalog()
  void fetchNodeShapes({ size: 200 });
}
onMounted(() => {
  window.addEventListener('warchi-node-shapes-changed', handleNodeShapesChanged);
});
onBeforeUnmount(() => {
  panelMounted.value = false;
  window.removeEventListener('warchi-node-shapes-changed', handleNodeShapesChanged);
});
const catalogShapeOptions = computed(() =>
  catalogShapes.value.map((s) => ({ id: s.id, label: s.name }))
)

watch(
  catalogShapes,
  (shapes) => {
    rememberNodeShapeAttrs(shapes)
    if (
      customShapeIdRef.value &&
      !customScaleSliceRef.value &&
      (nodeShape.value === "custom" ||
        (nodeShape.value === "composite" && compositeShapeType.value === "custom"))
    ) {
      const resolved = resolveCustomScaleSlice({
        customShapeId: customShapeIdRef.value,
      })
      if (resolved) {
        customScaleSliceRef.value = resolved
        emitNodeStyle()
      }
    }
  },
  { immediate: true, deep: true }
)

const EDGE_TYPE_OPTIONS = computed(() => ([
  { v: "straight", l: t("diagram.linkTypeStraight"), icon: "remove" },
  { v: "polyline", l: t("diagram.linkTypePolyline"), icon: "timeline" },
  { v: "editable-polyline", l: t("diagram.linkTypeEditablePolyline"), icon: "polyline" },
  { v: "bezier", l: t("diagram.linkTypeBezier"), icon: "line_curve" }
] as const));

function toEdgeKind(value: unknown, fallback: EdgeKind): EdgeKind {
  return value === "straight" ||
    value === "polyline" ||
    value === "editable-polyline" ||
    value === "bezier"
    ? value
    : fallback;
}

function toMarkerKind(value: unknown, fallback: MarkerKind): MarkerKind {
  return value === "none" ||
    value === "arrow" ||
    value === "open" ||
    value === "diamond" ||
    value === "circle" ||
    value === "square" ||
    value === "stealth"
    ? value
    : fallback;
}

function textStyleWith(
  current: unknown,
  updates: ExtendedTextStyle
): TextStyle {
  return { ...((current ?? {}) as ExtendedTextStyle), ...updates } as TextStyle
}

function iconConfig() {
  return {
    source: iconName.value ? markupFor(iconName.value) : '',
    placement: iconPlacement.value,
    width: iconWidth.value,
    height: iconHeight.value,
    fit: "contain",
    inset: iconInset.value,
    strokeColor: iconStrokeColor.value,
    fillColor: iconFillColor.value
  };
}

// --- Node style state (from composable) ---
const {
  iconName, iconPlacement, iconWidth, iconHeight, iconInset, iconStrokeColor, iconFillColor,
  nodeShape, label, fillColor, fillOpacity, strokeColor, strokeOpacity, strokeWidth,
  cornerRadius, cornerCut, opacity, lineStyle, lineDashPattern, labelTemplate, showLabel, labelColor, labelOpacity,
  labelFontSize, labelInset, labelAlign, labelVerticalAlign, nodeWidth, nodeHeight, contentInset,
  contentInsetScale,
  nodePortsTop, nodePortsBottom, nodePortsLeft, nodePortsRight,
  customOutlineRef, customShapeIdRef, customScaleSliceRef,
  compositeContentJson, styleBindingsJson, compositeJsonError, styleBindingsJsonError,
  compositeEditorMode, compositeTreeTargets, compositeContentDraft, styleBindingsDraft,
  compositeShapeType, compositeAutoSize, compositeMinWidth, compositeMinHeight,
  loadNodeProps: loadNodePropsFromComposable, buildNodeStyle,
} = useNodeStyleState();
const componentPropsForA5 = computed(() => props.componentProperties ?? []);
const nodeTypePropsForA5 = computed(() => props.nodeTypeProperties ?? []);
const compositeValidationIssues = computed(() =>
  validateCompositeDiagramStyle(
    {
      nodeShape: "composite",
      compositeContent: compositeContentDraft.value,
      stylePropertyBindings: styleBindingsDraft.value,
    },
    t
  )
);

// --- Edge style state (from composable) ---
const {
  edgeLabel, edgeLabelTemplate, edgeStrokeColor, edgeStrokeOpacity, edgeStrokeWidth,
  edgeLineStyle, edgeLineDashPattern, edgeType, edgeEndMarker, edgeStartMarker,
  edgeOpacity, edgeLabelColor, edgeLabelOpacity, edgeLabelFontSize, edgeLabelInset,
  edgeLabelOffset, edgeLabelPosition, edgeLabelFollowPath, edgeLabelLineGap,
  edgeLabelBgColor, edgeLabelBgOpacity, edgeLabelBgBorderRadius,
  edgeStartMarkerSize, edgeStartMarkerFillColor, edgeStartMarkerFillOpacity,
  edgeEndMarkerSize, edgeEndMarkerFillColor, edgeEndMarkerFillOpacity,
  loadEdgeProps: loadEdgePropsFromComposable, buildEdgeStyle,
} = useEdgeStyleState();

function getSelectedNode(): Node | null {
  if (!props.selectedElementId || !props.renderer) return null;
  return props.renderer.getNode(props.selectedElementId) ?? null;
}

function getSelectedEdge(): Edge | null {
  if (!props.selectedElementId || !props.renderer) return null;
  return props.renderer.getEdge(props.selectedElementId) ?? null;
}

function loadNodeProps() {
  const node = getSelectedNode();
  if (!node) return;
  const needsCatalogShapes = loadNodePropsFromComposable(node, props.currentDiagramStyle);
  if (needsCatalogShapes) ensureCatalogShapesLoaded();
}

function loadEdgeProps() {
  const edge = getSelectedEdge();
  if (!edge) return;
  loadEdgePropsFromComposable(edge, props.currentDiagramStyle);
}

watch(() => props.selectedElementId, () => {
  if (elementType.value === "edge") {
    loadEdgeProps();
    selectedRelationPreset.value = "custom";
  } else {
    loadNodeProps();
    selectedComponentPreset.value = "custom";
  }
}, {immediate: true});

watch(() => props.currentDiagramStyle?.labelTemplate, (val) => {
  if (elementType.value === "edge") {
    edgeLabelTemplate.value = val ?? "";
  } else {
    labelTemplate.value = val ?? "";
  }
});
watch(() => props.currentDiagramStyle?.showLabel, (val) => {
  showLabel.value = val !== false;
});

watch(
  () => props.currentDiagramStyle,
  (style) => {
    if (elementType.value === "edge") {
      loadEdgeProps();
      return;
    }
    if (!style || elementType.value !== "node") return;
    if (style.iconName) {
      iconPlacement.value = normalizeIconPlacement(style.iconPlacement, iconPlacement.value);
    }
    if (style.nodeShape === "custom") {
      nodeShape.value = "custom";
      customOutlineRef.value = style.customOutline ?? undefined;
      customShapeIdRef.value = style.customShapeId ?? null;
      customScaleSliceRef.value =
        style.customScaleSlice ?? resolveCustomScaleSlice(style) ?? undefined;
    } else if (
      style.nodeShape === "composite" &&
      style.compositeShapeType === "custom"
    ) {
      customOutlineRef.value = style.customOutline ?? undefined;
      customShapeIdRef.value = style.customShapeId ?? null;
      customScaleSliceRef.value =
        style.customScaleSlice ?? resolveCustomScaleSlice(style) ?? undefined;
    } else if (NODE_SHAPE_OPTIONS.some((o) => o.value === style.nodeShape)) {
      nodeShape.value = style.nodeShape as NodeShape;
      if (style.nodeShape !== "composite") {
        customOutlineRef.value = undefined;
        customShapeIdRef.value = null;
        customScaleSliceRef.value = undefined;
      }
    }
  },
  { deep: true }
);

function reloadSelectedProps() {
  if (elementType.value === "edge") {
    loadEdgeProps();
  } else if (elementType.value === "node") {
    loadNodeProps();
  }
}

// Listen for resize events from canvas
watch(() => props.interactionManager, (im, _, onCleanup) => {
  if (!im) return;

  const offResize = im.resize.on("resize", (nodeId: string, bounds: { width: number; height: number }) => {
    // Check if this is the currently selected node
    if (props.selectedElementId === nodeId && elementType.value === "node") {
      nodeWidth.value = Math.round(bounds.width);
      nodeHeight.value = Math.round(bounds.height);
    }
  });

  const offResizeEnd = im.resize.on("resizeEnd", (nodeId: string, bounds: { width: number; height: number }) => {
    if (props.selectedElementId === nodeId && elementType.value === "node") {
      nodeWidth.value = Math.round(bounds.width);
      nodeHeight.value = Math.round(bounds.height);
      // Emit style change to update attrs
      emitNodeStyle();
    }
  });

  onCleanup(() => {
    offResize();
    offResizeEnd();
  });
}, { immediate: true });

// Keep panel fields in sync with inline canvas edits (double click label edit, etc.)
watch(() => props.interactionManager, (im, _, onCleanup) => {
  if (!im) return;

  const offHistoryChange = im.history.on("change", () => {
    requestAnimationFrame(() => {
      reloadSelectedProps();
    });
  });

  onCleanup(() => {
    offHistoryChange();
  });
}, { immediate: true });

// Reset preset to custom when any style property is manually changed
function resetComponentPreset() {
  selectedComponentPreset.value = "custom";
}

function resetRelationPreset() {
  selectedRelationPreset.value = "custom";
}

type NodeSectionKey = "label" | "shape" | "fill" | "stroke" | "icon";
type EdgeSectionKey = "label" | "line" | "markers";

// Collapsible sections for node style
const nodeSection = reactive<Record<NodeSectionKey, boolean>>({
  label: true,
  shape: true,
  fill: true,
  stroke: true,
  icon: false,
});

// Collapsible sections for edge style
const edgeSection = reactive<Record<EdgeSectionKey, boolean>>({
  label: true,
  line: true,
  markers: true,
});

function toggleSection<T extends string>(sections: Record<T, boolean>, key: T) {
  sections[key] = !sections[key];
}

// --- Node handlers ---
function handleIconChange(value: string) {
  iconName.value = value;
  resetComponentPreset();
  applyNodeIcon();
  emitNodeStyle();
}

function handleNodeShapeChange(value: string) {
  if (!NODE_SHAPE_OPTIONS.some((option) => option.value === value)) return;
  const next = value as NodeShape;
  if (nodeShape.value === "composite" && next !== "composite") {
    const hasCompositeData =
      compositeContentJson.value.trim().length > 0 ||
      styleBindingsJson.value.trim().length > 0 ||
      (compositeContentDraft.value.children?.length ?? 0) > 0 ||
      styleBindingsDraft.value.length > 0;
    if (hasCompositeData && !window.confirm(t("nodeStyle.compositeSwitchWarning"))) {
      return;
    }
    compositeContentJson.value = "";
    styleBindingsJson.value = "";
    compositeContentDraft.value = { type: "container", direction: "column", children: [] };
    styleBindingsDraft.value = [];
  }
  if (next !== "custom") {
    customOutlineRef.value = undefined;
    customShapeIdRef.value = null;
    customScaleSliceRef.value = undefined;
  } else {
    ensureCatalogShapesLoaded();
  }
  nodeShape.value = next;
  resetComponentPreset();
  emitNodeStyle();
}

function handleCompositeContentInput(value: string) {
  compositeContentJson.value = value;
  compositeJsonError.value = null;
}

function applyCompositeContentJson() {
  try {
    const parsed = compositeContentJson.value.trim()
      ? JSON.parse(compositeContentJson.value)
      : createDefaultCompositeContent(label.value || "Name");
    compositeContentDraft.value = parsed as CompositeSerializedCComponent;
    compositeContentJson.value = JSON.stringify(parsed, null, 2);
    compositeJsonError.value = null;
    emitNodeStyle();
  } catch {
    compositeJsonError.value = t("nodeStyle.compositeJsonInvalid");
  }
}

function handleStyleBindingsInput(value: string) {
  styleBindingsJson.value = value;
  styleBindingsJsonError.value = null;
}

function applyStyleBindingsJson() {
  if (!styleBindingsJson.value.trim()) {
    styleBindingsDraft.value = [];
    styleBindingsJsonError.value = null;
    emitNodeStyle();
    return;
  }
  try {
    const parsed = JSON.parse(styleBindingsJson.value);
    styleBindingsDraft.value = parsed as StylePropertyBindingGroup[];
    styleBindingsJson.value = JSON.stringify(parsed, null, 2);
    styleBindingsJsonError.value = null;
    emitNodeStyle();
  } catch {
    styleBindingsJsonError.value = t("nodeStyle.compositeBindingsInvalid");
  }
}

function handleCompositeTreeUpdate(next: CompositeSerializedCComponent) {
  compositeContentDraft.value = JSON.parse(JSON.stringify(next));
  compositeContentJson.value = JSON.stringify(compositeContentDraft.value, null, 2);
  compositeJsonError.value = null;
  emitNodeStyle();
}

function handleA5BindingsUpdate(next: StylePropertyBindingGroup[]) {
  styleBindingsDraft.value = JSON.parse(JSON.stringify(next));
  styleBindingsJson.value = JSON.stringify(styleBindingsDraft.value, null, 2);
  styleBindingsJsonError.value = null;
  emitNodeStyle();
}

function handleCustomShapeSelect(shape: {
  id: string
  name: string
  outline: string | null
  attrs?: string | null
}) {
  if (nodeShape.value !== "composite") {
    nodeShape.value = "custom";
  }
  if (shape.outline) {
    try {
      const parsed = JSON.parse(shape.outline) as unknown;
      customOutlineRef.value = Array.isArray(parsed) ? parsed : undefined;
    } catch {
      customOutlineRef.value = undefined;
    }
  } else {
    customOutlineRef.value = undefined;
  }
  customShapeIdRef.value = shape.id;
  customScaleSliceRef.value = parseScaleSliceFromAttrs(shape.attrs) ?? undefined;
  if (nodeShape.value === "composite") {
    compositeShapeType.value = "custom";
  }
  resetComponentPreset();
  emitNodeStyle();
}

function handleCustomShapeSelectByValue(id: string) {
  if (!id) {
    customOutlineRef.value = undefined;
    customShapeIdRef.value = null;
    customScaleSliceRef.value = undefined;
    if (nodeShape.value === "custom") emitNodeStyle();
    return;
  }
  const shape = catalogShapes.value.find((s) => s.id === id);
  if (shape) handleCustomShapeSelect(shape);
}

function applyNodeIcon() {
  if (!props.selectedElementId || !props.interactionManager) return;
  props.interactionManager.changeNodeProperties(props.selectedElementId, (node) => {
    if (iconName.value) {
      const nodeRuntime = node as unknown as ExtendedNodeProps;
      nodeRuntime.icon = iconConfig();
    } else {
      const nodeRuntime = node as unknown as ExtendedNodeProps;
      nodeRuntime.icon = undefined;
    }
  });
}

function handleIconPlacementChange(value: string) {
  iconPlacement.value = value as IconPlacement;
  resetComponentPreset();
  applyNodeIcon();
  emitNodeStyle();
}

function handleIconWidthChange(value: string) {
  const v = parseFloat(value);
  if (!Number.isFinite(v) || v <= 0) return;
  iconWidth.value = v;
  resetComponentPreset();
  applyNodeIcon();
  emitNodeStyle();
}

function handleIconHeightChange(value: string) {
  const v = parseFloat(value);
  if (!Number.isFinite(v) || v <= 0) return;
  iconHeight.value = v;
  resetComponentPreset();
  applyNodeIcon();
  emitNodeStyle();
}

function handleIconInsetChange(value: string) {
  const v = parseFloat(value);
  if (!Number.isFinite(v) || v < 0) return;
  iconInset.value = v;
  resetComponentPreset();
  applyNodeIcon();
  emitNodeStyle();
}

function handleIconStrokeColorChange(value: string) {
  iconStrokeColor.value = value;
  resetComponentPreset();
  applyNodeIcon();
  emitNodeStyle();
}

function handleIconFillColorChange(value: string) {
  iconFillColor.value = value;
  resetComponentPreset();
  applyNodeIcon();
  emitNodeStyle();
}

function applyNodeStyle(updates: Partial<ExtendedNodeStyle>) {
  if (!props.selectedElementId || !props.interactionManager) return;
  props.interactionManager.changeNodeProperties(props.selectedElementId, (node) => {
    const baseStyle = node.style || {};
    node.style = {...baseStyle, ...updates};
  });
}

function handleLabelChange(value: string) {
  label.value = value;
  if (!showLabel.value || !props.selectedElementId || !props.interactionManager) return;
  props.interactionManager.changeNodeProperties(props.selectedElementId, (node) => {
    if (value) {
      if (node.label) {
        node.label.text = value;
      } else {
        node.label = value;
      }
    } else {
      node.label = undefined;
    }
  });
}

function handleShowLabelChange(value: boolean) {
  showLabel.value = value;
  resetComponentPreset();
  if (props.selectedElementId && props.interactionManager) {
    props.interactionManager.changeNodeProperties(props.selectedElementId, (node) => {
      if (!value) {
        node.label = undefined;
        return;
      }
      if (!label.value) {
        node.label = undefined;
        return;
      }
      node.label = new TextLabel({
        text: label.value,
        style: {
          color: labelColor.value,
          fontSize: labelFontSize.value,
          opacity: labelOpacity.value,
          align: labelAlign.value,
          verticalAlign: labelVerticalAlign.value,
        },
        inset: insetToPlain(labelInset.value),
      });
    });
  }
  emitNodeStyle();
}

function handleFillChange(value: string) {
  fillColor.value = value;
  resetComponentPreset();
  applyNodeStyle({fillColor: value, fillOpacity: fillOpacity.value});
  emitNodeStyle();
}

function handleFillOpacityChange(value: string) {
  const v = parseFloat(value);
  if (!Number.isFinite(v)) return;
  fillOpacity.value = v;
  resetComponentPreset();
  applyNodeStyle({fillColor: fillColor.value, fillOpacity: v});
  emitNodeStyle();
}

function handleStrokeColorChange(value: string) {
  strokeColor.value = value;
  resetComponentPreset();
  applyNodeStyle({strokeColor: value, strokeOpacity: strokeOpacity.value});
  emitNodeStyle();
}

function handleStrokeOpacityChange(value: string) {
  const v = parseFloat(value);
  if (!Number.isFinite(v)) return;
  strokeOpacity.value = v;
  resetComponentPreset();
  applyNodeStyle({strokeColor: strokeColor.value, strokeOpacity: v});
  emitNodeStyle();
}

function handleStrokeWidthChange(value: string) {
  const v = parseFloat(value);
  if (Number.isFinite(v)) {
    strokeWidth.value = v;
    resetComponentPreset();
    applyNodeStyle({strokeWidth: v});
    emitNodeStyle();
  }
}

function handleCornerRadiusChange(value: string) {
  const v = parseFloat(value);
  if (!Number.isFinite(v) || !props.selectedElementId || !props.interactionManager) return;
  cornerRadius.value = v;
  resetComponentPreset();
  props.interactionManager.changeNodeProperties(props.selectedElementId, (node) => {
    if ("cornerRadius" in node) {
      const nodeRuntime = node as unknown as ExtendedNodeProps;
      nodeRuntime.cornerRadius = v;
    }
  });
  emitNodeStyle();
}

function handleCornerCutChange(value: string) {
  const v = parseFloat(value);
  if (!Number.isFinite(v) || v < 0 || !props.selectedElementId || !props.interactionManager) return;
  cornerCut.value = v;
  resetComponentPreset();
  props.interactionManager.changeNodeProperties(props.selectedElementId, (node) => {
    if (node instanceof CustomShapeNode && nodeShape.value === "beveled-rectangle") {
      const factory = diagramShapeFactories["beveled-rectangle"];
      node.setPathFactory((w, h) => factory.path(w, h, v));
      node.setSvgPath((w, h) => factory.svgPath(w, h, v));
    }
  });
  emitNodeStyle();
}

function handleLineStyleChange(value: string) {
  lineStyle.value = value as "solid" | "dashed";
  resetComponentPreset();
  if (value === "dashed") {
    const pattern = lineDashPattern.value.trim() || "8,4";
    const lineDash = pattern.split(",").map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
    applyNodeStyle({lineDash});
  } else {
    applyNodeStyle({lineDash: undefined});
  }
  emitNodeStyle();
}

function handleLineDashChange(value: string) {
  lineDashPattern.value = value;
  resetComponentPreset();
  if (lineStyle.value === "dashed") {
    const lineDash = value.split(",").map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
    if (lineDash.length > 0) {
      applyNodeStyle({lineDash});
      emitNodeStyle();
    }
  }
}

function handleLabelTemplateChange(value: string) {
  labelTemplate.value = value;
  resetComponentPreset();
  emitNodeStyle();
}

function handleLabelColorChange(value: string) {
  labelColor.value = value;
  resetComponentPreset();
  if (!props.selectedElementId || !props.interactionManager) return;
  props.interactionManager.changeNodeProperties(props.selectedElementId, (node) => {
    if (node.label) {
      node.label.style = {...(node.label.style || {}), color: value};
    }
  });
  emitNodeStyle();
}

function handleLabelOpacityChange(value: string) {
  const v = parseFloat(value);
  if (!Number.isFinite(v)) return;
  labelOpacity.value = v;
  resetComponentPreset();
  if (!props.selectedElementId || !props.interactionManager) return;
  props.interactionManager.changeNodeProperties(props.selectedElementId, (node) => {
    if (node.label) {
      node.label.style = textStyleWith(node.label.style, { opacity: v });
    }
  });
  emitNodeStyle();
}

function handleLabelFontSizeChange(value: string) {
  const v = parseFloat(value);
  if (!Number.isFinite(v)) return;
  labelFontSize.value = v;
  if (!props.selectedElementId || !props.interactionManager) return;
  props.interactionManager.changeNodeProperties(props.selectedElementId, (node) => {
    if (node.label) {
      node.label.style = {...(node.label.style || {}), fontSize: v};
    }
  });
  emitNodeStyle();
}

function handleLabelInsetChange(value: InsetSides) {
  labelInset.value = value;
  if (!props.selectedElementId || !props.interactionManager) return;
  props.interactionManager.changeNodeProperties(props.selectedElementId, (node) => {
    if (node.label) setLabelSpacing(node.label, { inset: insetToPlain(labelInset.value) });
  });
  emitNodeStyle();
}

function handleLabelAlignChange(value: string) {
  const v = value as "center" | "left" | "right";
  labelAlign.value = v;
  if (!props.selectedElementId || !props.interactionManager) return;
  props.interactionManager.changeNodeProperties(props.selectedElementId, (node) => {
    if (node.label) node.label.style = { ...node.label.style, align: v };
  });
  emitNodeStyle();
}

function handleLabelVerticalAlignChange(value: string) {
  const v = value as "top" | "middle" | "bottom";
  labelVerticalAlign.value = v;
  if (!props.selectedElementId || !props.interactionManager) return;
  props.interactionManager.changeNodeProperties(props.selectedElementId, (node) => {
    if (node.label) node.label.style = textStyleWith(node.label.style, { verticalAlign: v });
  });
  emitNodeStyle();
}

function handleWidthChange(value: string) {
  const v = parseFloat(value);
  if (!Number.isFinite(v) || v < 10) return;
  nodeWidth.value = v;
  resetComponentPreset();
  if (!props.selectedElementId || !props.interactionManager) return;
  props.interactionManager.changeNodeProperties(props.selectedElementId, (node) => {
    node.width = v;
  });
  emitNodeStyle();
}

function handleHeightChange(value: string) {
  const v = parseFloat(value);
  if (!Number.isFinite(v) || v < 10) return;
  nodeHeight.value = v;
  resetComponentPreset();
  if (!props.selectedElementId || !props.interactionManager) return;
  props.interactionManager.changeNodeProperties(props.selectedElementId, (node) => {
    node.height = v;
  });
  emitNodeStyle();
}

function handleContentInsetChange(value: InsetSides) {
  contentInset.value = value;
  resetComponentPreset();
  applyContentInsetLive();
  emitNodeStyle();
}

function handleContentInsetScaleChange(value: InsetScaleSides) {
  contentInsetScale.value = value;
  resetComponentPreset();
  applyContentInsetLive();
  emitNodeStyle();
}

function applyContentInsetLive() {
  if (!props.selectedElementId || !props.interactionManager) return;
  props.interactionManager.changeNodeProperties(props.selectedElementId, (node) => {
    const nodeRuntime = node as unknown as ExtendedNodeProps;
    applyContentInsetFromStyle(nodeRuntime, {
      contentInset: insetToPlain(contentInset.value),
      contentInsetScale: contentInsetScale.value,
      width: nodeWidth.value,
      height: nodeHeight.value,
    });
  });
}

function handlePortsTopChange(value: string) {
  const v = Math.max(0, Math.round(Number(value)));
  if (!Number.isFinite(v)) return;
  nodePortsTop.value = v;
  resetComponentPreset();
  if (!props.selectedElementId || !props.interactionManager) return;
  props.interactionManager.changeNodeProperties(props.selectedElementId, (node) => {
    const nodeRuntime = node as unknown as ExtendedNodeProps;
    const anchorPoints = nodeRuntime.anchorPoints || {};
    nodeRuntime.anchorPoints = { ...anchorPoints, top: v };
  });
  emitNodeStyle();
}

function handlePortsBottomChange(value: string) {
  const v = Math.max(0, Math.round(Number(value)));
  if (!Number.isFinite(v)) return;
  nodePortsBottom.value = v;
  resetComponentPreset();
  if (!props.selectedElementId || !props.interactionManager) return;
  props.interactionManager.changeNodeProperties(props.selectedElementId, (node) => {
    const nodeRuntime = node as unknown as ExtendedNodeProps;
    const anchorPoints = nodeRuntime.anchorPoints || {};
    nodeRuntime.anchorPoints = { ...anchorPoints, bottom: v };
  });
  emitNodeStyle();
}

function handlePortsLeftChange(value: string) {
  const v = Math.max(0, Math.round(Number(value)));
  if (!Number.isFinite(v)) return;
  nodePortsLeft.value = v;
  resetComponentPreset();
  if (!props.selectedElementId || !props.interactionManager) return;
  props.interactionManager.changeNodeProperties(props.selectedElementId, (node) => {
    const nodeRuntime = node as unknown as ExtendedNodeProps;
    const anchorPoints = nodeRuntime.anchorPoints || {};
    nodeRuntime.anchorPoints = { ...anchorPoints, left: v };
  });
  emitNodeStyle();
}

function handlePortsRightChange(value: string) {
  const v = Math.max(0, Math.round(Number(value)));
  if (!Number.isFinite(v)) return;
  nodePortsRight.value = v;
  resetComponentPreset();
  if (!props.selectedElementId || !props.interactionManager) return;
  props.interactionManager.changeNodeProperties(props.selectedElementId, (node) => {
    const nodeRuntime = node as unknown as ExtendedNodeProps;
    const anchorPoints = nodeRuntime.anchorPoints || {};
    nodeRuntime.anchorPoints = { ...anchorPoints, right: v };
  });
  emitNodeStyle();
}

// --- Edge handlers ---
function applyEdgeStyle(updates: Partial<ExtendedEdgeStyle>) {
  if (!props.selectedElementId || !props.interactionManager) return;
  props.interactionManager.changeEdgeProperties(props.selectedElementId, (edge) => {
    const baseStyle = edge.style || {};
    edge.style = {...baseStyle, ...updates};
  });
}

function handleEdgeLabelChange(value: string) {
  edgeLabel.value = value;
  if (!props.selectedElementId || !props.interactionManager) return;
  const resolved = value.replace(/\\n/g, '\n');
  const templateActive = !!edgeLabelTemplate.value.trim();
  props.interactionManager.changeEdgeProperties(props.selectedElementId, (edge) => {
    if (resolved) {
      if (edge.label) {
        // When a template drives display text, keep it and only update the edit buffer.
        if (templateActive && edge.label.editableText !== undefined) {
          edge.label.editableText = resolved;
        } else {
          edge.label.text = resolved;
        }
      } else {
        edge.label = new TextLabel({
          text: resolved,
          inset: insetToPlain(edgeLabelInset.value)
        });
      }
    } else if (!templateActive) {
      edge.label = undefined;
    }
  });
}

function handleEdgeLabelTemplateChange(value: string) {
  edgeLabelTemplate.value = value;
  resetRelationPreset();
  emitEdgeStyle();
}

function handleEdgeStrokeColorChange(value: string) {
  edgeStrokeColor.value = value;
  resetRelationPreset();
  applyEdgeStyle({strokeColor: value, strokeOpacity: edgeStrokeOpacity.value});
  emitEdgeStyle();
}

function handleEdgeStrokeOpacityChange(value: string) {
  const v = parseFloat(value);
  if (!Number.isFinite(v)) return;
  edgeStrokeOpacity.value = v;
  resetRelationPreset();
  applyEdgeStyle({strokeColor: edgeStrokeColor.value, strokeOpacity: v});
  emitEdgeStyle();
}

function handleEdgeStrokeWidthChange(value: string) {
  const v = parseFloat(value);
  if (Number.isFinite(v)) {
    edgeStrokeWidth.value = v;
    resetRelationPreset();
    applyEdgeStyle({strokeWidth: v});
    emitEdgeStyle();
  }
}

function handleEdgeLineStyleChange(value: string) {
  edgeLineStyle.value = value as "solid" | "dashed";
  resetRelationPreset();
  if (value === "dashed") {
    const pattern = edgeLineDashPattern.value.trim() || "8,4";
    const lineDash = pattern.split(",").map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
    applyEdgeStyle({lineDash});
  } else {
    applyEdgeStyle({lineDash: undefined});
  }
  emitEdgeStyle();
}

function handleEdgeLineDashChange(value: string) {
  edgeLineDashPattern.value = value;
  resetRelationPreset();
  if (edgeLineStyle.value === "dashed") {
    const lineDash = value.split(",").map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
    if (lineDash.length > 0) {
      applyEdgeStyle({lineDash});
      emitEdgeStyle();
    }
  }
}

function handleEdgeTypeChange(value: string) {
  const v = value as "straight" | "polyline" | "editable-polyline" | "bezier";
  edgeType.value = v;
  resetRelationPreset();
  if (!props.selectedElementId || !props.interactionManager) return;
  // Re-apply label styles in the same property change so:
  // 1) canvas keeps color/size immediately
  // 2) debounced history snapshot includes them (sync may recreate label as a bare string)
  props.interactionManager.changeEdgeProperties(props.selectedElementId, (edge) => {
    edge.type = v;
    if (edge.label) {
      edge.label.style = textStyleWith(edge.label.style, {
        color: edgeLabelColor.value,
        fontSize: edgeLabelFontSize.value,
        opacity: edgeLabelOpacity.value,
      });
      setLabelSpacing(edge.label, { inset: insetToPlain(edgeLabelInset.value) });
    }
    ;(edge as unknown as ExtendedEdgeProps).labelBackground = {
      color: edgeLabelBgColor.value,
      opacity: edgeLabelBgOpacity.value,
      borderRadius: edgeLabelBgBorderRadius.value,
    };
    edge.labelOffset = edgeLabelOffset.value;
    edge.labelPosition = edgeLabelPosition.value;
    edge.labelFollowPath = edgeLabelFollowPath.value;
    edge.labelLineGap = edgeLabelLineGap.value;
  });
  emitEdgeStyle();
}

function handleEdgeEndMarkerChange(value: string) {
  const v = value as "none" | "arrow" | "open" | "diamond" | "circle" | "square" | "stealth";
  edgeEndMarker.value = v;
  resetRelationPreset();
  if (!props.selectedElementId || !props.interactionManager) return;
  props.interactionManager.changeEdgeProperties(props.selectedElementId, (edge) => {
    edge.endMarker = buildMarkerConfig(v, edgeEndMarkerSize.value, edgeEndMarkerFillColor.value, edgeEndMarkerFillOpacity.value);
  });
  emitEdgeStyle();
}

function handleEdgeStartMarkerChange(value: string) {
  const v = value as "none" | "arrow" | "open" | "diamond" | "circle" | "square" | "stealth";
  edgeStartMarker.value = v;
  resetRelationPreset();
  if (!props.selectedElementId || !props.interactionManager) return;
  props.interactionManager.changeEdgeProperties(props.selectedElementId, (edge) => {
    edge.startMarker = buildMarkerConfig(v, edgeStartMarkerSize.value, edgeStartMarkerFillColor.value, edgeStartMarkerFillOpacity.value);
  });
  emitEdgeStyle();
}

function handleEdgeLabelColorChange(value: string) {
  edgeLabelColor.value = value;
  resetRelationPreset();
  if (!props.selectedElementId || !props.interactionManager) return;
  props.interactionManager.changeEdgeProperties(props.selectedElementId, (edge) => {
    if (edge.label) {
      edge.label.style = {...(edge.label.style || {}), color: value};
    }
  });
  emitEdgeStyle();
}

function handleEdgeLabelOpacityChange(value: string) {
  const v = parseFloat(value);
  if (!Number.isFinite(v)) return;
  edgeLabelOpacity.value = v;
  resetRelationPreset();
  if (!props.selectedElementId || !props.interactionManager) return;
  props.interactionManager.changeEdgeProperties(props.selectedElementId, (edge) => {
    if (edge.label) {
      edge.label.style = textStyleWith(edge.label.style, { opacity: v });
    }
  });
  emitEdgeStyle();
}

function handleEdgeLabelFontSizeChange(value: string) {
  const v = parseFloat(value);
  if (!Number.isFinite(v)) return;
  edgeLabelFontSize.value = v;
  if (!props.selectedElementId || !props.interactionManager) return;
  props.interactionManager.changeEdgeProperties(props.selectedElementId, (edge) => {
    if (edge.label) {
      edge.label.style = {...(edge.label.style || {}), fontSize: v};
    }
  });
  emitEdgeStyle();
}

function handleEdgeLabelInsetChange(value: InsetSides) {
  edgeLabelInset.value = value;
  resetRelationPreset();
  if (!props.selectedElementId || !props.interactionManager) return;
  props.interactionManager.changeEdgeProperties(props.selectedElementId, (edge) => {
    if (edge.label) setLabelSpacing(edge.label, { inset: insetToPlain(edgeLabelInset.value) });
  });
  props.renderer?.markDirty();
  emitEdgeStyle();
}

function handleEdgeLabelOffsetChange(value: string) {
  const v = parseFloat(value);
  if (!Number.isFinite(v)) return;
  edgeLabelOffset.value = v;
  resetRelationPreset();
  if (!props.selectedElementId || !props.interactionManager) return;
  props.interactionManager.changeEdgeProperties(props.selectedElementId, (edge) => {
    edge.labelOffset = v;
  });
  emitEdgeStyle();
}

function handleEdgeLabelPositionChange(value: string) {
  const v = parseFloat(value);
  if (!Number.isFinite(v)) return;
  edgeLabelPosition.value = Math.max(0, Math.min(1, v));
  resetRelationPreset();
  if (!props.selectedElementId || !props.interactionManager) return;
  props.interactionManager.changeEdgeProperties(props.selectedElementId, (edge) => {
    edge.labelPosition = edgeLabelPosition.value;
  });
  props.renderer?.markDirty();
  emitEdgeStyle();
}

function handleEdgeLabelFollowPathChange(value: boolean) {
  edgeLabelFollowPath.value = value;
  resetRelationPreset();
  if (!props.selectedElementId || !props.interactionManager) return;
  props.interactionManager.changeEdgeProperties(props.selectedElementId, (edge) => {
    edge.labelFollowPath = value;
  });
  props.renderer?.markDirty();
  emitEdgeStyle();
}

function handleEdgeLabelBgColorChange(value: string) {
  edgeLabelBgColor.value = value;
  resetRelationPreset();
  if (!props.selectedElementId || !props.interactionManager) return;
  props.interactionManager.changeEdgeProperties(props.selectedElementId, (edge) => {
    const edgeRuntime = edge as unknown as ExtendedEdgeProps;
    edgeRuntime.labelBackground = { ...(edgeRuntime.labelBackground || {}), color: value };
  });
  emitEdgeStyle();
}

function handleEdgeLabelBgOpacityChange(value: string) {
  const v = parseFloat(value);
  if (!Number.isFinite(v)) return;
  edgeLabelBgOpacity.value = v;
  resetRelationPreset();
  if (!props.selectedElementId || !props.interactionManager) return;
  props.interactionManager.changeEdgeProperties(props.selectedElementId, (edge) => {
    const edgeRuntime = edge as unknown as ExtendedEdgeProps;
    edgeRuntime.labelBackground = { ...(edgeRuntime.labelBackground || {}), opacity: v };
  });
  emitEdgeStyle();
}

function handleEdgeLabelBgBorderRadiusChange(value: string) {
  const v = parseFloat(value);
  if (!Number.isFinite(v) || v < 0) return;
  edgeLabelBgBorderRadius.value = v;
  resetRelationPreset();
  if (!props.selectedElementId || !props.interactionManager) return;
  props.interactionManager.changeEdgeProperties(props.selectedElementId, (edge) => {
    const edgeRuntime = edge as unknown as ExtendedEdgeProps;
    edgeRuntime.labelBackground = { ...(edgeRuntime.labelBackground || {}), borderRadius: v };
  });
  emitEdgeStyle();
}

function handleEdgeLabelLineGapChange(checked: boolean) {
  edgeLabelLineGap.value = checked;
  resetRelationPreset();
  if (!props.selectedElementId || !props.interactionManager) return;
  props.interactionManager.changeEdgeProperties(props.selectedElementId, (edge) => {
    edge.labelLineGap = checked;
  });
  emitEdgeStyle();
}

function buildMarkerConfig(
  type: "none" | "arrow" | "open" | "diamond" | "circle" | "square" | "stealth",
  size: number,
  fillColor: string,
  fillOpacity: number
): ArrowMarkerConfig | undefined {
  if (type === "none") return undefined;
  return {type, size, fillColor, fillOpacity};
}

function handleEdgeStartMarkerSizeChange(value: string) {
  const v = parseFloat(value);
  if (!Number.isFinite(v)) return;
  edgeStartMarkerSize.value = v;
  if (!props.selectedElementId || !props.interactionManager) return;
  props.interactionManager.changeEdgeProperties(props.selectedElementId, (edge) => {
    edge.startMarker = buildMarkerConfig(edgeStartMarker.value, v, edgeStartMarkerFillColor.value, edgeStartMarkerFillOpacity.value);
  });
  emitEdgeStyle();
}

function handleEdgeStartMarkerFillColorChange(value: string) {
  edgeStartMarkerFillColor.value = value;
  if (!props.selectedElementId || !props.interactionManager) return;
  props.interactionManager.changeEdgeProperties(props.selectedElementId, (edge) => {
    edge.startMarker = buildMarkerConfig(edgeStartMarker.value, edgeStartMarkerSize.value, value, edgeStartMarkerFillOpacity.value);
  });
  emitEdgeStyle();
}

function handleEdgeStartMarkerFillOpacityChange(value: string) {
  const v = parseFloat(value);
  if (!Number.isFinite(v)) return;
  edgeStartMarkerFillOpacity.value = v;
  if (!props.selectedElementId || !props.interactionManager) return;
  props.interactionManager.changeEdgeProperties(props.selectedElementId, (edge) => {
    edge.startMarker = buildMarkerConfig(edgeStartMarker.value, edgeStartMarkerSize.value, edgeStartMarkerFillColor.value, v);
  });
  emitEdgeStyle();
}

function handleEdgeEndMarkerSizeChange(value: string) {
  const v = parseFloat(value);
  if (!Number.isFinite(v)) return;
  edgeEndMarkerSize.value = v;
  if (!props.selectedElementId || !props.interactionManager) return;
  props.interactionManager.changeEdgeProperties(props.selectedElementId, (edge) => {
    edge.endMarker = buildMarkerConfig(edgeEndMarker.value, v, edgeEndMarkerFillColor.value, edgeEndMarkerFillOpacity.value);
  });
  emitEdgeStyle();
}

function handleEdgeEndMarkerFillColorChange(value: string) {
  edgeEndMarkerFillColor.value = value;
  if (!props.selectedElementId || !props.interactionManager) return;
  props.interactionManager.changeEdgeProperties(props.selectedElementId, (edge) => {
    edge.endMarker = buildMarkerConfig(edgeEndMarker.value, edgeEndMarkerSize.value, value, edgeEndMarkerFillOpacity.value);
  });
  emitEdgeStyle();
}

function handleEdgeEndMarkerFillOpacityChange(value: string) {
  const v = parseFloat(value);
  if (!Number.isFinite(v)) return;
  edgeEndMarkerFillOpacity.value = v;
  if (!props.selectedElementId || !props.interactionManager) return;
  props.interactionManager.changeEdgeProperties(props.selectedElementId, (edge) => {
    edge.endMarker = buildMarkerConfig(edgeEndMarker.value, edgeEndMarkerSize.value, edgeEndMarkerFillColor.value, v);
  });
  emitEdgeStyle();
}
</script>

<template>
  <div class="sp">
    <!-- Empty state -->
    <div v-if="!selectedElementId" class="sp-empty">
      <div class="sp-empty__graphic">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <rect x="8" y="12" width="32" height="24" rx="4" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4 3" opacity="0.3"/>
          <circle cx="24" cy="24" r="3" fill="currentColor" opacity="0.2"/>
          <path d="M24 18v-4M24 34v-4M18 24h-4M34 24h-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.15"/>
        </svg>
      </div>
      <span class="sp-empty__text">{{ t("diagram.selectElementToEditProperties") }}</span>
    </div>

    <template v-else>
      <!-- Header with type indicator -->
      <div class="sp-header">
        <div class="sp-header__type" :class="elementType === 'edge' ? 'sp-header__type--edge' : 'sp-header__type--node'">
          <svg v-if="elementType === 'edge'" width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="3" cy="13" r="2" stroke="currentColor" stroke-width="1.2"/>
            <circle cx="13" cy="3" r="2" stroke="currentColor" stroke-width="1.2"/>
            <path d="M4.5 11.5L11.5 4.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
          </svg>
          <svg v-else width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="2" y="4" width="12" height="8" rx="2" stroke="currentColor" stroke-width="1.2"/>
          </svg>
          <span>{{ elementType === 'edge' ? t("diagram.link") : t("nodeStyle.figure") }}</span>
        </div>
        <div v-if="canRestoreStyle" class="sp-header__actions">
          <button
            type="button"
            class="sp-header__btn"
            :title="t('nodeStyle.restoreFromNotation')"
            :disabled="!selectedElementId || !canRestoreStyle"
            @click="emit('restore-style')"
          >
            <UiIcon name="restart_alt" />
          </button>
        </div>
      </div>

      <!-- Preset bar -->
      <div class="sp-preset">
        <select
          class="sp-select sp-select--preset"
          :value="elementType === 'edge' ? selectedRelationPreset : selectedComponentPreset"
          @change="elementType === 'edge'
            ? (applyEdgePreset(($event.target as HTMLSelectElement).value), selectedRelationPreset = ($event.target as HTMLSelectElement).value)
            : (applyComponentPreset(($event.target as HTMLSelectElement).value), selectedComponentPreset = ($event.target as HTMLSelectElement).value)"
        >
          <option value="custom">{{ t("nodeStyle.customPreset") }}</option>
          <optgroup :label="t('nodeStyle.builtInPresets')">
            <option
              v-for="preset in (elementType === 'edge' ? builtInRelationPresets : builtInComponentPresets)"
              :key="preset.name"
              :value="preset.name"
            >{{ preset.label }}</option>
          </optgroup>
          <optgroup
            v-if="(elementType === 'edge' ? userRelationPresets : userComponentPresets).length"
            :label="t('nodeStyle.myPresets')"
          >
            <option
              v-for="preset in (elementType === 'edge' ? userRelationPresets : userComponentPresets)"
              :key="preset.name"
              :value="preset.name"
            >{{ preset.label }}</option>
          </optgroup>
        </select>
        <button type="button" class="sp-preset__btn" :title="t('nodeStyle.saveAsPreset')" @click="openSavePresetForm">
          <UiIcon name="bookmark_add" />
        </button>
        <button
          v-if="(elementType === 'edge' ? userRelationPresets : userComponentPresets).some(p => p.name === (elementType === 'edge' ? selectedRelationPreset : selectedComponentPreset))"
          type="button"
          class="sp-preset__btn sp-preset__btn--danger"
          :title="t('nodeStyle.deletePreset')"
          @click="handleDeleteUserPreset(elementType === 'edge' ? selectedRelationPreset : selectedComponentPreset, elementType === 'edge' ? 'relation' : 'component')"
        >
          <UiIcon name="delete_outline" />
        </button>
      </div>

      <!-- Save preset inline form -->
      <Transition name="sp-slide">
        <div v-if="showSavePresetForm" class="sp-save-form">
          <input
            v-model="newPresetName"
            class="sp-input sp-save-form__input"
            :placeholder="t('nodeStyle.presetNamePlaceholder')"
            @keyup.enter="confirmSavePreset"
            @keyup.escape="cancelSavePreset"
          >
          <button type="button" class="sp-save-form__btn sp-save-form__btn--ok" @click="confirmSavePreset">
            <UiIcon name="check" />
          </button>
          <button type="button" class="sp-save-form__btn" @click="cancelSavePreset">
            <UiIcon name="close" />
          </button>
        </div>
      </Transition>

      <!-- Scrollable body -->
      <div class="sp-body">

        <!-- ==================== EDGE PANEL ==================== -->
        <template v-if="elementType === 'edge'">

          <!-- Label -->
          <LabelStyleSection
            :title="t('nodeStyle.label')"
            :open="edgeSection.label"
            @toggle="toggleSection(edgeSection, 'label')"
          >
                <div class="sp-field">
                  <input class="sp-input sp-input--full" :value="edgeLabel" :placeholder="t('nodeStyle.labelTextPlaceholder')" @input="handleEdgeLabelChange(($event.target as HTMLInputElement).value)">
                </div>
                <div class="sp-field">
                  <span class="sp-field__label">{{ t("nodeStyle.template") }}</span>
                  <input
                    class="sp-input sp-input--full"
                    :value="edgeLabelTemplate"
                    :placeholder="t('diagram.compositeLabelPlaceholder')"
                    @input="handleEdgeLabelTemplateChange(($event.target as HTMLInputElement).value)"
                  >
                  <p class="sp-field__hint sp-field__hint--small">{{ t('diagram.compositeLabelSyntax') }}</p>
                </div>
                <LabeledFieldRow :label="t('nodeStyle.color')">
                  <ColorWithAlphaField
                    :model-value="edgeLabelColor"
                    :alpha-value="edgeLabelOpacity"
                    @update:model-value="handleEdgeLabelColorChange"
                    @update:alpha="(value) => handleEdgeLabelOpacityChange(String(value))"
                  />
                </LabeledFieldRow>
                <LabeledFieldRow :label="t('nodeStyle.size')">
                  <input type="number" class="sp-input sp-input--sm" :value="edgeLabelFontSize" min="8" max="72" step="1" @input="handleEdgeLabelFontSizeChange(($event.target as HTMLInputElement).value)">
                </LabeledFieldRow>
                <InsetSidesInput
                  :model-value="edgeLabelInset"
                  :min="0"
                  :max="60"
                  :step="1"
                  @update:model-value="handleEdgeLabelInsetChange"
                />
                <LabeledFieldRow :label="t('nodeStyle.offset')">
                  <input type="number" class="sp-input sp-input--sm" :value="edgeLabelOffset" min="-100" max="100" step="1" @input="handleEdgeLabelOffsetChange(($event.target as HTMLInputElement).value)">
                </LabeledFieldRow>
                <LabeledFieldRow :label="t('nodeStyle.labelPosition')">
                  <input type="range" class="sp-range" :value="edgeLabelPosition" min="0" max="1" step="0.05" @input="handleEdgeLabelPositionChange(($event.target as HTMLInputElement).value)">
                  <input type="number" class="sp-input sp-input--tiny" :value="edgeLabelPosition" min="0" max="1" step="0.05" @input="handleEdgeLabelPositionChange(($event.target as HTMLInputElement).value)">
                </LabeledFieldRow>
                <LabeledFieldRow :label="t('nodeStyle.labelFollowPath')">
                  <ToggleSwitch :model-value="edgeLabelFollowPath" @update:model-value="handleEdgeLabelFollowPathChange" />
                </LabeledFieldRow>
                <LabeledFieldRow :label="t('nodeStyle.background')">
                  <ColorWithAlphaField
                    :model-value="edgeLabelBgColor"
                    :alpha-value="edgeLabelBgOpacity"
                    @update:model-value="handleEdgeLabelBgColorChange"
                    @update:alpha="(value) => handleEdgeLabelBgOpacityChange(String(value))"
                  />
                </LabeledFieldRow>
                <div class="sp-field-grid sp-field-grid--2">
                  <LabeledNumberInput
                    label="R"
                    :model-value="edgeLabelBgBorderRadius"
                    :min="0"
                    :max="40"
                    :step="1"
                    @update:model-value="handleEdgeLabelBgBorderRadiusChange"
                  />
                </div>
                <LabeledFieldRow :label="t('nodeStyle.labelLineGap')">
                  <ToggleSwitch
                    :model-value="edgeLabelLineGap"
                    @update:model-value="handleEdgeLabelLineGapChange"
                  />
                </LabeledFieldRow>
          </LabelStyleSection>

          <!-- Line -->
          <EdgeStyleSection
            :title="t('nodeStyle.line')"
            :open="edgeSection.line"
            @toggle="toggleSection(edgeSection, 'line')"
          >
                <LabeledFieldRow :label="t('nodeStyle.color')">
                  <ColorWithAlphaField
                    :model-value="edgeStrokeColor"
                    :alpha-value="edgeStrokeOpacity"
                    @update:model-value="handleEdgeStrokeColorChange"
                    @update:alpha="(value) => handleEdgeStrokeOpacityChange(String(value))"
                  />
                </LabeledFieldRow>
                <LabeledFieldRow :label="t('nodeStyle.thickness')">
                  <input type="range" class="sp-range" :value="edgeStrokeWidth" min="0" max="20" step="1" @input="handleEdgeStrokeWidthChange(($event.target as HTMLInputElement).value)">
                  <input type="number" class="sp-input sp-input--tiny" :value="edgeStrokeWidth" min="0" max="20" step="1" @input="handleEdgeStrokeWidthChange(($event.target as HTMLInputElement).value)">
                </LabeledFieldRow>
                <LabeledFieldRow :label="t('nodeStyle.style')">
                  <div class="sp-segmented">
                    <button
                      type="button"
                      class="sp-segmented__btn"
                      :class="{ 'sp-segmented__btn--active': edgeLineStyle === 'solid' }"
                      @click="handleEdgeLineStyleChange('solid')"
                    >
                      <svg width="20" height="2" viewBox="0 0 20 2"><line x1="0" y1="1" x2="20" y2="1" stroke="currentColor" stroke-width="2"/></svg>
                    </button>
                    <button
                      type="button"
                      class="sp-segmented__btn"
                      :class="{ 'sp-segmented__btn--active': edgeLineStyle === 'dashed' }"
                      @click="handleEdgeLineStyleChange('dashed')"
                    >
                      <svg width="20" height="2" viewBox="0 0 20 2"><line x1="0" y1="1" x2="20" y2="1" stroke="currentColor" stroke-width="2" stroke-dasharray="4 3"/></svg>
                    </button>
                  </div>
                </LabeledFieldRow>
                <LabeledFieldRow v-if="edgeLineStyle === 'dashed'" :label="t('nodeStyle.pattern')">
                  <input type="text" class="sp-input sp-input--flex" :value="edgeLineDashPattern" placeholder="8,4" @change="handleEdgeLineDashChange(($event.target as HTMLInputElement).value)">
                </LabeledFieldRow>
                <LabeledFieldRow :label="t('nodeStyle.type')">
                  <div class="sp-segmented">
                    <button
                      v-for="edgeTypeOption in EDGE_TYPE_OPTIONS"
                      :key="edgeTypeOption.v"
                      type="button"
                      class="sp-segmented__btn"
                      :class="{ 'sp-segmented__btn--active': edgeType === edgeTypeOption.v }"
                      :title="edgeTypeOption.l"
                      @click="handleEdgeTypeChange(edgeTypeOption.v)"
                    >
                      <UiIcon :name="edgeTypeOption.icon" />
                    </button>
                  </div>
                </LabeledFieldRow>
          </EdgeStyleSection>

          <!-- Markers -->
          <EdgeStyleSection
            :title="t('nodeStyle.markers')"
            :open="edgeSection.markers"
            @toggle="toggleSection(edgeSection, 'markers')"
          >
                <!-- Start marker -->
                <div class="sp-marker-group">
                  <LabeledFieldRow :label="t('nodeStyle.start')">
                    <select class="sp-select sp-select--flex" :value="edgeStartMarker" @change="handleEdgeStartMarkerChange(($event.target as HTMLSelectElement).value)">
                      <option value="none">{{ t("nodeStyle.none") }}</option>
                      <option value="arrow">{{ t("nodeStyle.markerArrow") }}</option>
                      <option value="stealth">{{ t("nodeStyle.markerStealth") }}</option>
                      <option value="open">{{ t("nodeStyle.markerOpen") }}</option>
                      <option value="diamond">{{ t("nodeStyle.markerDiamond") }}</option>
                      <option value="circle">{{ t("nodeStyle.markerCircle") }}</option>
                      <option value="square">{{ t("nodeStyle.markerSquare") }}</option>
                    </select>
                  </LabeledFieldRow>
                  <template v-if="edgeStartMarker !== 'none'">
                    <LabeledFieldRow :label="t('nodeStyle.size')" indent>
                      <input type="number" class="sp-input sp-input--sm" :value="edgeStartMarkerSize" min="4" max="40" step="1" @input="handleEdgeStartMarkerSizeChange(($event.target as HTMLInputElement).value)">
                    </LabeledFieldRow>
                    <LabeledFieldRow :label="t('nodeStyle.fill')" indent>
                      <ColorWithAlphaField
                        :model-value="edgeStartMarkerFillColor"
                        :alpha-value="edgeStartMarkerFillOpacity"
                        @update:model-value="handleEdgeStartMarkerFillColorChange"
                        @update:alpha="(value) => handleEdgeStartMarkerFillOpacityChange(String(value))"
                      />
                    </LabeledFieldRow>
                  </template>
                </div>
                <!-- End marker -->
                <div class="sp-marker-group">
                  <LabeledFieldRow :label="t('nodeStyle.end')">
                    <select class="sp-select sp-select--flex" :value="edgeEndMarker" @change="handleEdgeEndMarkerChange(($event.target as HTMLSelectElement).value)">
                      <option value="none">{{ t("nodeStyle.none") }}</option>
                      <option value="arrow">{{ t("nodeStyle.markerArrow") }}</option>
                      <option value="stealth">{{ t("nodeStyle.markerStealth") }}</option>
                      <option value="open">{{ t("nodeStyle.markerOpen") }}</option>
                      <option value="diamond">{{ t("nodeStyle.markerDiamond") }}</option>
                      <option value="circle">{{ t("nodeStyle.markerCircle") }}</option>
                      <option value="square">{{ t("nodeStyle.markerSquare") }}</option>
                    </select>
                  </LabeledFieldRow>
                  <template v-if="edgeEndMarker !== 'none'">
                    <LabeledFieldRow :label="t('nodeStyle.size')" indent>
                      <input type="number" class="sp-input sp-input--sm" :value="edgeEndMarkerSize" min="4" max="40" step="1" @input="handleEdgeEndMarkerSizeChange(($event.target as HTMLInputElement).value)">
                    </LabeledFieldRow>
                    <LabeledFieldRow :label="t('nodeStyle.fill')" indent>
                      <ColorWithAlphaField
                        :model-value="edgeEndMarkerFillColor"
                        :alpha-value="edgeEndMarkerFillOpacity"
                        @update:model-value="handleEdgeEndMarkerFillColorChange"
                        @update:alpha="(value) => handleEdgeEndMarkerFillOpacityChange(String(value))"
                      />
                    </LabeledFieldRow>
                  </template>
                </div>
          </EdgeStyleSection>

        </template>

        <!-- ==================== NODE PANEL ==================== -->
        <template v-else>

          <!-- Label -->
          <LabelStyleSection
            :title="t('nodeStyle.label')"
            :open="nodeSection.label"
            @toggle="toggleSection(nodeSection, 'label')"
          >
                <LabeledFieldRow :label="t('nodeStyle.showLabel')">
                  <ToggleSwitch :model-value="showLabel" @update:model-value="handleShowLabelChange" />
                </LabeledFieldRow>
                <div class="sp-field">
                  <input class="sp-input sp-input--full" :value="label" :placeholder="t('nodeStyle.labelTextPlaceholder')" @input="handleLabelChange(($event.target as HTMLInputElement).value)">
                </div>
                <div class="sp-field">
                  <span class="sp-field__label">{{ t("nodeStyle.template") }}</span>
                  <input
                    class="sp-input sp-input--full"
                    :value="labelTemplate"
                    :placeholder="t('diagram.compositeLabelPlaceholder')"
                    @input="handleLabelTemplateChange(($event.target as HTMLInputElement).value)"
                  >
                  <p class="sp-field__hint sp-field__hint--small">{{ t('diagram.compositeLabelSyntax') }}</p>
                </div>
                <LabeledFieldRow :label="t('nodeStyle.color')">
                  <ColorWithAlphaField
                    :model-value="labelColor"
                    :alpha-value="labelOpacity"
                    @update:model-value="handleLabelColorChange"
                    @update:alpha="(value) => handleLabelOpacityChange(String(value))"
                  />
                </LabeledFieldRow>
                <div class="sp-field-grid sp-field-grid--2">
                  <LabeledNumberInput
                    :label="t('nodeStyle.size')"
                    :model-value="labelFontSize"
                    :min="8"
                    :max="72"
                    :step="1"
                    @update:model-value="handleLabelFontSizeChange"
                  />
                </div>
                <InsetSidesInput
                  :model-value="labelInset"
                  :min="0"
                  :max="50"
                  :step="1"
                  @update:model-value="handleLabelInsetChange"
                />
                <LabeledFieldRow :label="t('nodeStyle.align')">
                  <select class="sp-select sp-select--flex" :value="labelAlign" @change="handleLabelAlignChange(($event.target as HTMLSelectElement).value)">
                    <option value="center">{{ t("nodeStyle.alignCenter") }}</option>
                    <option value="left">{{ t("nodeStyle.alignLeft") }}</option>
                    <option value="right">{{ t("nodeStyle.alignRight") }}</option>
                  </select>
                </LabeledFieldRow>
                <LabeledFieldRow :label="t('nodeStyle.verticalAlign')">
                  <select class="sp-select sp-select--flex" :value="labelVerticalAlign" @change="handleLabelVerticalAlignChange(($event.target as HTMLSelectElement).value)">
                    <option value="top">{{ t("nodeStyle.positionTop") }}</option>
                    <option value="middle">{{ t("nodeStyle.alignCenter") }}</option>
                    <option value="bottom">{{ t("nodeStyle.positionBottom") }}</option>
                  </select>
                </LabeledFieldRow>
          </LabelStyleSection>

          <!-- Shape & Dimensions -->
          <NodeStyleSection
            :title="t('nodeStyle.figure')"
            :open="nodeSection.shape"
            @toggle="toggleSection(nodeSection, 'shape')"
          >
                <!-- Visual shape picker -->
                <div v-if="panelMode === 'default'" class="sp-shapes">
                  <button
                    v-for="shape in visibleNodeShapeOptions"
                    :key="shape.value"
                    type="button"
                    class="sp-shapes__item"
                    :class="{ 'sp-shapes__item--active': nodeShape === shape.value }"
                    :title="t(shape.labelKey)"
                    @click="handleNodeShapeChange(shape.value)"
                  >
                    <svg width="28" height="20" viewBox="0 0 28 20">
                      <rect v-if="shape.value === 'rectangle'" x="2" y="3" width="24" height="14" rx="1" stroke="currentColor" stroke-width="1.2" fill="none"/>
                      <polygon v-else-if="shape.value === 'beveled-rectangle'" points="5,3 23,3 26,6 26,17 23,20 5,20 2,17 2,6" stroke="currentColor" stroke-width="1.2" fill="none" transform="translate(0,-1.5)"/>
                      <polygon v-else-if="shape.value === 'diamond'" points="14,1 27,10 14,19 1,10" stroke="currentColor" stroke-width="1.2" fill="none"/>
                      <circle v-else-if="shape.value === 'circle'" cx="14" cy="10" r="8" stroke="currentColor" stroke-width="1.2" fill="none"/>
                      <polygon v-else-if="shape.value === 'trapezoid'" points="5,3 23,3 26,17 2,17" stroke="currentColor" stroke-width="1.2" fill="none"/>
                      <polygon v-else-if="shape.value === 'slanted-rectangle'" points="6,3 26,3 22,17 2,17" stroke="currentColor" stroke-width="1.2" fill="none"/>
                      <rect v-else-if="shape.value === 'custom'" x="4" y="5" width="20" height="10" rx="1" stroke="currentColor" stroke-width="1.2" stroke-dasharray="3 2" fill="none"/>
                      <g v-else-if="shape.value === 'composite'">
                        <rect x="3" y="3" width="22" height="14" rx="2" stroke="currentColor" stroke-width="1.2" fill="none"/>
                        <line x1="7" y1="8" x2="21" y2="8" stroke="currentColor" stroke-width="1.2"/>
                        <line x1="7" y1="12" x2="17" y2="12" stroke="currentColor" stroke-width="1.2"/>
                      </g>
                    </svg>
                  </button>
                </div>
                <LabeledFieldRow
                  v-if="panelMode === 'default' && (nodeShape === 'custom' || (nodeShape === 'composite' && compositeShapeType === 'custom'))"
                  :label="t('nodeStyle.customShape')"
                  class="sp-field--custom-shapes"
                >
                  <select
                    class="sp-select sp-select--flex"
                    :value="customShapeIdRef ?? ''"
                    @change="handleCustomShapeSelectByValue(($event.target as HTMLSelectElement).value)"
                  >
                    <option value="">{{ t("common.none") }}</option>
                    <option
                      v-for="opt in catalogShapeOptions"
                      :key="opt.id"
                      :value="opt.id"
                    >{{ opt.label }}</option>
                  </select>
                </LabeledFieldRow>
                <template v-if="showCompositeEditor">
                  <div class="sp-field-grid sp-field-grid--2">
                    <LabeledFieldRow :label="t('nodeStyle.compositeShapeType')">
                      <select
                        class="sp-select sp-select--flex"
                        :value="compositeShapeType"
                        @change="compositeShapeType = ($event.target as HTMLSelectElement).value as 'rectangle' | 'circle' | 'diamond' | 'custom'; if (compositeShapeType === 'custom') ensureCatalogShapesLoaded(); emitNodeStyle()"
                      >
                        <option value="rectangle">rectangle</option>
                        <option value="circle">circle</option>
                        <option value="diamond">diamond</option>
                        <option value="custom">custom</option>
                      </select>
                    </LabeledFieldRow>
                    <LabeledFieldRow
                      v-if="compositeShapeType === 'custom'"
                      :label="t('nodeStyle.customShape')"
                    >
                      <select
                        class="sp-select sp-select--flex"
                        :value="customShapeIdRef ?? ''"
                        @change="handleCustomShapeSelectByValue(($event.target as HTMLSelectElement).value)"
                      >
                        <option value="">{{ t("common.none") }}</option>
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
                        @update:model-value="compositeAutoSize = $event; emitNodeStyle()"
                      />
                    </LabeledFieldRow>
                  </div>
                  <div class="sp-field-grid sp-field-grid--2">
                    <LabeledNumberInput
                      :label="t('nodeStyle.compositeMinWidth')"
                      :model-value="compositeMinWidth"
                      :min="0"
                      :max="1000"
                      :step="10"
                      @update:model-value="compositeMinWidth = Number($event); emitNodeStyle()"
                    />
                    <LabeledNumberInput
                      :label="t('nodeStyle.compositeMinHeight')"
                      :model-value="compositeMinHeight"
                      :min="0"
                      :max="1000"
                      :step="10"
                      @update:model-value="compositeMinHeight = Number($event); emitNodeStyle()"
                    />
                  </div>
                  <div class="sp-segmented">
                    <button
                      type="button"
                      class="sp-segmented__btn"
                      :class="{ 'sp-segmented__btn--active': compositeEditorMode === 'visual' }"
                      @click="compositeEditorMode = 'visual'"
                    >
                      {{ t('nodeStyle.compositeVisualMode') }}
                    </button>
                    <button
                      type="button"
                      class="sp-segmented__btn"
                      :class="{ 'sp-segmented__btn--active': compositeEditorMode === 'json' }"
                      @click="compositeEditorMode = 'json'"
                    >
                      {{ t('nodeStyle.compositeJsonMode') }}
                    </button>
                  </div>

                  <template v-if="compositeEditorMode === 'visual'">
                    <CompositeTreeEditor
                      :model-value="compositeContentDraft"
                      @update:model-value="handleCompositeTreeUpdate"
                      @target-options="(targets) => { compositeTreeTargets = targets }"
                    />
                    <CompositeLivePreview :content="compositeContentDraft" />
                    <A5BindingsEditor
                      :model-value="styleBindingsDraft"
                      :component-properties="componentPropsForA5"
                      :node-type-properties="nodeTypePropsForA5"
                      :target-options="compositeTreeTargets"
                      @update:model-value="handleA5BindingsUpdate"
                    />
                  </template>

                  <template v-else>
                    <LabeledFieldRow :label="t('nodeStyle.compositeContentJson')">
                      <textarea
                        class="sp-textarea sp-textarea--code"
                        :value="compositeContentJson"
                        rows="7"
                        @input="handleCompositeContentInput(($event.target as HTMLTextAreaElement).value)"
                        @blur="applyCompositeContentJson"
                      />
                    </LabeledFieldRow>
                    <div class="sp-help-text">{{ compositeJsonError || t('nodeStyle.compositeJsonHint') }}</div>
                    <LabeledFieldRow :label="t('nodeStyle.compositeBindingsJson')">
                      <textarea
                        class="sp-textarea sp-textarea--code"
                        :value="styleBindingsJson"
                        rows="6"
                        @input="handleStyleBindingsInput(($event.target as HTMLTextAreaElement).value)"
                        @blur="applyStyleBindingsJson"
                      />
                    </LabeledFieldRow>
                    <div class="sp-help-text">{{ styleBindingsJsonError || t('nodeStyle.compositeBindingsHint') }}</div>
                  </template>
                  <div v-if="compositeValidationIssues.length > 0" class="sp-validation-list">
                    <div v-for="issue in compositeValidationIssues" :key="`${issue.code}-${issue.path}`" class="sp-validation-item">
                      <strong>{{ issue.code }}</strong>: {{ issue.message }}
                    </div>
                  </div>
                </template>
                <div class="sp-field-grid" :class="nodeShape === 'rectangle' || nodeShape === 'beveled-rectangle' ? 'sp-field-grid--3' : 'sp-field-grid--2'">
                  <LabeledNumberInput
                    label="W"
                    :model-value="nodeWidth"
                    :min="10"
                    :max="500"
                    :step="10"
                    @update:model-value="handleWidthChange"
                  />
                  <LabeledNumberInput
                    label="H"
                    :model-value="nodeHeight"
                    :min="10"
                    :max="300"
                    :step="10"
                    @update:model-value="handleHeightChange"
                  />
                  <LabeledNumberInput
                    v-if="nodeShape === 'rectangle'"
                    label="R"
                    :model-value="cornerRadius"
                    :min="0"
                    :max="50"
                    :step="1"
                    @update:model-value="handleCornerRadiusChange"
                  />
                  <LabeledNumberInput
                    v-if="nodeShape === 'beveled-rectangle'"
                    :label="t('nodeStyle.cornerCut')"
                    :model-value="cornerCut"
                    :min="0"
                    :max="80"
                    :step="1"
                    @update:model-value="handleCornerCutChange"
                  />
                </div>
                <InsetSidesInput
                  :model-value="contentInset"
                  :scale-value="contentInsetScale"
                  :min="0"
                  :max="100"
                  :step="1"
                  @update:model-value="handleContentInsetChange"
                  @update:scale-value="handleContentInsetScaleChange"
                />
                <div class="sp-field-grid sp-field-grid--4">
                  <LabeledNumberInput
                    label="PT"
                    :model-value="nodePortsTop"
                    :min="0"
                    :max="16"
                    :step="1"
                    @update:model-value="handlePortsTopChange"
                  />
                  <LabeledNumberInput
                    label="PB"
                    :model-value="nodePortsBottom"
                    :min="0"
                    :max="16"
                    :step="1"
                    @update:model-value="handlePortsBottomChange"
                  />
                  <LabeledNumberInput
                    label="PL"
                    :model-value="nodePortsLeft"
                    :min="0"
                    :max="16"
                    :step="1"
                    @update:model-value="handlePortsLeftChange"
                  />
                  <LabeledNumberInput
                    label="PR"
                    :model-value="nodePortsRight"
                    :min="0"
                    :max="16"
                    :step="1"
                    @update:model-value="handlePortsRightChange"
                  />
                </div>
          </NodeStyleSection>

          <!-- Fill & Stroke -->
          <NodeStyleSection
            :title="t('nodeStyle.fillAndStroke')"
            :open="nodeSection.fill"
            @toggle="toggleSection(nodeSection, 'fill')"
          >
                <LabeledFieldRow :label="t('nodeStyle.fill')">
                  <ColorWithAlphaField
                    :model-value="fillColor"
                    :alpha-value="fillOpacity"
                    @update:model-value="handleFillChange"
                    @update:alpha="(value) => handleFillOpacityChange(String(value))"
                  />
                </LabeledFieldRow>
                <LabeledFieldRow :label="t('nodeStyle.stroke')">
                  <ColorWithAlphaField
                    :model-value="strokeColor"
                    :alpha-value="strokeOpacity"
                    @update:model-value="handleStrokeColorChange"
                    @update:alpha="(value) => handleStrokeOpacityChange(String(value))"
                  />
                </LabeledFieldRow>
                <LabeledFieldRow :label="t('nodeStyle.thickness')">
                  <input type="range" class="sp-range" :value="strokeWidth" min="0" max="20" step="1" @input="handleStrokeWidthChange(($event.target as HTMLInputElement).value)">
                  <input type="number" class="sp-input sp-input--tiny" :value="strokeWidth" min="0" max="20" step="1" @input="handleStrokeWidthChange(($event.target as HTMLInputElement).value)">
                </LabeledFieldRow>
                <LabeledFieldRow :label="t('nodeStyle.style')">
                  <div class="sp-segmented">
                    <button
                      type="button"
                      class="sp-segmented__btn"
                      :class="{ 'sp-segmented__btn--active': lineStyle === 'solid' }"
                      @click="handleLineStyleChange('solid')"
                    >
                      <svg width="20" height="2" viewBox="0 0 20 2"><line x1="0" y1="1" x2="20" y2="1" stroke="currentColor" stroke-width="2"/></svg>
                    </button>
                    <button
                      type="button"
                      class="sp-segmented__btn"
                      :class="{ 'sp-segmented__btn--active': lineStyle === 'dashed' }"
                      @click="handleLineStyleChange('dashed')"
                    >
                      <svg width="20" height="2" viewBox="0 0 20 2"><line x1="0" y1="1" x2="20" y2="1" stroke="currentColor" stroke-width="2" stroke-dasharray="4 3"/></svg>
                    </button>
                  </div>
                </LabeledFieldRow>
                <LabeledFieldRow v-if="lineStyle === 'dashed'" :label="t('nodeStyle.pattern')">
                  <input type="text" class="sp-input sp-input--flex" :value="lineDashPattern" placeholder="8,4" @change="handleLineDashChange(($event.target as HTMLInputElement).value)">
                </LabeledFieldRow>
          </NodeStyleSection>

          <!-- Icon -->
          <NodeStyleSection
            :title="t('nodeStyle.icon')"
            :open="nodeSection.icon"
            :pill="iconName || null"
            @toggle="toggleSection(nodeSection, 'icon')"
          >
                <LabeledFieldRow :label="t('nodeStyle.icon')">
                  <div class="sp-icon-select">
                    <SearchableSelect
                      :model-value="iconName"
                      :options="iconSelectOptions"
                      allow-empty
                      :empty-label="t('nodeStyle.none')"
                      :placeholder="t('nodeStyle.none')"
                      :search-placeholder="t('common.search')"
                      :empty-text="t('common.nothingFound')"
                      :min-search-length="ICON_SELECT_MIN_SEARCH_LENGTH"
                      :min-search-hint="t('common.typeToSearch')"
                      @update:model-value="handleIconChange"
                    >
                      <template #option="{ option }">
                        <span class="sp-icon-option">
                          <LazyIconImg
                            :icon-id="option.id"
                            :alt="option.label"
                            img-class="sp-icon-option__preview"
                          />
                          {{ option.label }}
                        </span>
                      </template>
                    </SearchableSelect>
                    <LazyIconImg
                      v-if="iconName"
                      :icon-id="iconName"
                      :alt="iconName"
                      img-class="sp-icon-select__preview"
                      eager
                    />
                  </div>
                </LabeledFieldRow>
                <template v-if="iconName">
                  <LabeledFieldRow :label="t('nodeStyle.position')">
                    <select class="sp-select sp-select--flex" :value="iconPlacement" @change="handleIconPlacementChange(($event.target as HTMLSelectElement).value)">
                      <option value="top-left">{{ t("nodeStyle.positionTopLeft") }}</option>
                      <option value="top-right">{{ t("nodeStyle.positionTopRight") }}</option>
                      <option value="bottom-left">{{ t("nodeStyle.positionBottomLeft") }}</option>
                      <option value="bottom-right">{{ t("nodeStyle.positionBottomRight") }}</option>
                      <option value="center">{{ t("nodeStyle.alignCenter") }}</option>
                      <option value="top">{{ t("nodeStyle.positionTop") }}</option>
                      <option value="bottom">{{ t("nodeStyle.positionBottom") }}</option>
                      <option value="left">{{ t("nodeStyle.positionLeft") }}</option>
                      <option value="right">{{ t("nodeStyle.positionRight") }}</option>
                    </select>
                  </LabeledFieldRow>
                  <LabeledFieldRow :label="t('nodeStyle.lines')">
                    <SketchColorField
                      :model-value="iconStrokeColor"
                      :title="t('nodeStyle.lines')"
                      @update:model-value="handleIconStrokeColorChange"
                    />
                  </LabeledFieldRow>
                  <LabeledFieldRow :label="t('nodeStyle.fill')">
                    <SketchColorField
                      :model-value="iconFillColor"
                      :title="t('nodeStyle.fill')"
                      @update:model-value="handleIconFillColorChange"
                    />
                  </LabeledFieldRow>
                  <div class="sp-field-grid sp-field-grid--3">
                    <LabeledNumberInput
                      label="W"
                      :model-value="iconWidth"
                      :min="1"
                      :max="200"
                      :step="1"
                      @update:model-value="handleIconWidthChange"
                    />
                    <LabeledNumberInput
                      label="H"
                      :model-value="iconHeight"
                      :min="1"
                      :max="200"
                      :step="1"
                      @update:model-value="handleIconHeightChange"
                    />
                    <LabeledNumberInput
                      :label="t('nodeStyle.inset')"
                      :model-value="iconInset"
                      :min="0"
                      :max="100"
                      :step="1"
                      @update:model-value="handleIconInsetChange"
                    />
                  </div>
                </template>
          </NodeStyleSection>

        </template>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* ========================================
   Style Panel — refined design-tool aesthetic
   ======================================== */

.sp {
  --sp-h: 28px;
  --sp-radius: 6px;
  --sp-gap: 6px;
  --sp-pad: 12px;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  min-width: 0;
  background: var(--surface-panel);
  font-size: 12px;
  color: var(--base-text);
}

/* ---- Empty state ---- */
.sp-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 48px 24px;
  flex: 1;
}

.sp-empty__graphic {
  color: var(--border-strong);
  opacity: 0.6;
}

.sp-empty__text {
  font-size: 12px;
  color: var(--text-subtle);
  letter-spacing: 0.01em;
}

/* ---- Header ---- */
.sp-header {
  padding: 10px var(--sp-pad);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.sp-header__type {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 3px 8px 3px 6px;
  border-radius: 5px;
}

.sp-header__type--node {
  color: var(--primary);
  background: var(--primary-soft);
}

.sp-header__type--edge {
  color: var(--accent);
  background: var(--accent-soft);
}

.sp-header__type svg {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.sp-header__actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.sp-header__btn {
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
}

.sp-header__btn:hover:not(:disabled) {
  color: var(--primary);
  border-color: var(--primary);
  background: var(--primary-soft);
}

.sp-header__btn .ui-icon {
  width: 16px;
  height: 16px;
}

.sp-header__btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* ---- Preset bar ---- */
.sp-preset {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px var(--sp-pad);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.sp-preset .sp-select--preset {
  flex: 1;
  min-width: 0;
}

.sp-preset__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--sp-h);
  height: var(--sp-h);
  border: none;
  border-radius: var(--sp-radius);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s ease;
}

.sp-preset__btn .ui-icon {
  width: 16px;
  height: 16px;
}

.sp-preset__btn:hover {
  background: var(--surface-strong);
  color: var(--base-text);
}

.sp-preset__btn--danger:hover {
  background: var(--danger-soft);
  color: var(--danger);
}

/* ---- Save preset form ---- */
.sp-save-form {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px var(--sp-pad);
  background: var(--surface-muted);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.sp-save-form__input {
  flex: 1;
  min-width: 0;
}

.sp-save-form__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--sp-h);
  height: var(--sp-h);
  border: none;
  border-radius: var(--sp-radius);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s ease;
}

.sp-save-form__btn .ui-icon {
  width: 16px;
  height: 16px;
}

.sp-save-form__btn:hover {
  background: var(--surface-strong);
  color: var(--base-text);
}

.sp-save-form__btn--ok:hover {
  background: var(--success-soft);
  color: var(--success);
}

/* ---- Scrollable body ---- */
.sp-body {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
}

/* ---- Fields ---- */
.sp-field {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.sp-field__label {
  font-size: 11px;
  color: var(--text-subtle);
  white-space: nowrap;
  flex-shrink: 0;
  min-width: 48px;
}

.sp-field__hint {
  margin: 0;
  font-size: 11px;
  line-height: 1.35;
  color: var(--text-subtle);
}

.sp-field__hint--small {
  font-size: 10px;
}

/* ---- Field grid ---- */
.sp-field-grid {
  display: grid;
  gap: 6px;
}

.sp-field-grid--2 {
  grid-template-columns: 1fr 1fr;
}

.sp-field-grid--3 {
  grid-template-columns: 1fr 1fr 1fr;
}

.sp-field-grid--4 {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.sp-field-grid--dims {
  grid-template-columns: repeat(auto-fill, minmax(56px, 1fr));
}

/* ---- Inputs ---- */
.sp-input {
  height: var(--sp-h);
  padding: 0 7px;
  font-size: 12px;
  font-family: inherit;
  border: 1px solid var(--border);
  border-radius: var(--sp-radius);
  background: var(--surface-muted);
  color: var(--base-text);
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  box-sizing: border-box;
}

.sp-input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px var(--primary-soft);
}

.sp-input--full {
  width: 100%;
}

.sp-input--flex {
  flex: 1;
  min-width: 0;
}

.sp-input--sm {
  width: 100%;
}

.sp-input--tiny {
  width: 48px;
  flex-shrink: 0;
  text-align: center;
  padding: 0 3px;
}

.sp-input--hex {
  flex: 1;
  min-width: 0;
  font-family: "SF Mono", "Fira Code", "Cascadia Code", monospace;
  font-size: 11px;
  letter-spacing: -0.01em;
}

/* ---- Selects ---- */
.sp-select {
  height: var(--sp-h);
  padding: 0 6px;
  font-size: 12px;
  font-family: inherit;
  border: 1px solid var(--border);
  border-radius: var(--sp-radius);
  background: var(--surface-muted);
  color: var(--base-text);
  cursor: pointer;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  min-width: 0;
}

.sp-select:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px var(--primary-soft);
}

.sp-select--flex {
  flex: 1;
  min-width: 0;
}

/* ---- Range slider ---- */
.sp-range {
  flex: 1;
  min-width: 0;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: var(--border);
  border-radius: 2px;
  outline: none;
  cursor: pointer;
}

.sp-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--primary);
  border: 2px solid white;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
  cursor: pointer;
  transition: box-shadow 0.15s ease;
}

.sp-range::-webkit-slider-thumb:hover {
  box-shadow: 0 0 0 3px var(--primary-soft), 0 1px 3px rgba(0, 0, 0, 0.15);
}

.sp-range::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--primary);
  border: 2px solid white;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
  cursor: pointer;
}

/* ---- Segmented control ---- */
.sp-segmented {
  display: flex;
  border: 1px solid var(--border);
  border-radius: var(--sp-radius);
  overflow: hidden;
  background: var(--surface-muted);
}

.sp-segmented__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  height: calc(var(--sp-h) - 2px);
  padding: 0 8px;
  border: none;
  background: transparent;
  color: var(--text-subtle);
  cursor: pointer;
  transition: all 0.15s ease;
  font-family: inherit;
}

.sp-segmented__btn .ui-icon {
  width: 16px;
  height: 16px;
}

.sp-segmented__btn + .sp-segmented__btn {
  border-left: 1px solid var(--border);
}

.sp-segmented__btn:hover {
  background: var(--surface-strong);
  color: var(--base-text);
}

.sp-segmented__btn--active {
  background: var(--primary-soft);
  color: var(--primary);
}

.sp-segmented__btn--active:hover {
  background: var(--primary-soft);
  color: var(--primary);
}

/* ---- Shape picker ---- */
.sp-shapes {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.sp-shapes__item {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 30px;
  border: 1px solid var(--border);
  border-radius: var(--sp-radius);
  background: var(--surface-muted);
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.sp-shapes__item:hover {
  border-color: var(--border-strong);
  color: var(--base-text);
  background: var(--surface-strong);
}

.sp-shapes__item--active {
  border-color: var(--primary);
  color: var(--primary);
  background: var(--primary-soft);
  box-shadow: 0 0 0 1px var(--primary);
}

.sp-shapes__item--active:hover {
  border-color: var(--primary);
  color: var(--primary);
  background: var(--primary-soft);
}

/* ---- Icon select with preview ---- */
.sp-icon-select {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
}

.sp-icon-select .sp-select {
  flex: 1;
  min-width: 0;
}

.sp-icon-select__preview {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  opacity: 0.7;
}

.sp-icon-option {
  display: flex;
  align-items: center;
  gap: 6px;
}

.sp-icon-option__preview {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  opacity: 0.7;
}

/* ---- Marker group ---- */
.sp-marker-group {
  display: flex;
  flex-direction: column;
  gap: var(--sp-gap);
}

.sp-marker-group + .sp-marker-group {
  padding-top: var(--sp-gap);
  border-top: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
}

/* ---- Transitions ---- */
.sp-slide-enter-active,
.sp-slide-leave-active {
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}

.sp-slide-enter-from,
.sp-slide-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}

.sp-slide-enter-to,
.sp-slide-leave-from {
  opacity: 1;
  max-height: 60px;
}

/* ---- Scrollbar ---- */
.sp-body::-webkit-scrollbar {
  width: 5px;
}

.sp-body::-webkit-scrollbar-track {
  background: transparent;
}

.sp-body::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 3px;
}

.sp-body::-webkit-scrollbar-thumb:hover {
  background: var(--border-strong);
}

.sp-textarea {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 10px;
  background: var(--surface);
  color: var(--base-text);
  resize: vertical;
}

.sp-textarea--code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  line-height: 1.4;
}

.sp-help-text {
  margin-top: -6px;
  margin-bottom: 6px;
  font-size: 12px;
  color: var(--text-muted);
}

.sp-validation-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
}

.sp-validation-item {
  font-size: 12px;
  color: var(--danger);
}
</style>
