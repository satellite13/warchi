<script setup lang="ts">
import {ref, reactive, computed, watch} from "vue";
import type {InteractionManager, DiagramRenderer, Node, Edge} from "@ngroznykh/papirus";
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
  showPanelActions?: boolean;
  stylePanelCollapsed?: boolean;
  canRestoreStyle?: boolean;
}>();

const emit = defineEmits<{
  (e: "style-change", style: DiagramStyle): void;
  (e: "restore-style"): void;
  (e: "toggle-collapse"): void;
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
          iconPadding: iconPadding.value,
          iconMargin: iconMargin.value,
          iconGap: iconGap.value,
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
            iconPadding: iconPadding.value,
            iconMargin: iconMargin.value,
            iconGap: iconGap.value,
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
    iconPlacement.value = (style.iconPlacement as IconPlacement) ?? "top-left";
    iconWidth.value = style.iconWidth ?? 20;
    iconHeight.value = style.iconHeight ?? 20;
    iconPadding.value = style.iconPadding ?? 8;
    iconMargin.value = style.iconMargin ?? 0;
    iconGap.value = style.iconGap ?? 6;
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
    (node as any).anchorPoints = {
      top: nodePortsTop.value,
      bottom: nodePortsBottom.value,
      left: nodePortsLeft.value,
      right: nodePortsRight.value
    };
    
    if (iconName.value) {
      (node as any).icon = {
        source: `/icons/${iconName.value}.svg`,
        placement: iconPlacement.value,
        width: iconWidth.value,
        height: iconHeight.value,
        fit: "contain",
        padding: iconPadding.value,
        margin: iconMargin.value,
        gap: iconGap.value,
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
const iconGap = ref(6);
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
const nodePortsTop = ref(3);
const nodePortsBottom = ref(3);
const nodePortsLeft = ref(1);
const nodePortsRight = ref(1);

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
  iconGap.value = Number(iconOptions?.gap ?? 6);
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
  const anchorPoints = ((node as any).anchorPoints || {}) as Record<string, unknown>;
  nodePortsTop.value = Math.max(0, Math.round(Number(anchorPoints.top ?? 3)));
  nodePortsBottom.value = Math.max(0, Math.round(Number(anchorPoints.bottom ?? 3)));
  nodePortsLeft.value = Math.max(0, Math.round(Number(anchorPoints.left ?? 1)));
  nodePortsRight.value = Math.max(0, Math.round(Number(anchorPoints.right ?? 1)));
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
        gap: iconGap.value,
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

function handleIconGapChange(value: string) {
  const v = parseFloat(value);
  if (!Number.isFinite(v) || v < 0) return;
  iconGap.value = v;
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

function handlePortsTopChange(value: string) {
  const v = Math.max(0, Math.round(Number(value)));
  if (!Number.isFinite(v)) return;
  nodePortsTop.value = v;
  resetComponentPreset();
  if (!props.selectedElementId || !props.interactionManager) return;
  props.interactionManager.changeNodeProperties(props.selectedElementId, (node) => {
    const anchorPoints = ((node as any).anchorPoints || {}) as Record<string, number>;
    (node as any).anchorPoints = { ...anchorPoints, top: v };
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
    const anchorPoints = ((node as any).anchorPoints || {}) as Record<string, number>;
    (node as any).anchorPoints = { ...anchorPoints, bottom: v };
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
    const anchorPoints = ((node as any).anchorPoints || {}) as Record<string, number>;
    (node as any).anchorPoints = { ...anchorPoints, left: v };
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
    const anchorPoints = ((node as any).anchorPoints || {}) as Record<string, number>;
    (node as any).anchorPoints = { ...anchorPoints, right: v };
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
      <span class="sp-empty__text">Выберите элемент на диаграмме</span>
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
          <span>{{ elementType === 'edge' ? 'Связь' : 'Фигура' }}</span>
        </div>
        <div v-if="showPanelActions" class="sp-header__actions">
          <button
            type="button"
            class="sp-header__btn"
            title="Восстановить стиль из нотации"
            :disabled="!selectedElementId || !canRestoreStyle"
            @click="emit('restore-style')"
          >
            <span class="material-symbols-outlined">restart_alt</span>
          </button>
          <button
            type="button"
            class="sp-header__btn"
            :title="stylePanelCollapsed ? 'Развернуть панель стилей' : 'Свернуть панель стилей'"
            @click="emit('toggle-collapse')"
          >
            <span class="material-symbols-outlined">
              {{ stylePanelCollapsed ? 'keyboard_arrow_up' : 'keyboard_arrow_down' }}
            </span>
          </button>
        </div>
      </div>

      <!-- Preset bar -->
      <div v-show="!stylePanelCollapsed" class="sp-preset">
        <select
          class="sp-select sp-select--preset"
          :value="elementType === 'edge' ? selectedRelationPreset : selectedComponentPreset"
          @change="elementType === 'edge'
            ? (applyEdgePreset(($event.target as HTMLSelectElement).value), selectedRelationPreset = ($event.target as HTMLSelectElement).value)
            : (applyComponentPreset(($event.target as HTMLSelectElement).value), selectedComponentPreset = ($event.target as HTMLSelectElement).value)"
        >
          <option value="custom">Пользовательский</option>
          <optgroup label="Встроенные">
            <option
              v-for="preset in (elementType === 'edge' ? builtInRelationPresets : builtInComponentPresets)"
              :key="preset.name"
              :value="preset.name"
            >{{ preset.label }}</option>
          </optgroup>
          <optgroup
            v-if="(elementType === 'edge' ? userRelationPresets : userComponentPresets).length"
            label="Мои пресеты"
          >
            <option
              v-for="preset in (elementType === 'edge' ? userRelationPresets : userComponentPresets)"
              :key="preset.name"
              :value="preset.name"
            >{{ preset.label }}</option>
          </optgroup>
        </select>
        <button type="button" class="sp-preset__btn" title="Сохранить как пресет" @click="openSavePresetForm">
          <span class="material-symbols-outlined">bookmark_add</span>
        </button>
        <button
          v-if="(elementType === 'edge' ? userRelationPresets : userComponentPresets).some(p => p.name === (elementType === 'edge' ? selectedRelationPreset : selectedComponentPreset))"
          type="button"
          class="sp-preset__btn sp-preset__btn--danger"
          title="Удалить пресет"
          @click="handleDeleteUserPreset(elementType === 'edge' ? selectedRelationPreset : selectedComponentPreset, elementType === 'edge' ? 'relation' : 'component')"
        >
          <span class="material-symbols-outlined">delete_outline</span>
        </button>
      </div>

      <!-- Save preset inline form -->
      <Transition name="sp-slide">
        <div v-if="showSavePresetForm && !stylePanelCollapsed" class="sp-save-form">
          <input
            v-model="newPresetName"
            class="sp-input sp-save-form__input"
            placeholder="Название пресета..."
            @keyup.enter="confirmSavePreset"
            @keyup.escape="cancelSavePreset"
          >
          <button type="button" class="sp-save-form__btn sp-save-form__btn--ok" @click="confirmSavePreset">
            <span class="material-symbols-outlined">check</span>
          </button>
          <button type="button" class="sp-save-form__btn" @click="cancelSavePreset">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
      </Transition>

      <!-- Scrollable body -->
      <div v-show="!stylePanelCollapsed" class="sp-body">

        <!-- ==================== EDGE PANEL ==================== -->
        <template v-if="elementType === 'edge'">

          <!-- Label -->
          <section class="sp-section">
            <button type="button" class="sp-section__toggle" @click="toggleSection(edgeSection, 'label')">
              <span class="material-symbols-outlined sp-section__arrow" :class="{ 'sp-section__arrow--closed': !edgeSection.label }">chevron_right</span>
              <span class="sp-section__name">Метка</span>
            </button>
            <Transition name="sp-expand">
              <div v-if="edgeSection.label" class="sp-section__content">
                <div class="sp-field">
                  <input class="sp-input sp-input--full" :value="edgeLabel" placeholder="Текст метки..." @input="handleEdgeLabelChange(($event.target as HTMLInputElement).value)">
                </div>
                <div class="sp-field sp-field--row">
                  <span class="sp-field__label">Цвет</span>
                  <div class="sp-color">
                    <label class="sp-color__swatch">
                      <input type="color" :value="edgeLabelColor" @input="handleEdgeLabelColorChange(($event.target as HTMLInputElement).value)">
                      <span class="sp-color__preview" :style="{ background: edgeLabelColor }"></span>
                    </label>
                    <input type="text" class="sp-input sp-input--hex" :value="edgeLabelColor" @change="handleEdgeLabelColorChange(($event.target as HTMLInputElement).value)">
                  </div>
                  <div class="sp-num-field">
                    <span class="sp-num-field__label">A</span>
                    <input type="number" class="sp-input sp-input--tiny" :value="edgeLabelOpacity" min="0" max="1" step="0.1" @input="handleEdgeLabelOpacityChange(($event.target as HTMLInputElement).value)">
                  </div>
                </div>
                <div class="sp-field sp-field--row">
                  <span class="sp-field__label">Размер</span>
                  <input type="number" class="sp-input sp-input--sm" :value="edgeLabelFontSize" min="8" max="72" step="1" @input="handleEdgeLabelFontSizeChange(($event.target as HTMLInputElement).value)">
                </div>
                <div class="sp-field sp-field--row">
                  <span class="sp-field__label">Фон</span>
                  <div class="sp-color">
                    <label class="sp-color__swatch">
                      <input type="color" :value="edgeLabelBgColor" @input="handleEdgeLabelBgColorChange(($event.target as HTMLInputElement).value)">
                      <span class="sp-color__preview" :style="{ background: edgeLabelBgColor }"></span>
                    </label>
                    <input type="text" class="sp-input sp-input--hex" :value="edgeLabelBgColor" @change="handleEdgeLabelBgColorChange(($event.target as HTMLInputElement).value)">
                  </div>
                  <div class="sp-num-field">
                    <span class="sp-num-field__label">A</span>
                    <input type="number" class="sp-input sp-input--tiny" :value="edgeLabelBgOpacity" min="0" max="1" step="0.1" @input="handleEdgeLabelBgOpacityChange(($event.target as HTMLInputElement).value)">
                  </div>
                </div>
              </div>
            </Transition>
          </section>

          <!-- Line -->
          <section class="sp-section">
            <button type="button" class="sp-section__toggle" @click="toggleSection(edgeSection, 'line')">
              <span class="material-symbols-outlined sp-section__arrow" :class="{ 'sp-section__arrow--closed': !edgeSection.line }">chevron_right</span>
              <span class="sp-section__name">Линия</span>
            </button>
            <Transition name="sp-expand">
              <div v-if="edgeSection.line" class="sp-section__content">
                <div class="sp-field sp-field--row">
                  <span class="sp-field__label">Цвет</span>
                  <div class="sp-color">
                    <label class="sp-color__swatch">
                      <input type="color" :value="edgeStrokeColor" @input="handleEdgeStrokeColorChange(($event.target as HTMLInputElement).value)">
                      <span class="sp-color__preview" :style="{ background: edgeStrokeColor }"></span>
                    </label>
                    <input type="text" class="sp-input sp-input--hex" :value="edgeStrokeColor" @change="handleEdgeStrokeColorChange(($event.target as HTMLInputElement).value)">
                  </div>
                  <div class="sp-num-field">
                    <span class="sp-num-field__label">A</span>
                    <input type="number" class="sp-input sp-input--tiny" :value="edgeStrokeOpacity" min="0" max="1" step="0.1" @input="handleEdgeStrokeOpacityChange(($event.target as HTMLInputElement).value)">
                  </div>
                </div>
                <div class="sp-field sp-field--row">
                  <span class="sp-field__label">Толщина</span>
                  <input type="range" class="sp-range" :value="edgeStrokeWidth" min="0" max="20" step="1" @input="handleEdgeStrokeWidthChange(($event.target as HTMLInputElement).value)">
                  <input type="number" class="sp-input sp-input--tiny" :value="edgeStrokeWidth" min="0" max="20" step="1" @input="handleEdgeStrokeWidthChange(($event.target as HTMLInputElement).value)">
                </div>
                <div class="sp-field sp-field--row">
                  <span class="sp-field__label">Стиль</span>
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
                </div>
                <div v-if="edgeLineStyle === 'dashed'" class="sp-field sp-field--row">
                  <span class="sp-field__label">Паттерн</span>
                  <input type="text" class="sp-input sp-input--flex" :value="edgeLineDashPattern" placeholder="8,4" @change="handleEdgeLineDashChange(($event.target as HTMLInputElement).value)">
                </div>
                <div class="sp-field sp-field--row">
                  <span class="sp-field__label">Тип</span>
                  <div class="sp-segmented">
                    <button
                      v-for="t in ([{v:'straight',l:'Прямая',icon:'remove'},{v:'polyline',l:'Ломаная',icon:'timeline'},{v:'bezier',l:'Кривая',icon:'line_curve'}] as const)"
                      :key="t.v"
                      type="button"
                      class="sp-segmented__btn"
                      :class="{ 'sp-segmented__btn--active': edgeType === t.v }"
                      :title="t.l"
                      @click="handleEdgeTypeChange(t.v)"
                    >
                      <span class="material-symbols-outlined">{{ t.icon }}</span>
                    </button>
                  </div>
                </div>
              </div>
            </Transition>
          </section>

          <!-- Markers -->
          <section class="sp-section">
            <button type="button" class="sp-section__toggle" @click="toggleSection(edgeSection, 'markers')">
              <span class="material-symbols-outlined sp-section__arrow" :class="{ 'sp-section__arrow--closed': !edgeSection.markers }">chevron_right</span>
              <span class="sp-section__name">Маркеры</span>
            </button>
            <Transition name="sp-expand">
              <div v-if="edgeSection.markers" class="sp-section__content">
                <!-- Start marker -->
                <div class="sp-marker-group">
                  <div class="sp-field sp-field--row">
                    <span class="sp-field__label">Начало</span>
                    <select class="sp-select sp-select--flex" :value="edgeStartMarker" @change="handleEdgeStartMarkerChange(($event.target as HTMLSelectElement).value)">
                      <option value="none">Нет</option>
                      <option value="arrow">Стрелка</option>
                      <option value="open">Открытая</option>
                      <option value="diamond">Ромб</option>
                      <option value="circle">Круг</option>
                    </select>
                  </div>
                  <template v-if="edgeStartMarker !== 'none'">
                    <div class="sp-field sp-field--row sp-field--indent">
                      <span class="sp-field__label">Размер</span>
                      <input type="number" class="sp-input sp-input--sm" :value="edgeStartMarkerSize" min="4" max="40" step="1" @input="handleEdgeStartMarkerSizeChange(($event.target as HTMLInputElement).value)">
                    </div>
                    <div class="sp-field sp-field--row sp-field--indent">
                      <span class="sp-field__label">Заливка</span>
                      <div class="sp-color">
                        <label class="sp-color__swatch">
                          <input type="color" :value="edgeStartMarkerFillColor" @input="handleEdgeStartMarkerFillColorChange(($event.target as HTMLInputElement).value)">
                          <span class="sp-color__preview" :style="{ background: edgeStartMarkerFillColor }"></span>
                        </label>
                        <input type="text" class="sp-input sp-input--hex" :value="edgeStartMarkerFillColor" @change="handleEdgeStartMarkerFillColorChange(($event.target as HTMLInputElement).value)">
                      </div>
                      <div class="sp-num-field">
                        <span class="sp-num-field__label">A</span>
                        <input type="number" class="sp-input sp-input--tiny" :value="edgeStartMarkerFillOpacity" min="0" max="1" step="0.1" @input="handleEdgeStartMarkerFillOpacityChange(($event.target as HTMLInputElement).value)">
                      </div>
                    </div>
                  </template>
                </div>
                <!-- End marker -->
                <div class="sp-marker-group">
                  <div class="sp-field sp-field--row">
                    <span class="sp-field__label">Конец</span>
                    <select class="sp-select sp-select--flex" :value="edgeEndMarker" @change="handleEdgeEndMarkerChange(($event.target as HTMLSelectElement).value)">
                      <option value="none">Нет</option>
                      <option value="arrow">Стрелка</option>
                      <option value="open">Открытая</option>
                      <option value="diamond">Ромб</option>
                      <option value="circle">Круг</option>
                    </select>
                  </div>
                  <template v-if="edgeEndMarker !== 'none'">
                    <div class="sp-field sp-field--row sp-field--indent">
                      <span class="sp-field__label">Размер</span>
                      <input type="number" class="sp-input sp-input--sm" :value="edgeEndMarkerSize" min="4" max="40" step="1" @input="handleEdgeEndMarkerSizeChange(($event.target as HTMLInputElement).value)">
                    </div>
                    <div class="sp-field sp-field--row sp-field--indent">
                      <span class="sp-field__label">Заливка</span>
                      <div class="sp-color">
                        <label class="sp-color__swatch">
                          <input type="color" :value="edgeEndMarkerFillColor" @input="handleEdgeEndMarkerFillColorChange(($event.target as HTMLInputElement).value)">
                          <span class="sp-color__preview" :style="{ background: edgeEndMarkerFillColor }"></span>
                        </label>
                        <input type="text" class="sp-input sp-input--hex" :value="edgeEndMarkerFillColor" @change="handleEdgeEndMarkerFillColorChange(($event.target as HTMLInputElement).value)">
                      </div>
                      <div class="sp-num-field">
                        <span class="sp-num-field__label">A</span>
                        <input type="number" class="sp-input sp-input--tiny" :value="edgeEndMarkerFillOpacity" min="0" max="1" step="0.1" @input="handleEdgeEndMarkerFillOpacityChange(($event.target as HTMLInputElement).value)">
                      </div>
                    </div>
                  </template>
                </div>
              </div>
            </Transition>
          </section>

        </template>

        <!-- ==================== NODE PANEL ==================== -->
        <template v-else>

          <!-- Label -->
          <section class="sp-section">
            <button type="button" class="sp-section__toggle" @click="toggleSection(nodeSection, 'label')">
              <span class="material-symbols-outlined sp-section__arrow" :class="{ 'sp-section__arrow--closed': !nodeSection.label }">chevron_right</span>
              <span class="sp-section__name">Метка</span>
            </button>
            <Transition name="sp-expand">
              <div v-if="nodeSection.label" class="sp-section__content">
                <div class="sp-field">
                  <input class="sp-input sp-input--full" :value="label" placeholder="Текст метки..." @input="handleLabelChange(($event.target as HTMLInputElement).value)">
                </div>
                <div class="sp-field sp-field--row">
                  <span class="sp-field__label">Цвет</span>
                  <div class="sp-color">
                    <label class="sp-color__swatch">
                      <input type="color" :value="labelColor" @input="handleLabelColorChange(($event.target as HTMLInputElement).value)">
                      <span class="sp-color__preview" :style="{ background: labelColor }"></span>
                    </label>
                    <input type="text" class="sp-input sp-input--hex" :value="labelColor" @change="handleLabelColorChange(($event.target as HTMLInputElement).value)">
                  </div>
                  <div class="sp-num-field">
                    <span class="sp-num-field__label">A</span>
                    <input type="number" class="sp-input sp-input--tiny" :value="labelOpacity" min="0" max="1" step="0.1" @input="handleLabelOpacityChange(($event.target as HTMLInputElement).value)">
                  </div>
                </div>
                <div class="sp-field-grid sp-field-grid--3">
                  <div class="sp-num-field sp-num-field--stacked">
                    <span class="sp-num-field__label">Размер</span>
                    <input type="number" class="sp-input sp-input--sm" :value="labelFontSize" min="8" max="72" step="1" @input="handleLabelFontSizeChange(($event.target as HTMLInputElement).value)">
                  </div>
                  <div class="sp-num-field sp-num-field--stacked">
                    <span class="sp-num-field__label">Внутр.</span>
                    <input type="number" class="sp-input sp-input--sm" :value="labelPadding" min="0" max="50" step="1" @input="handleLabelPaddingChange(($event.target as HTMLInputElement).value)">
                  </div>
                  <div class="sp-num-field sp-num-field--stacked">
                    <span class="sp-num-field__label">Внешн.</span>
                    <input type="number" class="sp-input sp-input--sm" :value="labelMargin" min="0" max="50" step="1" @input="handleLabelMarginChange(($event.target as HTMLInputElement).value)">
                  </div>
                </div>
                <div class="sp-field sp-field--row">
                  <span class="sp-field__label">Позиция</span>
                  <select class="sp-select sp-select--flex" :value="labelPlacement" @change="handleLabelPlacementChange(($event.target as HTMLSelectElement).value)">
                    <option value="auto">Авто</option>
                    <option value="center">Центр</option>
                    <option value="top">Сверху</option>
                    <option value="bottom">Снизу</option>
                    <option value="left">Слева</option>
                    <option value="right">Справа</option>
                  </select>
                </div>
              </div>
            </Transition>
          </section>

          <!-- Shape & Dimensions -->
          <section class="sp-section">
            <button type="button" class="sp-section__toggle" @click="toggleSection(nodeSection, 'shape')">
              <span class="material-symbols-outlined sp-section__arrow" :class="{ 'sp-section__arrow--closed': !nodeSection.shape }">chevron_right</span>
              <span class="sp-section__name">Фигура</span>
            </button>
            <Transition name="sp-expand">
              <div v-if="nodeSection.shape" class="sp-section__content">
                <!-- Visual shape picker -->
                <div class="sp-shapes">
                  <button
                    v-for="shape in NODE_SHAPE_OPTIONS"
                    :key="shape.value"
                    type="button"
                    class="sp-shapes__item"
                    :class="{ 'sp-shapes__item--active': nodeShape === shape.value }"
                    :title="shape.label"
                    @click="handleNodeShapeChange(shape.value)"
                  >
                    <svg width="28" height="20" viewBox="0 0 28 20">
                      <rect v-if="shape.value === 'rectangle'" x="2" y="3" width="24" height="14" rx="1" stroke="currentColor" stroke-width="1.2" fill="none"/>
                      <polygon v-else-if="shape.value === 'beveled-rectangle'" points="5,3 23,3 26,6 26,17 23,20 5,20 2,17 2,6" stroke="currentColor" stroke-width="1.2" fill="none" transform="translate(0,-1.5)"/>
                      <polygon v-else-if="shape.value === 'diamond'" points="14,1 27,10 14,19 1,10" stroke="currentColor" stroke-width="1.2" fill="none"/>
                      <circle v-else-if="shape.value === 'circle'" cx="14" cy="10" r="8" stroke="currentColor" stroke-width="1.2" fill="none"/>
                      <polygon v-else-if="shape.value === 'trapezoid'" points="5,3 23,3 26,17 2,17" stroke="currentColor" stroke-width="1.2" fill="none"/>
                      <polygon v-else-if="shape.value === 'slanted-rectangle'" points="6,3 26,3 22,17 2,17" stroke="currentColor" stroke-width="1.2" fill="none"/>
                    </svg>
                  </button>
                </div>
                <div class="sp-field-grid sp-field-grid--dims">
                  <div class="sp-num-field sp-num-field--stacked">
                    <span class="sp-num-field__label">W</span>
                    <input type="number" class="sp-input sp-input--sm" :value="nodeWidth" min="10" max="500" step="10" @input="handleWidthChange(($event.target as HTMLInputElement).value)">
                  </div>
                  <div class="sp-num-field sp-num-field--stacked">
                    <span class="sp-num-field__label">H</span>
                    <input type="number" class="sp-input sp-input--sm" :value="nodeHeight" min="10" max="300" step="10" @input="handleHeightChange(($event.target as HTMLInputElement).value)">
                  </div>
                  <div v-if="nodeShape === 'rectangle'" class="sp-num-field sp-num-field--stacked">
                    <span class="sp-num-field__label">R</span>
                    <input type="number" class="sp-input sp-input--sm" :value="cornerRadius" min="0" max="50" step="1" @input="handleCornerRadiusChange(($event.target as HTMLInputElement).value)">
                  </div>
                </div>
                <div class="sp-field-grid sp-field-grid--dims">
                  <div class="sp-num-field sp-num-field--stacked">
                    <span class="sp-num-field__label">PT</span>
                    <input type="number" class="sp-input sp-input--sm" :value="nodePortsTop" min="0" max="16" step="1" @input="handlePortsTopChange(($event.target as HTMLInputElement).value)">
                  </div>
                  <div class="sp-num-field sp-num-field--stacked">
                    <span class="sp-num-field__label">PB</span>
                    <input type="number" class="sp-input sp-input--sm" :value="nodePortsBottom" min="0" max="16" step="1" @input="handlePortsBottomChange(($event.target as HTMLInputElement).value)">
                  </div>
                  <div class="sp-num-field sp-num-field--stacked">
                    <span class="sp-num-field__label">PL</span>
                    <input type="number" class="sp-input sp-input--sm" :value="nodePortsLeft" min="0" max="16" step="1" @input="handlePortsLeftChange(($event.target as HTMLInputElement).value)">
                  </div>
                  <div class="sp-num-field sp-num-field--stacked">
                    <span class="sp-num-field__label">PR</span>
                    <input type="number" class="sp-input sp-input--sm" :value="nodePortsRight" min="0" max="16" step="1" @input="handlePortsRightChange(($event.target as HTMLInputElement).value)">
                  </div>
                </div>
              </div>
            </Transition>
          </section>

          <!-- Fill & Stroke -->
          <section class="sp-section">
            <button type="button" class="sp-section__toggle" @click="toggleSection(nodeSection, 'fill')">
              <span class="material-symbols-outlined sp-section__arrow" :class="{ 'sp-section__arrow--closed': !nodeSection.fill }">chevron_right</span>
              <span class="sp-section__name">Заливка и обводка</span>
            </button>
            <Transition name="sp-expand">
              <div v-if="nodeSection.fill" class="sp-section__content">
                <div class="sp-field sp-field--row">
                  <span class="sp-field__label">Заливка</span>
                  <div class="sp-color">
                    <label class="sp-color__swatch">
                      <input type="color" :value="fillColor" @input="handleFillChange(($event.target as HTMLInputElement).value)">
                      <span class="sp-color__preview" :style="{ background: fillColor }"></span>
                    </label>
                    <input type="text" class="sp-input sp-input--hex" :value="fillColor" @change="handleFillChange(($event.target as HTMLInputElement).value)">
                  </div>
                  <div class="sp-num-field">
                    <span class="sp-num-field__label">A</span>
                    <input type="number" class="sp-input sp-input--tiny" :value="fillOpacity" min="0" max="1" step="0.1" @input="handleFillOpacityChange(($event.target as HTMLInputElement).value)">
                  </div>
                </div>
                <div class="sp-field sp-field--row">
                  <span class="sp-field__label">Обводка</span>
                  <div class="sp-color">
                    <label class="sp-color__swatch">
                      <input type="color" :value="strokeColor" @input="handleStrokeColorChange(($event.target as HTMLInputElement).value)">
                      <span class="sp-color__preview" :style="{ background: strokeColor }"></span>
                    </label>
                    <input type="text" class="sp-input sp-input--hex" :value="strokeColor" @change="handleStrokeColorChange(($event.target as HTMLInputElement).value)">
                  </div>
                  <div class="sp-num-field">
                    <span class="sp-num-field__label">A</span>
                    <input type="number" class="sp-input sp-input--tiny" :value="strokeOpacity" min="0" max="1" step="0.1" @input="handleStrokeOpacityChange(($event.target as HTMLInputElement).value)">
                  </div>
                </div>
                <div class="sp-field sp-field--row">
                  <span class="sp-field__label">Толщина</span>
                  <input type="range" class="sp-range" :value="strokeWidth" min="0" max="20" step="1" @input="handleStrokeWidthChange(($event.target as HTMLInputElement).value)">
                  <input type="number" class="sp-input sp-input--tiny" :value="strokeWidth" min="0" max="20" step="1" @input="handleStrokeWidthChange(($event.target as HTMLInputElement).value)">
                </div>
                <div class="sp-field sp-field--row">
                  <span class="sp-field__label">Стиль</span>
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
                </div>
                <div v-if="lineStyle === 'dashed'" class="sp-field sp-field--row">
                  <span class="sp-field__label">Паттерн</span>
                  <input type="text" class="sp-input sp-input--flex" :value="lineDashPattern" placeholder="8,4" @change="handleLineDashChange(($event.target as HTMLInputElement).value)">
                </div>
              </div>
            </Transition>
          </section>

          <!-- Icon -->
          <section class="sp-section">
            <button type="button" class="sp-section__toggle" @click="toggleSection(nodeSection, 'icon')">
              <span class="material-symbols-outlined sp-section__arrow" :class="{ 'sp-section__arrow--closed': !nodeSection.icon }">chevron_right</span>
              <span class="sp-section__name">Иконка</span>
              <span v-if="iconName" class="sp-section__pill">{{ iconName }}</span>
            </button>
            <Transition name="sp-expand">
              <div v-if="nodeSection.icon" class="sp-section__content">
                <div class="sp-field sp-field--row">
                  <span class="sp-field__label">Иконка</span>
                  <div class="sp-icon-select">
                    <select class="sp-select sp-select--flex" :value="iconName" @change="handleIconChange(($event.target as HTMLSelectElement).value)">
                      <option value="">Нет</option>
                      <option v-for="name in AVAILABLE_ICONS" :key="name" :value="name">{{ name }}</option>
                    </select>
                    <img v-if="iconName" class="sp-icon-select__preview" :src="`/icons/${iconName}.svg`" :alt="iconName">
                  </div>
                </div>
                <template v-if="iconName">
                  <div class="sp-field sp-field--row">
                    <span class="sp-field__label">Позиция</span>
                    <select class="sp-select sp-select--flex" :value="iconPlacement" @change="handleIconPlacementChange(($event.target as HTMLSelectElement).value)">
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
                  <div class="sp-field sp-field--row">
                    <span class="sp-field__label">Цвета</span>
                    <div class="sp-color">
                      <label class="sp-color__swatch" title="Линии">
                        <input type="color" :value="iconStrokeColor" @input="handleIconStrokeColorChange(($event.target as HTMLInputElement).value)">
                        <span class="sp-color__preview" :style="{ background: iconStrokeColor }"></span>
                      </label>
                      <input type="text" class="sp-input sp-input--hex" :value="iconStrokeColor" @change="handleIconStrokeColorChange(($event.target as HTMLInputElement).value)">
                    </div>
                    <label class="sp-color__swatch" title="Заливка">
                      <input type="color" :value="iconFillColor" @input="handleIconFillColorChange(($event.target as HTMLInputElement).value)">
                      <span class="sp-color__preview" :style="{ background: iconFillColor }"></span>
                    </label>
                  </div>
                  <div class="sp-field-grid sp-field-grid--2">
                    <div class="sp-num-field sp-num-field--stacked">
                      <span class="sp-num-field__label">W</span>
                      <input type="number" class="sp-input sp-input--sm" :value="iconWidth" min="1" max="200" step="1" @input="handleIconWidthChange(($event.target as HTMLInputElement).value)">
                    </div>
                    <div class="sp-num-field sp-num-field--stacked">
                      <span class="sp-num-field__label">H</span>
                      <input type="number" class="sp-input sp-input--sm" :value="iconHeight" min="1" max="200" step="1" @input="handleIconHeightChange(($event.target as HTMLInputElement).value)">
                    </div>
                  </div>
                  <div class="sp-field-grid sp-field-grid--3">
                    <div class="sp-num-field sp-num-field--stacked">
                      <span class="sp-num-field__label">Внутр.</span>
                      <input type="number" class="sp-input sp-input--sm" :value="iconPadding" min="0" max="100" step="1" @input="handleIconPaddingChange(($event.target as HTMLInputElement).value)">
                    </div>
                    <div class="sp-num-field sp-num-field--stacked">
                      <span class="sp-num-field__label">Внешн.</span>
                      <input type="number" class="sp-input sp-input--sm" :value="iconMargin" min="0" max="100" step="1" @input="handleIconMarginChange(($event.target as HTMLInputElement).value)">
                    </div>
                    <div class="sp-num-field sp-num-field--stacked">
                      <span class="sp-num-field__label">Зазор</span>
                      <input type="number" class="sp-input sp-input--sm" :value="iconGap" min="0" max="100" step="1" @input="handleIconGapChange(($event.target as HTMLInputElement).value)">
                    </div>
                  </div>
                </template>
              </div>
            </Transition>
          </section>

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

.sp-header__btn .material-symbols-outlined {
  font-size: 16px;
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

.sp-preset__btn .material-symbols-outlined {
  font-size: 16px;
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

.sp-save-form__btn .material-symbols-outlined {
  font-size: 16px;
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

/* ---- Sections ---- */
.sp-section {
  border-bottom: 1px solid var(--border);
}

.sp-section__toggle {
  display: flex;
  align-items: center;
  gap: 2px;
  width: 100%;
  padding: 7px var(--sp-pad);
  border: none;
  background: none;
  cursor: pointer;
  user-select: none;
  font-family: inherit;
  transition: background 0.1s ease;
}

.sp-section__toggle:hover {
  background: var(--surface-muted);
}

.sp-section__arrow {
  font-size: 16px;
  color: var(--text-subtle);
  flex-shrink: 0;
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  transform: rotate(90deg);
}

.sp-section__arrow--closed {
  transform: rotate(0deg);
}

.sp-section__name {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.sp-section__pill {
  margin-left: auto;
  font-size: 10px;
  color: var(--primary);
  background: var(--primary-soft);
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: 500;
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-transform: none;
  letter-spacing: 0;
}

.sp-section__content {
  display: flex;
  flex-direction: column;
  gap: var(--sp-gap);
  padding: 0 var(--sp-pad) 10px;
}

/* ---- Fields ---- */
.sp-field {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.sp-field--row {
  flex-direction: row;
  align-items: center;
  gap: 6px;
}

.sp-field--indent {
  padding-left: 12px;
}

.sp-field__label {
  font-size: 11px;
  color: var(--text-subtle);
  white-space: nowrap;
  flex-shrink: 0;
  min-width: 48px;
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

/* ---- Color picker ---- */
.sp-color {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  min-width: 0;
}

.sp-color__swatch {
  position: relative;
  width: var(--sp-h);
  height: var(--sp-h);
  flex-shrink: 0;
  cursor: pointer;
}

.sp-color__swatch input[type="color"] {
  position: absolute;
  inset: 0;
  opacity: 0;
  width: 100%;
  height: 100%;
  cursor: pointer;
  border: none;
  padding: 0;
}

.sp-color__preview {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 5px;
  border: 1px solid var(--border);
  box-sizing: border-box;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  /* Checkerboard for transparency */
  background-image:
    linear-gradient(45deg, #e0e0e0 25%, transparent 25%),
    linear-gradient(-45deg, #e0e0e0 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #e0e0e0 75%),
    linear-gradient(-45deg, transparent 75%, #e0e0e0 75%);
  background-size: 8px 8px;
  background-position: 0 0, 0 4px, 4px -4px, -4px 0px;
}

.sp-color__swatch:hover .sp-color__preview {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px var(--primary-soft);
}

/* ---- Number field with label ---- */
.sp-num-field {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.sp-num-field__label {
  font-size: 10px;
  color: var(--text-subtle);
  white-space: nowrap;
  line-height: 1;
}

.sp-num-field--stacked {
  flex-direction: column;
  align-items: stretch;
  gap: 2px;
}

.sp-num-field--stacked .sp-num-field__label {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding-left: 2px;
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

.sp-segmented__btn .material-symbols-outlined {
  font-size: 16px;
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

.sp-expand-enter-active,
.sp-expand-leave-active {
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}

.sp-expand-enter-from,
.sp-expand-leave-to {
  opacity: 0;
  max-height: 0;
  padding-bottom: 0;
}

.sp-expand-enter-to,
.sp-expand-leave-from {
  opacity: 1;
  max-height: 600px;
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
</style>
