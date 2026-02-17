<script setup lang="ts">
import {ref, reactive, computed, watch} from "vue";
import type {InteractionManager, DiagramRenderer, Node, Edge} from "papirus";
import type {DiagramStyle} from "../notationAttrs";
import {
  getAllComponentPresets,
  getAllRelationPresets,
  saveUserComponentPreset,
  saveUserRelationPreset,
  deleteUserComponentPreset,
  deleteUserRelationPreset,
  type ComponentStylePreset,
  type RelationStylePreset
} from "../styles/stylePresets";

const props = defineProps<{
  selectedElementId: string | null;
  interactionManager: InteractionManager | null;
  renderer: DiagramRenderer | null;
}>();

const emit = defineEmits<{
  (e: "style-change", style: DiagramStyle): void;
}>();

type NodeShape =
  | "rectangle"
  | "beveled-rectangle"
  | "diamond"
  | "circle"
  | "trapezoid"
  | "slanted-rectangle";

type IconPlacement =
  | "center"
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

function emitNodeStyle() {
  const style: DiagramStyle = {
    nodeShape: nodeShape.value,
    fillColor: fillColor.value,
    fillOpacity: fillOpacity.value,
    strokeColor: strokeColor.value,
    strokeOpacity: strokeOpacity.value,
    strokeWidth: strokeWidth.value,
    cornerRadius: cornerRadius.value,
    opacity: opacity.value,
    labelColor: labelColor.value,
    labelOpacity: labelOpacity.value,
    labelFontSize: labelFontSize.value,
    labelPadding: labelPadding.value,
    labelMargin: labelMargin.value,
    labelPlacement: labelPlacement.value,
    width: nodeWidth.value,
    height: nodeHeight.value,
    ...(iconName.value
      ? {
          iconName: iconName.value,
          iconPlacement: iconPlacement.value,
          iconWidth: iconWidth.value,
          iconHeight: iconHeight.value,
          iconPadding: iconPadding.value,
          iconMargin: iconMargin.value,
          iconStrokeColor: iconStrokeColor.value,
          iconFillColor: iconFillColor.value
        }
      : {})
  };
  if (lineStyle.value === "dashed") {
    const pattern = lineDashPattern.value.trim() || "8,4";
    style.lineDash = pattern.split(",").map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
  }
  emit("style-change", style);
}

function emitEdgeStyle() {
  const style: DiagramStyle = {
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
    labelBgColor: edgeLabelBgColor.value,
    labelBgOpacity: edgeLabelBgOpacity.value,
    startMarkerSize: edgeStartMarkerSize.value,
    startMarkerFillColor: edgeStartMarkerFillColor.value,
    startMarkerFillOpacity: edgeStartMarkerFillOpacity.value,
    endMarkerSize: edgeEndMarkerSize.value,
    endMarkerFillColor: edgeEndMarkerFillColor.value,
    endMarkerFillOpacity: edgeEndMarkerFillOpacity.value
  };
  if (edgeLineStyle.value === "dashed") {
    const pattern = edgeLineDashPattern.value.trim() || "8,4";
    style.lineDash = pattern.split(",").map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
  }
  emit("style-change", style);
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
  presetVersion.value; // dependency for reactivity
  return getAllComponentPresets();
});
const relationStylePresets = computed<RelationStylePreset[]>(() => {
  presetVersion.value;
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
    const style: import("../notationAttrs").DiagramStyle = {
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
      labelBgColor: edgeLabelBgColor.value,
      labelBgOpacity: edgeLabelBgOpacity.value,
      startMarkerSize: edgeStartMarkerSize.value,
      startMarkerFillColor: edgeStartMarkerFillColor.value,
      startMarkerFillOpacity: edgeStartMarkerFillOpacity.value,
      endMarkerSize: edgeEndMarkerSize.value,
      endMarkerFillColor: edgeEndMarkerFillColor.value,
      endMarkerFillOpacity: edgeEndMarkerFillOpacity.value
    };
    if (edgeLineStyle.value === "dashed") {
      const pattern = edgeLineDashPattern.value.trim() || "8,4";
      style.lineDash = pattern.split(",").map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
    }
    saveUserRelationPreset({ name, label, style });
    selectedRelationPreset.value = name;
  } else {
    const style: import("../notationAttrs").DiagramStyle = {
      nodeShape: nodeShape.value,
      fillColor: fillColor.value,
      fillOpacity: fillOpacity.value,
      strokeColor: strokeColor.value,
      strokeOpacity: strokeOpacity.value,
      strokeWidth: strokeWidth.value,
      cornerRadius: cornerRadius.value,
      opacity: opacity.value,
      labelColor: labelColor.value,
      labelOpacity: labelOpacity.value,
      labelFontSize: labelFontSize.value,
      labelPadding: labelPadding.value,
      labelMargin: labelMargin.value,
      labelPlacement: labelPlacement.value,
      width: nodeWidth.value,
      height: nodeHeight.value,
      ...(iconName.value
        ? {
            iconName: iconName.value,
            iconPlacement: iconPlacement.value,
            iconWidth: iconWidth.value,
            iconHeight: iconHeight.value,
            iconPadding: iconPadding.value,
            iconMargin: iconMargin.value,
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
  nodeShape.value = NODE_SHAPE_OPTIONS.some((option) => option.value === style.nodeShape)
    ? (style.nodeShape as NodeShape)
    : "rectangle";
  fillColor.value = style.fillColor ?? "#ffffff";
  fillOpacity.value = style.fillOpacity ?? 1;
  strokeColor.value = style.strokeColor ?? "#333333";
  strokeOpacity.value = style.strokeOpacity ?? 1;
  strokeWidth.value = style.strokeWidth ?? 2;
  cornerRadius.value = style.cornerRadius ?? 0;
  opacity.value = style.opacity ?? 1;
  labelColor.value = style.labelColor ?? "#333333";
  labelOpacity.value = style.labelOpacity ?? 1;
  labelFontSize.value = style.labelFontSize ?? 14;
  labelPadding.value = style.labelPadding ?? 8;
  labelMargin.value = style.labelMargin ?? 0;
  labelPlacement.value = (style.labelPlacement as any) ?? "auto";
  // Only update dimensions if explicitly specified in preset
  if (style.width !== undefined) nodeWidth.value = style.width;
  if (style.height !== undefined) nodeHeight.value = style.height;
  
  if (style.lineDash && style.lineDash.length > 0) {
    lineStyle.value = "dashed";
    lineDashPattern.value = style.lineDash.join(",");
  } else {
    lineStyle.value = "solid";
    lineDashPattern.value = "8,4";
  }
  
  if (style.iconName) {
    iconName.value = style.iconName;
    iconPlacement.value = (style.iconPlacement as IconPlacement) ?? "top-left";
    iconWidth.value = style.iconWidth ?? 20;
    iconHeight.value = style.iconHeight ?? 20;
    iconPadding.value = style.iconPadding ?? 8;
    iconMargin.value = style.iconMargin ?? 0;
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
    if (node.label) {
      node.label.style = {
        ...(node.label.style || {}),
        color: labelColor.value,
        fontSize: labelFontSize.value,
        opacity: labelOpacity.value
      } as any;
      (node.label as any)._padding = labelPadding.value;
      (node.label as any)._margin = labelMargin.value;
    }
    (node as any).labelPlacement = labelPlacement.value;
    
    // Apply dimensions and corner radius
    node.width = nodeWidth.value;
    node.height = nodeHeight.value;
    (node as any).cornerRadius = cornerRadius.value;
    
    if (iconName.value) {
      (node as any).icon = {
        source: `/icons/${iconName.value}.svg`,
        placement: iconPlacement.value,
        width: iconWidth.value,
        height: iconHeight.value,
        fit: "contain",
        padding: iconPadding.value,
        margin: iconMargin.value,
        strokeColor: iconStrokeColor.value,
        fillColor: iconFillColor.value
      };
    } else {
      (node as any).icon = undefined;
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
  edgeType.value = (style.edgeType as any) ?? "polyline";
  edgeStartMarker.value = (style.startMarkerType as any) ?? "none";
  edgeEndMarker.value = (style.endMarkerType as any) ?? "open";
  edgeLabelColor.value = style.labelColor ?? "#333333";
  edgeLabelOpacity.value = style.labelOpacity ?? 1;
  edgeLabelFontSize.value = style.labelFontSize ?? 14;
  edgeLabelBgColor.value = style.labelBgColor ?? "#ffffff";
  edgeLabelBgOpacity.value = style.labelBgOpacity ?? 1;
  
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
      edge.label.style = {
        ...(edge.label.style || {}),
        color: edgeLabelColor.value,
        fontSize: edgeLabelFontSize.value,
        opacity: edgeLabelOpacity.value
      } as any;
    }
    (edge as any).labelBackground = { 
      color: edgeLabelBgColor.value,
      opacity: edgeLabelBgOpacity.value 
    };
  });
  
  emitEdgeStyle();
}

const AVAILABLE_ICONS = [
  "actor", "artifact", "assessment", "capability", "circle", "collaboration",
  "communication_network", "component_group", "component", "constraint",
  "contract", "course_of_action", "deliverable", "device",
  "distribution_network", "driver", "equipment", "event", "facility",
  "function", "gap", "goal", "group", "grouping", "hidden_rectangle", "interaction",
  "interface", "location", "material", "meaning", "node", "object", "octagon",
  "outcome", "path", "plateau", "principle", "process", "product",
  "rectangle", "representation", "requirement", "resource", "rhombus",
  "role", "rounded_rectangle", "service", "stakeholder", "system_software",
  "text", "value_stream", "value", "work_package"
] as const;

const NODE_SHAPE_OPTIONS: ReadonlyArray<{ value: NodeShape; label: string }> = [
  { value: "rectangle", label: "Прямоугольник" },
  { value: "beveled-rectangle", label: "Прямоугольник с фаской" },
  { value: "diamond", label: "Ромб" },
  { value: "circle", label: "Круг" },
  { value: "trapezoid", label: "Усеченная пирамида" },
  { value: "slanted-rectangle", label: "Параллелограмм" }
];

// --- Node style state ---
const iconName = ref("");
const iconPlacement = ref<IconPlacement>("top-left");
const iconWidth = ref(20);
const iconHeight = ref(20);
const iconPadding = ref(8);
const iconMargin = ref(0);
const iconStrokeColor = ref("#000000");
const iconFillColor = ref("#000000");
const nodeShape = ref<NodeShape>("rectangle");
const label = ref("");
const fillColor = ref("#ffffff");
const fillOpacity = ref(1);
const strokeColor = ref("#333333");
const strokeOpacity = ref(1);
const strokeWidth = ref(2);
const cornerRadius = ref(0);
const opacity = ref(1);
const lineStyle = ref<"solid" | "dashed">("solid");
const lineDashPattern = ref("8,4");
const labelColor = ref("#333333");
const labelOpacity = ref(1);
const labelFontSize = ref(14);
const labelPadding = ref(8);
const labelMargin = ref(0);
const labelPlacement = ref<"auto" | "center" | "top" | "bottom" | "left" | "right">("auto");
const nodeWidth = ref(140);
const nodeHeight = ref(50);

// --- Edge style state ---
const edgeLabel = ref("");
const edgeStrokeColor = ref("#666666");
const edgeStrokeOpacity = ref(1);
const edgeStrokeWidth = ref(2);
const edgeLineStyle = ref<"solid" | "dashed">("solid");
const edgeLineDashPattern = ref("8,4");
const edgeType = ref<"straight" | "polyline" | "bezier">("polyline");
const edgeEndMarker = ref<"none" | "arrow" | "open" | "diamond" | "circle">("open");
const edgeStartMarker = ref<"none" | "arrow" | "open" | "diamond" | "circle">("none");
const edgeOpacity = ref(1);
const edgeLabelColor = ref("#333333");
const edgeLabelOpacity = ref(1);
const edgeLabelFontSize = ref(14);
const edgeLabelBgColor = ref("#ffffff");
const edgeLabelBgOpacity = ref(1);
const edgeStartMarkerSize = ref(12);
const edgeStartMarkerFillColor = ref("#000000");
const edgeStartMarkerFillOpacity = ref(1);
const edgeEndMarkerSize = ref(12);
const edgeEndMarkerFillColor = ref("#000000");
const edgeEndMarkerFillOpacity = ref(1);

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

  // Load icon
  const iconSource = (node as any).icon?.options?.source as string | undefined;
  if (iconSource && typeof iconSource === "string") {
    const match = iconSource.match(/\/icons\/(.+)\.svg$/);
    iconName.value = match?.[1] ?? "";
  } else {
    iconName.value = "";
  }
  const iconOptions = (node as any).icon?.options as Record<string, unknown> | undefined;
  iconPlacement.value = (iconOptions?.placement as IconPlacement) ?? "top-left";
  iconWidth.value = Math.round(Number(iconOptions?.width ?? 20));
  iconHeight.value = Math.round(Number(iconOptions?.height ?? 20));
  iconPadding.value = Number(iconOptions?.padding ?? 8);
  iconMargin.value = Number(iconOptions?.margin ?? 0);
  iconStrokeColor.value = (iconOptions?.strokeColor as string) ?? "#000000";
  iconFillColor.value = (iconOptions?.fillColor as string) ?? "#000000";

  const rawShape = (node as any).shapeType as NodeShape | undefined;
  if (
    rawShape === "rectangle" ||
    rawShape === "beveled-rectangle" ||
    rawShape === "diamond" ||
    rawShape === "circle" ||
    rawShape === "trapezoid" ||
    rawShape === "slanted-rectangle"
  ) {
    nodeShape.value = rawShape;
  } else {
    const typeName = (node as any).typeName as string | undefined;
    nodeShape.value =
      typeName === "diamond"
        ? "diamond"
        : typeName === "circle"
          ? "circle"
          : "rectangle";
  }

  label.value = node.label?.text ?? "";
  const style = node.style || {};
  fillColor.value = style.fillColor || "#ffffff";
  fillOpacity.value = (style as any).fillOpacity ?? 1;
  strokeColor.value = style.strokeColor || "#333333";
  strokeOpacity.value = (style as any).strokeOpacity ?? 1;
  strokeWidth.value = style.strokeWidth ?? 2;
  opacity.value = style.opacity ?? 1;

  const lineDash = style.lineDash || [];
  lineStyle.value = lineDash.length > 0 ? "dashed" : "solid";
  lineDashPattern.value = lineDash.length > 0 ? lineDash.join(",") : "8,4";

  if ("cornerRadius" in node) {
    cornerRadius.value = (node as any).cornerRadius ?? 0;
  } else {
    cornerRadius.value = 0;
  }

  const labelStyle = node.label?.style;
  labelColor.value = labelStyle?.color || "#333333";
  labelOpacity.value = (labelStyle as any)?.opacity ?? 1;
  labelFontSize.value = labelStyle?.fontSize ?? 14;
  labelPadding.value = node.label?.padding ?? 8;
  labelMargin.value = node.label?.margin ?? 0;
  labelPlacement.value = (node as any).labelPlacement ?? "auto";

  // Load node dimensions
  nodeWidth.value = Math.round(node.width ?? 140);
  nodeHeight.value = Math.round(node.height ?? 50);
}

function loadEdgeProps() {
  const edge = getSelectedEdge();
  if (!edge) return;

  edgeLabel.value = edge.label?.text ?? "";
  const style = edge.style || {};
  edgeStrokeColor.value = style.strokeColor || "#666666";
  edgeStrokeOpacity.value = (style as any).strokeOpacity ?? 1;
  edgeStrokeWidth.value = style.strokeWidth ?? 2;
  edgeOpacity.value = style.opacity ?? 1;
  edgeType.value = edge.type ?? "polyline";

  const lineDash = style.lineDash || [];
  edgeLineStyle.value = lineDash.length > 0 ? "dashed" : "solid";
  edgeLineDashPattern.value = lineDash.length > 0 ? lineDash.join(",") : "8,4";

  edgeEndMarker.value = edge.endMarker?.type ?? "none";
  edgeStartMarker.value = edge.startMarker?.type ?? "none";

  const eLabelStyle = edge.label?.style;
  edgeLabelColor.value = eLabelStyle?.color || "#333333";
  edgeLabelOpacity.value = (eLabelStyle as any)?.opacity ?? 1;
  edgeLabelFontSize.value = eLabelStyle?.fontSize ?? 14;
  edgeLabelBgColor.value = (edge as any).labelBackground?.color || "#ffffff";
  edgeLabelBgOpacity.value = ((edge as any).labelBackground as any)?.opacity ?? 1;
  edgeStartMarkerSize.value = edge.startMarker?.size ?? 12;
  edgeStartMarkerFillColor.value = edge.startMarker?.fillColor || "#000000";
  edgeStartMarkerFillOpacity.value = edge.startMarker?.fillOpacity ?? 1;
  edgeEndMarkerSize.value = edge.endMarker?.size ?? 12;
  edgeEndMarkerFillColor.value = edge.endMarker?.fillColor || "#000000";
  edgeEndMarkerFillOpacity.value = edge.endMarker?.fillOpacity ?? 1;
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

// Reset preset to custom when any style property is manually changed
function resetComponentPreset() {
  selectedComponentPreset.value = "custom";
}

function resetRelationPreset() {
  selectedRelationPreset.value = "custom";
}

// Collapsible sections for node style
const nodeSection = reactive<Record<string, boolean>>({
  label: true,
  shape: true,
  fill: true,
  stroke: true,
  icon: false,
});

// Collapsible sections for edge style
const edgeSection = reactive<Record<string, boolean>>({
  label: true,
  line: true,
  markers: true,
});

function toggleSection(sections: Record<string, boolean>, key: string) {
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
  nodeShape.value = value as NodeShape;
  resetComponentPreset();
  emitNodeStyle();
}

function applyNodeIcon() {
  if (!props.selectedElementId || !props.interactionManager) return;
  props.interactionManager.changeNodeProperties(props.selectedElementId, (node) => {
    if (iconName.value) {
      (node as any).icon = {
        source: `/icons/${iconName.value}.svg`,
        placement: iconPlacement.value,
        width: iconWidth.value,
        height: iconHeight.value,
        fit: "contain",
        padding: iconPadding.value,
        margin: iconMargin.value,
        strokeColor: iconStrokeColor.value,
        fillColor: iconFillColor.value
      };
    } else {
      (node as any).icon = undefined;
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

function handleIconPaddingChange(value: string) {
  const v = parseFloat(value);
  if (!Number.isFinite(v) || v < 0) return;
  iconPadding.value = v;
  resetComponentPreset();
  applyNodeIcon();
  emitNodeStyle();
}

function handleIconMarginChange(value: string) {
  const v = parseFloat(value);
  if (!Number.isFinite(v) || v < 0) return;
  iconMargin.value = v;
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

function applyNodeStyle(updates: Record<string, any>) {
  if (!props.selectedElementId || !props.interactionManager) return;
  props.interactionManager.changeNodeProperties(props.selectedElementId, (node) => {
    const baseStyle = node.style || {};
    node.style = {...baseStyle, ...updates};
  });
}

function handleLabelChange(value: string) {
  label.value = value;
  if (!props.selectedElementId || !props.interactionManager) return;
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
      (node as any).cornerRadius = v;
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
      node.label.style = {...(node.label.style || {}), opacity: v} as any;
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

function handleLabelPaddingChange(value: string) {
  const v = parseFloat(value);
  if (!Number.isFinite(v)) return;
  labelPadding.value = v;
  if (!props.selectedElementId || !props.interactionManager) return;
  props.interactionManager.changeNodeProperties(props.selectedElementId, (node) => {
    if (node.label) {
      (node.label as any)._padding = v;
    }
  });
  emitNodeStyle();
}

function handleLabelMarginChange(value: string) {
  const v = parseFloat(value);
  if (!Number.isFinite(v)) return;
  labelMargin.value = v;
  if (!props.selectedElementId || !props.interactionManager) return;
  props.interactionManager.changeNodeProperties(props.selectedElementId, (node) => {
    if (node.label) {
      (node.label as any)._margin = v;
    }
  });
  emitNodeStyle();
}

function handleLabelPlacementChange(value: string) {
  const v = value as "auto" | "center" | "top" | "bottom" | "left" | "right";
  labelPlacement.value = v;
  if (!props.selectedElementId || !props.interactionManager) return;
  props.interactionManager.changeNodeProperties(props.selectedElementId, (node) => {
    (node as any).labelPlacement = v;
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

// --- Edge handlers ---
function applyEdgeStyle(updates: Record<string, any>) {
  if (!props.selectedElementId || !props.interactionManager) return;
  props.interactionManager.changeEdgeProperties(props.selectedElementId, (edge) => {
    const baseStyle = edge.style || {};
    edge.style = {...baseStyle, ...updates};
  });
}

function handleEdgeLabelChange(value: string) {
  edgeLabel.value = value;
  if (!props.selectedElementId || !props.interactionManager) return;
  props.interactionManager.changeEdgeProperties(props.selectedElementId, (edge) => {
    if (value) {
      edge.label = value;
    } else {
      edge.label = undefined;
    }
  });
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
  const v = value as "straight" | "polyline" | "bezier";
  edgeType.value = v;
  resetRelationPreset();
  if (!props.selectedElementId || !props.interactionManager) return;
  props.interactionManager.changeEdgeProperties(props.selectedElementId, (edge) => {
    edge.type = v;
  });
  emitEdgeStyle();
}

function handleEdgeEndMarkerChange(value: string) {
  const v = value as "none" | "arrow" | "open" | "diamond" | "circle";
  edgeEndMarker.value = v;
  resetRelationPreset();
  if (!props.selectedElementId || !props.interactionManager) return;
  props.interactionManager.changeEdgeProperties(props.selectedElementId, (edge) => {
    edge.endMarker = buildMarkerConfig(v, edgeEndMarkerSize.value, edgeEndMarkerFillColor.value, edgeEndMarkerFillOpacity.value);
  });
  emitEdgeStyle();
}

function handleEdgeStartMarkerChange(value: string) {
  const v = value as "none" | "arrow" | "open" | "diamond" | "circle";
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
      edge.label.style = {...(edge.label.style || {}), opacity: v} as any;
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

function handleEdgeLabelBgColorChange(value: string) {
  edgeLabelBgColor.value = value;
  resetRelationPreset();
  if (!props.selectedElementId || !props.interactionManager) return;
  props.interactionManager.changeEdgeProperties(props.selectedElementId, (edge) => {
    (edge as any).labelBackground = {...((edge as any).labelBackground || {}), color: value};
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
    (edge as any).labelBackground = {...((edge as any).labelBackground || {}), opacity: v};
  });
  emitEdgeStyle();
}

function buildMarkerConfig(
  type: "none" | "arrow" | "open" | "diamond" | "circle",
  size: number,
  fillColor: string,
  fillOpacity: number
) {
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
  <div class="style-panel">
    <div class="style-panel__header">
      <h3 class="style-panel__title">
        {{ elementType === 'edge' ? 'Стиль связи' : 'Стиль фигуры' }}
      </h3>
    </div>

    <div v-if="!selectedElementId" class="style-panel__empty">
      <span class="material-symbols-outlined style-panel__empty-icon">touch_app</span>
      <span>Выберите элемент на диаграмме</span>
    </div>

    <!-- Edge style controls -->
    <div v-else-if="elementType === 'edge'" class="style-panel__body">
      <!-- Preset -->
      <div class="style-row style-row--inline">
        <label class="style-label">Пресет</label>
        <select
          class="style-select style-select--wide"
          :value="selectedRelationPreset"
          @change="applyEdgePreset(($event.target as HTMLSelectElement).value); selectedRelationPreset = ($event.target as HTMLSelectElement).value"
        >
          <option value="custom">— Пользовательский —</option>
          <optgroup label="Встроенные">
            <option v-for="preset in builtInRelationPresets" :key="preset.name" :value="preset.name">{{ preset.label }}</option>
          </optgroup>
          <optgroup v-if="userRelationPresets.length" label="Мои пресеты">
            <option v-for="preset in userRelationPresets" :key="preset.name" :value="preset.name">{{ preset.label }}</option>
          </optgroup>
        </select>
        <button type="button" class="style-btn style-btn--icon" title="Сохранить как пресет" @click="openSavePresetForm">+</button>
        <button v-if="userRelationPresets.some(p => p.name === selectedRelationPreset)" type="button" class="style-btn style-btn--icon style-btn--danger" title="Удалить пресет" @click="handleDeleteUserPreset(selectedRelationPreset, 'relation')">&times;</button>
      </div>
      <div v-if="showSavePresetForm && elementType === 'edge'" class="style-row style-row--inline">
        <label class="style-label">Название</label>
        <input v-model="newPresetName" class="style-input style-input--wide" placeholder="Мой пресет" @keyup.enter="confirmSavePreset" @keyup.escape="cancelSavePreset">
        <button type="button" class="style-btn style-btn--icon" title="Сохранить" @click="confirmSavePreset">&#10003;</button>
        <button type="button" class="style-btn style-btn--icon" title="Отмена" @click="cancelSavePreset">&times;</button>
      </div>

      <!-- Label section -->
      <div class="style-section">
        <button type="button" class="style-section__header" @click="toggleSection(edgeSection, 'label')">
          <span class="material-symbols-outlined style-section__chevron" :class="{ 'style-section__chevron--collapsed': !edgeSection.label }">expand_more</span>
          <span class="style-section__title">Метка</span>
        </button>
        <div v-if="edgeSection.label" class="style-section__body">
          <div class="style-row">
            <label class="style-label">Текст</label>
            <input class="style-input style-input--wide" :value="edgeLabel" placeholder="Текст метки" @input="handleEdgeLabelChange(($event.target as HTMLInputElement).value)">
          </div>
          <div class="style-row">
            <label class="style-label">Цвет</label>
            <div class="color-group">
              <input type="color" class="color-picker" :value="edgeLabelColor" @input="handleEdgeLabelColorChange(($event.target as HTMLInputElement).value)">
              <input type="text" class="style-input" :value="edgeLabelColor" @change="handleEdgeLabelColorChange(($event.target as HTMLInputElement).value)">
              <input type="number" class="style-input style-input--num" :value="edgeLabelOpacity" min="0" max="1" step="0.1" title="Непрозрачность" @input="handleEdgeLabelOpacityChange(($event.target as HTMLInputElement).value)">
            </div>
          </div>
          <div class="style-row style-row--inline">
            <label class="style-label">Размер</label>
            <input type="number" class="style-input style-input--num" :value="edgeLabelFontSize" min="8" max="72" step="1" @input="handleEdgeLabelFontSizeChange(($event.target as HTMLInputElement).value)">
          </div>
          <div class="style-row">
            <label class="style-label">Фон</label>
            <div class="color-group">
              <input type="color" class="color-picker" :value="edgeLabelBgColor" @input="handleEdgeLabelBgColorChange(($event.target as HTMLInputElement).value)">
              <input type="text" class="style-input" :value="edgeLabelBgColor" @change="handleEdgeLabelBgColorChange(($event.target as HTMLInputElement).value)">
              <input type="number" class="style-input style-input--num" :value="edgeLabelBgOpacity" min="0" max="1" step="0.1" title="Непрозрачность" @input="handleEdgeLabelBgOpacityChange(($event.target as HTMLInputElement).value)">
            </div>
          </div>
        </div>
      </div>

      <!-- Line section -->
      <div class="style-section">
        <button type="button" class="style-section__header" @click="toggleSection(edgeSection, 'line')">
          <span class="material-symbols-outlined style-section__chevron" :class="{ 'style-section__chevron--collapsed': !edgeSection.line }">expand_more</span>
          <span class="style-section__title">Линия</span>
        </button>
        <div v-if="edgeSection.line" class="style-section__body">
          <div class="style-row">
            <label class="style-label">Цвет</label>
            <div class="color-group">
              <input type="color" class="color-picker" :value="edgeStrokeColor" @input="handleEdgeStrokeColorChange(($event.target as HTMLInputElement).value)">
              <input type="text" class="style-input" :value="edgeStrokeColor" @change="handleEdgeStrokeColorChange(($event.target as HTMLInputElement).value)">
              <input type="number" class="style-input style-input--num" :value="edgeStrokeOpacity" min="0" max="1" step="0.1" title="Непрозрачность" @input="handleEdgeStrokeOpacityChange(($event.target as HTMLInputElement).value)">
            </div>
          </div>
          <div class="style-row style-row--inline">
            <label class="style-label">Толщина</label>
            <input type="number" class="style-input style-input--num" :value="edgeStrokeWidth" min="0" max="20" step="1" @input="handleEdgeStrokeWidthChange(($event.target as HTMLInputElement).value)">
            <label class="style-label">Стиль</label>
            <select class="style-select" :value="edgeLineStyle" @change="handleEdgeLineStyleChange(($event.target as HTMLSelectElement).value)">
              <option value="solid">Сплошная</option>
              <option value="dashed">Пунктир</option>
            </select>
          </div>
          <div v-if="edgeLineStyle === 'dashed'" class="style-row">
            <label class="style-label">Паттерн</label>
            <input type="text" class="style-input style-input--wide" :value="edgeLineDashPattern" placeholder="8,4" @change="handleEdgeLineDashChange(($event.target as HTMLInputElement).value)">
          </div>
          <div class="style-row">
            <label class="style-label">Тип</label>
            <select class="style-select style-select--wide" :value="edgeType" @change="handleEdgeTypeChange(($event.target as HTMLSelectElement).value)">
              <option value="straight">Прямая</option>
              <option value="polyline">Ломаная</option>
              <option value="bezier">Кривая</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Markers section -->
      <div class="style-section">
        <button type="button" class="style-section__header" @click="toggleSection(edgeSection, 'markers')">
          <span class="material-symbols-outlined style-section__chevron" :class="{ 'style-section__chevron--collapsed': !edgeSection.markers }">expand_more</span>
          <span class="style-section__title">Маркеры</span>
        </button>
        <div v-if="edgeSection.markers" class="style-section__body">
          <div class="style-row style-row--inline">
            <label class="style-label">Начало</label>
            <select class="style-select" :value="edgeStartMarker" @change="handleEdgeStartMarkerChange(($event.target as HTMLSelectElement).value)">
              <option value="none">Нет</option>
              <option value="arrow">Стрелка</option>
              <option value="open">Открытая</option>
              <option value="diamond">Ромб</option>
              <option value="circle">Круг</option>
            </select>
          </div>
          <template v-if="edgeStartMarker !== 'none'">
            <div class="style-row style-row--inline">
              <label class="style-label">Размер</label>
              <input type="number" class="style-input style-input--num" :value="edgeStartMarkerSize" min="4" max="40" step="1" @input="handleEdgeStartMarkerSizeChange(($event.target as HTMLInputElement).value)">
            </div>
            <div class="style-row">
              <label class="style-label">Заливка</label>
              <div class="color-group">
                <input type="color" class="color-picker" :value="edgeStartMarkerFillColor" @input="handleEdgeStartMarkerFillColorChange(($event.target as HTMLInputElement).value)">
                <input type="text" class="style-input" :value="edgeStartMarkerFillColor" @change="handleEdgeStartMarkerFillColorChange(($event.target as HTMLInputElement).value)">
                <input type="number" class="style-input style-input--num" :value="edgeStartMarkerFillOpacity" min="0" max="1" step="0.1" title="Непрозрачность" @input="handleEdgeStartMarkerFillOpacityChange(($event.target as HTMLInputElement).value)">
              </div>
            </div>
          </template>
          <div class="style-row style-row--inline">
            <label class="style-label">Конец</label>
            <select class="style-select" :value="edgeEndMarker" @change="handleEdgeEndMarkerChange(($event.target as HTMLSelectElement).value)">
              <option value="none">Нет</option>
              <option value="arrow">Стрелка</option>
              <option value="open">Открытая</option>
              <option value="diamond">Ромб</option>
              <option value="circle">Круг</option>
            </select>
          </div>
          <template v-if="edgeEndMarker !== 'none'">
            <div class="style-row style-row--inline">
              <label class="style-label">Размер</label>
              <input type="number" class="style-input style-input--num" :value="edgeEndMarkerSize" min="4" max="40" step="1" @input="handleEdgeEndMarkerSizeChange(($event.target as HTMLInputElement).value)">
            </div>
            <div class="style-row">
              <label class="style-label">Заливка</label>
              <div class="color-group">
                <input type="color" class="color-picker" :value="edgeEndMarkerFillColor" @input="handleEdgeEndMarkerFillColorChange(($event.target as HTMLInputElement).value)">
                <input type="text" class="style-input" :value="edgeEndMarkerFillColor" @change="handleEdgeEndMarkerFillColorChange(($event.target as HTMLInputElement).value)">
                <input type="number" class="style-input style-input--num" :value="edgeEndMarkerFillOpacity" min="0" max="1" step="0.1" title="Непрозрачность" @input="handleEdgeEndMarkerFillOpacityChange(($event.target as HTMLInputElement).value)">
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- Node style controls -->
    <div v-else class="style-panel__body">
      <!-- Preset -->
      <div class="style-row style-row--inline">
        <label class="style-label">Пресет</label>
        <select
          class="style-select style-select--wide"
          :value="selectedComponentPreset"
          @change="applyComponentPreset(($event.target as HTMLSelectElement).value); selectedComponentPreset = ($event.target as HTMLSelectElement).value"
        >
          <option value="custom">— Пользовательский —</option>
          <optgroup label="Встроенные">
            <option
              v-for="preset in builtInComponentPresets"
              :key="preset.name"
              :value="preset.name"
            >
              {{ preset.label }}
            </option>
          </optgroup>
          <optgroup v-if="userComponentPresets.length" label="Мои пресеты">
            <option
              v-for="preset in userComponentPresets"
              :key="preset.name"
              :value="preset.name"
            >
              {{ preset.label }}
            </option>
          </optgroup>
        </select>
        <button
          type="button"
          class="style-btn style-btn--icon"
          title="Сохранить как пресет"
          @click="openSavePresetForm"
        >
          +
        </button>
        <button
          v-if="userComponentPresets.some(p => p.name === selectedComponentPreset)"
          type="button"
          class="style-btn style-btn--icon style-btn--danger"
          title="Удалить пресет"
          @click="handleDeleteUserPreset(selectedComponentPreset, 'component')"
        >
          &times;
        </button>
      </div>
      <div v-if="showSavePresetForm && elementType === 'node'" class="style-row style-row--inline">
        <label class="style-label">Название</label>
        <input
          v-model="newPresetName"
          class="style-input style-input--wide"
          placeholder="Мой пресет"
          @keyup.enter="confirmSavePreset"
          @keyup.escape="cancelSavePreset"
        >
        <button type="button" class="style-btn style-btn--icon" title="Сохранить" @click="confirmSavePreset">&#10003;</button>
        <button type="button" class="style-btn style-btn--icon" title="Отмена" @click="cancelSavePreset">&times;</button>
      </div>

      <!-- Label section -->
      <div class="style-section">
        <button type="button" class="style-section__header" @click="toggleSection(nodeSection, 'label')">
          <span class="material-symbols-outlined style-section__chevron" :class="{ 'style-section__chevron--collapsed': !nodeSection.label }">expand_more</span>
          <span class="style-section__title">Метка</span>
        </button>
        <div v-if="nodeSection.label" class="style-section__body">
          <div class="style-row">
            <label class="style-label">Текст</label>
            <input
              class="style-input style-input--wide"
              :value="label"
              placeholder="Текст метки"
              @input="handleLabelChange(($event.target as HTMLInputElement).value)"
            >
          </div>
          <div class="style-row">
            <label class="style-label">Цвет</label>
            <div class="color-group">
              <input type="color" class="color-picker" :value="labelColor" @input="handleLabelColorChange(($event.target as HTMLInputElement).value)">
              <input type="text" class="style-input" :value="labelColor" @change="handleLabelColorChange(($event.target as HTMLInputElement).value)">
              <input type="number" class="style-input style-input--num" :value="labelOpacity" min="0" max="1" step="0.1" title="Непрозрачность" @input="handleLabelOpacityChange(($event.target as HTMLInputElement).value)">
            </div>
          </div>
          <div class="style-row style-row--inline">
            <label class="style-label">Размер</label>
            <input type="number" class="style-input style-input--num" :value="labelFontSize" min="8" max="72" step="1" @input="handleLabelFontSizeChange(($event.target as HTMLInputElement).value)">
            <label class="style-label">Отступ</label>
            <input type="number" class="style-input style-input--num" :value="labelPadding" min="0" max="50" step="1" @input="handleLabelPaddingChange(($event.target as HTMLInputElement).value)">
            <label class="style-label">Маргин</label>
            <input type="number" class="style-input style-input--num" :value="labelMargin" min="0" max="50" step="1" @input="handleLabelMarginChange(($event.target as HTMLInputElement).value)">
          </div>
          <div class="style-row">
            <label class="style-label">Позиция</label>
            <select class="style-select style-select--wide" :value="labelPlacement" @change="handleLabelPlacementChange(($event.target as HTMLSelectElement).value)">
              <option value="auto">Авто</option>
              <option value="center">Центр</option>
              <option value="top">Сверху</option>
              <option value="bottom">Снизу</option>
              <option value="left">Слева</option>
              <option value="right">Справа</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Shape & Dimensions section -->
      <div class="style-section">
        <button type="button" class="style-section__header" @click="toggleSection(nodeSection, 'shape')">
          <span class="material-symbols-outlined style-section__chevron" :class="{ 'style-section__chevron--collapsed': !nodeSection.shape }">expand_more</span>
          <span class="style-section__title">Фигура и размеры</span>
        </button>
        <div v-if="nodeSection.shape" class="style-section__body">
          <div class="style-row">
            <label class="style-label">Форма</label>
            <select class="style-select style-select--wide" :value="nodeShape" @change="handleNodeShapeChange(($event.target as HTMLSelectElement).value)">
              <option v-for="shape in NODE_SHAPE_OPTIONS" :key="shape.value" :value="shape.value">{{ shape.label }}</option>
            </select>
          </div>
          <div class="style-row style-row--inline">
            <label class="style-label">Ш</label>
            <input type="number" class="style-input style-input--num" :value="nodeWidth" min="10" max="500" step="10" @input="handleWidthChange(($event.target as HTMLInputElement).value)">
            <label class="style-label">В</label>
            <input type="number" class="style-input style-input--num" :value="nodeHeight" min="10" max="300" step="10" @input="handleHeightChange(($event.target as HTMLInputElement).value)">
          </div>
          <div v-if="nodeShape === 'rectangle'" class="style-row">
            <label class="style-label">Скругление</label>
            <input type="number" class="style-input style-input--num" :value="cornerRadius" min="0" max="50" step="1" @input="handleCornerRadiusChange(($event.target as HTMLInputElement).value)">
          </div>
        </div>
      </div>

      <!-- Fill & Stroke section -->
      <div class="style-section">
        <button type="button" class="style-section__header" @click="toggleSection(nodeSection, 'fill')">
          <span class="material-symbols-outlined style-section__chevron" :class="{ 'style-section__chevron--collapsed': !nodeSection.fill }">expand_more</span>
          <span class="style-section__title">Заливка и обводка</span>
        </button>
        <div v-if="nodeSection.fill" class="style-section__body">
          <div class="style-row">
            <label class="style-label">Заливка</label>
            <div class="color-group">
              <input type="color" class="color-picker" :value="fillColor" @input="handleFillChange(($event.target as HTMLInputElement).value)">
              <input type="text" class="style-input" :value="fillColor" @change="handleFillChange(($event.target as HTMLInputElement).value)">
              <input type="number" class="style-input style-input--num" :value="fillOpacity" min="0" max="1" step="0.1" title="Непрозрачность" @input="handleFillOpacityChange(($event.target as HTMLInputElement).value)">
            </div>
          </div>
          <div class="style-row">
            <label class="style-label">Обводка</label>
            <div class="color-group">
              <input type="color" class="color-picker" :value="strokeColor" @input="handleStrokeColorChange(($event.target as HTMLInputElement).value)">
              <input type="text" class="style-input" :value="strokeColor" @change="handleStrokeColorChange(($event.target as HTMLInputElement).value)">
              <input type="number" class="style-input style-input--num" :value="strokeOpacity" min="0" max="1" step="0.1" title="Непрозрачность" @input="handleStrokeOpacityChange(($event.target as HTMLInputElement).value)">
            </div>
          </div>
          <div class="style-row style-row--inline">
            <label class="style-label">Толщина</label>
            <input type="number" class="style-input style-input--num" :value="strokeWidth" min="0" max="20" step="1" @input="handleStrokeWidthChange(($event.target as HTMLInputElement).value)">
            <label class="style-label">Линия</label>
            <select class="style-select" :value="lineStyle" @change="handleLineStyleChange(($event.target as HTMLSelectElement).value)">
              <option value="solid">Сплошная</option>
              <option value="dashed">Пунктир</option>
            </select>
          </div>
          <div v-if="lineStyle === 'dashed'" class="style-row">
            <label class="style-label">Паттерн</label>
            <input type="text" class="style-input style-input--wide" :value="lineDashPattern" placeholder="8,4" @change="handleLineDashChange(($event.target as HTMLInputElement).value)">
          </div>
        </div>
      </div>

      <!-- Icon section -->
      <div class="style-section">
        <button type="button" class="style-section__header" @click="toggleSection(nodeSection, 'icon')">
          <span class="material-symbols-outlined style-section__chevron" :class="{ 'style-section__chevron--collapsed': !nodeSection.icon }">expand_more</span>
          <span class="style-section__title">Иконка</span>
          <span v-if="iconName" class="style-section__badge">{{ iconName }}</span>
        </button>
        <div v-if="nodeSection.icon" class="style-section__body">
          <div class="style-row">
            <label class="style-label">Иконка</label>
            <div class="icon-group">
              <select class="style-select style-select--wide" :value="iconName" @change="handleIconChange(($event.target as HTMLSelectElement).value)">
                <option value="">Нет</option>
                <option v-for="name in AVAILABLE_ICONS" :key="name" :value="name">{{ name }}</option>
              </select>
              <img v-if="iconName" class="icon-preview" :src="`/icons/${iconName}.svg`" :alt="iconName">
            </div>
          </div>
          <template v-if="iconName">
            <div class="style-row">
              <label class="style-label">Позиция</label>
              <select class="style-select style-select--wide" :value="iconPlacement" @change="handleIconPlacementChange(($event.target as HTMLSelectElement).value)">
                <option value="top-left">Сверху слева</option>
                <option value="top-right">Сверху справа</option>
                <option value="bottom-left">Снизу слева</option>
                <option value="bottom-right">Снизу справа</option>
                <option value="center">По центру</option>
                <option value="top">Сверху</option>
                <option value="bottom">Снизу</option>
                <option value="left">Слева</option>
                <option value="right">Справа</option>
              </select>
            </div>
            <div class="style-row">
              <label class="style-label">Цвета SVG</label>
              <div class="color-group">
                <input type="color" class="color-picker" :value="iconStrokeColor" title="Линии" @input="handleIconStrokeColorChange(($event.target as HTMLInputElement).value)">
                <input type="text" class="style-input" :value="iconStrokeColor" @change="handleIconStrokeColorChange(($event.target as HTMLInputElement).value)">
                <input type="color" class="color-picker" :value="iconFillColor" title="Заливка" @input="handleIconFillColorChange(($event.target as HTMLInputElement).value)">
              </div>
            </div>
            <div class="style-row style-row--inline">
              <label class="style-label">Ш</label>
              <input type="number" class="style-input style-input--num" :value="iconWidth" min="1" max="200" step="1" @input="handleIconWidthChange(($event.target as HTMLInputElement).value)">
              <label class="style-label">В</label>
              <input type="number" class="style-input style-input--num" :value="iconHeight" min="1" max="200" step="1" @input="handleIconHeightChange(($event.target as HTMLInputElement).value)">
            </div>
            <div class="style-row style-row--inline">
              <label class="style-label">Padding</label>
              <input type="number" class="style-input style-input--num" :value="iconPadding" min="0" max="100" step="1" @input="handleIconPaddingChange(($event.target as HTMLInputElement).value)">
              <label class="style-label">Margin</label>
              <input type="number" class="style-input style-input--num" :value="iconMargin" min="0" max="100" step="1" @input="handleIconMarginChange(($event.target as HTMLInputElement).value)">
            </div>
          </template>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
.style-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--surface-panel);
}

.style-panel__header {
  display: flex;
  align-items: center;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.style-panel__title {
  margin: 0;
  font-size: var(--heading-font-size);
  font-weight: 600;
  color: var(--base-text);
  letter-spacing: var(--heading-letter-spacing);
}

.style-panel__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 40px 16px;
  text-align: center;
  font-size: 13px;
  color: var(--text-subtle);
}

.style-panel__empty-icon {
  font-size: 32px;
  color: var(--border-strong);
}

.style-panel__body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.style-section {
  border-bottom: 1px solid var(--border);
}

.style-section__header {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  padding: 8px 0;
  border: none;
  background: none;
  cursor: pointer;
  user-select: none;
  font-family: inherit;
}

.style-section__chevron {
  font-size: 18px;
  color: var(--text-subtle);
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

.style-section__chevron--collapsed {
  transform: rotate(-90deg);
}

.style-section__title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-subtle);
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.style-section__badge {
  margin-left: auto;
  font-size: 11px;
  color: var(--primary);
  background: var(--primary-soft);
  padding: 1px 7px;
  border-radius: 6px;
  font-weight: 500;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.style-section__body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-bottom: 10px;
}

.style-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.style-row--inline {
  flex-direction: row;
  align-items: center;
  gap: 8px;
}

.style-label {
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
  flex-shrink: 0;
}

.style-input {
  padding: 5px 8px;
  font-size: 13px;
  font-family: inherit;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-muted);
  color: var(--base-text);
  outline: none;
  transition: border-color 0.15s ease;
  box-sizing: border-box;
}

.style-input:focus {
  border-color: var(--primary);
}

.style-input--wide {
  flex: 1;
  min-width: 0;
}

.style-input--num {
  width: 70px;
}

.style-select {
  padding: 5px 8px;
  font-size: 13px;
  font-family: inherit;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-muted);
  color: var(--base-text);
  cursor: pointer;
  outline: none;
}

.style-select:focus {
  border-color: var(--primary);
}

.icon-group {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
}

.icon-preview {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
}

.style-select--wide {
  flex: 1;
  min-width: 0;
}

.color-group {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
}

.color-group .style-input {
  flex: 1;
  min-width: 0;
}

.color-picker {
  width: 32px;
  height: 32px;
  padding: 2px;
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
  flex-shrink: 0;
  background: var(--surface-muted);
}

.style-btn--icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-muted);
  color: var(--base-text);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.style-btn--icon:hover {
  background: var(--surface-strong);
  border-color: var(--primary);
}

.style-btn--danger:hover {
  background: var(--danger-soft, #ffeef0);
  border-color: var(--danger, #dc3545);
  color: var(--danger, #dc3545);
}
</style>
