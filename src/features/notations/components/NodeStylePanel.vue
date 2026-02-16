<script setup lang="ts">
import {ref, computed, watch} from "vue";
import type {InteractionManager, DiagramRenderer, Node, Edge} from "papirus";
import type {DiagramStyle} from "../notationAttrs";

const props = defineProps<{
  selectedElementId: string | null;
  interactionManager: InteractionManager | null;
  renderer: DiagramRenderer | null;
}>();

const emit = defineEmits<{
  (e: "style-change", style: DiagramStyle): void;
}>();

function emitNodeStyle() {
  const style: DiagramStyle = {
    fillColor: fillColor.value,
    strokeColor: strokeColor.value,
    strokeWidth: strokeWidth.value,
    cornerRadius: cornerRadius.value,
    opacity: opacity.value,
    labelColor: labelColor.value,
    labelFontSize: labelFontSize.value,
    labelPadding: labelPadding.value,
    labelMargin: labelMargin.value,
    labelPlacement: labelPlacement.value,
    ...(iconName.value ? { iconName: iconName.value } : {})
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
    strokeWidth: edgeStrokeWidth.value,
    opacity: edgeOpacity.value,
    edgeType: edgeType.value,
    startMarkerType: edgeStartMarker.value,
    endMarkerType: edgeEndMarker.value,
    labelColor: edgeLabelColor.value,
    labelFontSize: edgeLabelFontSize.value,
    labelBgColor: edgeLabelBgColor.value,
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

const AVAILABLE_ICONS = [
  "actor", "artifact", "assessment", "capability", "circle", "collaboration",
  "communication_network", "component_group", "component", "constraint",
  "contract", "course_of_action", "deliverable", "device",
  "distribution_network", "driver", "equipment", "event", "facility",
  "function", "gap", "goal", "group", "hidden_rectangle", "interaction",
  "interface", "material", "meaning", "node", "object", "octagon",
  "outcome", "path", "plateau", "principle", "process", "product",
  "rectangle", "representation", "requirement", "resource", "rhombus",
  "role", "rounded_rectangle", "service", "stakeholder", "system_software",
  "text", "value_stream", "value", "work_package"
] as const;

// --- Node style state ---
const iconName = ref("");
const label = ref("");
const fillColor = ref("#ffffff");
const strokeColor = ref("#333333");
const strokeWidth = ref(2);
const cornerRadius = ref(0);
const opacity = ref(1);
const lineStyle = ref<"solid" | "dashed">("solid");
const lineDashPattern = ref("8,4");
const labelColor = ref("#333333");
const labelFontSize = ref(14);
const labelPadding = ref(8);
const labelMargin = ref(0);
const labelPlacement = ref<"auto" | "center" | "top" | "bottom" | "left" | "right">("auto");

// --- Edge style state ---
const edgeLabel = ref("");
const edgeStrokeColor = ref("#666666");
const edgeStrokeWidth = ref(2);
const edgeLineStyle = ref<"solid" | "dashed">("solid");
const edgeLineDashPattern = ref("8,4");
const edgeType = ref<"straight" | "polyline" | "bezier">("polyline");
const edgeEndMarker = ref<"none" | "arrow" | "open" | "diamond" | "circle">("open");
const edgeStartMarker = ref<"none" | "arrow" | "open" | "diamond" | "circle">("none");
const edgeOpacity = ref(1);
const edgeLabelColor = ref("#333333");
const edgeLabelFontSize = ref(14);
const edgeLabelBgColor = ref("#ffffff");
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
  const iconSource = (node as any).icon?.source as string | undefined;
  if (iconSource && typeof iconSource === "string") {
    const match = iconSource.match(/\/icons\/(.+)\.svg$/);
    iconName.value = match?.[1] ?? "";
  } else {
    iconName.value = "";
  }

  label.value = node.label?.text ?? "";
  const style = node.style || {};
  fillColor.value = style.fillColor || "#ffffff";
  strokeColor.value = style.strokeColor || "#333333";
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
  labelFontSize.value = labelStyle?.fontSize ?? 14;
  labelPadding.value = node.label?.padding ?? 8;
  labelMargin.value = node.label?.margin ?? 0;
  labelPlacement.value = (node as any).labelPlacement ?? "auto";
}

function loadEdgeProps() {
  const edge = getSelectedEdge();
  if (!edge) return;

  edgeLabel.value = edge.label?.text ?? "";
  const style = edge.style || {};
  edgeStrokeColor.value = style.strokeColor || "#666666";
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
  edgeLabelFontSize.value = eLabelStyle?.fontSize ?? 14;
  edgeLabelBgColor.value = (edge as any).labelBackground?.color || "#ffffff";
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
  } else {
    loadNodeProps();
  }
}, {immediate: true});

// --- Node handlers ---
function handleIconChange(value: string) {
  iconName.value = value;
  if (!props.selectedElementId || !props.interactionManager) return;
  props.interactionManager.changeNodeProperties(props.selectedElementId, (node) => {
    if (value) {
      (node as any).icon = {
        source: `/icons/${value}.svg`,
        placement: "top-left",
        width: 20,
        height: 20,
        fit: "contain"
      };
    } else {
      (node as any).icon = undefined;
    }
  });
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
  applyNodeStyle({fillColor: value});
  emitNodeStyle();
}

function handleStrokeColorChange(value: string) {
  strokeColor.value = value;
  applyNodeStyle({strokeColor: value});
  emitNodeStyle();
}

function handleStrokeWidthChange(value: string) {
  const v = parseFloat(value);
  if (Number.isFinite(v)) {
    strokeWidth.value = v;
    applyNodeStyle({strokeWidth: v});
    emitNodeStyle();
  }
}

function handleCornerRadiusChange(value: string) {
  const v = parseFloat(value);
  if (!Number.isFinite(v) || !props.selectedElementId || !props.interactionManager) return;
  cornerRadius.value = v;
  props.interactionManager.changeNodeProperties(props.selectedElementId, (node) => {
    if ("cornerRadius" in node) {
      (node as any).cornerRadius = v;
    }
  });
  emitNodeStyle();
}

function handleOpacityChange(value: string) {
  const v = parseFloat(value);
  if (Number.isFinite(v)) {
    opacity.value = v;
    applyNodeStyle({opacity: v});
    emitNodeStyle();
  }
}

function handleLineStyleChange(value: string) {
  lineStyle.value = value as "solid" | "dashed";
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
  if (!props.selectedElementId || !props.interactionManager) return;
  props.interactionManager.changeNodeProperties(props.selectedElementId, (node) => {
    if (node.label) {
      node.label.style = {...(node.label.style || {}), color: value};
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
  applyEdgeStyle({strokeColor: value});
  emitEdgeStyle();
}

function handleEdgeStrokeWidthChange(value: string) {
  const v = parseFloat(value);
  if (Number.isFinite(v)) {
    edgeStrokeWidth.value = v;
    applyEdgeStyle({strokeWidth: v});
    emitEdgeStyle();
  }
}

function handleEdgeLineStyleChange(value: string) {
  edgeLineStyle.value = value as "solid" | "dashed";
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
  if (!props.selectedElementId || !props.interactionManager) return;
  props.interactionManager.changeEdgeProperties(props.selectedElementId, (edge) => {
    edge.type = v;
  });
  emitEdgeStyle();
}

function handleEdgeEndMarkerChange(value: string) {
  const v = value as "none" | "arrow" | "open" | "diamond" | "circle";
  edgeEndMarker.value = v;
  if (!props.selectedElementId || !props.interactionManager) return;
  props.interactionManager.changeEdgeProperties(props.selectedElementId, (edge) => {
    edge.endMarker = buildMarkerConfig(v, edgeEndMarkerSize.value, edgeEndMarkerFillColor.value, edgeEndMarkerFillOpacity.value);
  });
  emitEdgeStyle();
}

function handleEdgeStartMarkerChange(value: string) {
  const v = value as "none" | "arrow" | "open" | "diamond" | "circle";
  edgeStartMarker.value = v;
  if (!props.selectedElementId || !props.interactionManager) return;
  props.interactionManager.changeEdgeProperties(props.selectedElementId, (edge) => {
    edge.startMarker = buildMarkerConfig(v, edgeStartMarkerSize.value, edgeStartMarkerFillColor.value, edgeStartMarkerFillOpacity.value);
  });
  emitEdgeStyle();
}

function handleEdgeOpacityChange(value: string) {
  const v = parseFloat(value);
  if (Number.isFinite(v)) {
    edgeOpacity.value = v;
    applyEdgeStyle({opacity: v});
    emitEdgeStyle();
  }
}

function handleEdgeLabelColorChange(value: string) {
  edgeLabelColor.value = value;
  if (!props.selectedElementId || !props.interactionManager) return;
  props.interactionManager.changeEdgeProperties(props.selectedElementId, (edge) => {
    if (edge.label) {
      edge.label.style = {...(edge.label.style || {}), color: value};
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
  if (!props.selectedElementId || !props.interactionManager) return;
  props.interactionManager.changeEdgeProperties(props.selectedElementId, (edge) => {
    (edge as any).labelBackground = {...((edge as any).labelBackground || {}), color: value};
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
      Выберите элемент на диаграмме
    </div>

    <!-- Edge style controls -->
    <div v-else-if="elementType === 'edge'" class="style-panel__body">
      <div class="style-row">
        <label class="style-label">Метка</label>
        <input
          class="style-input style-input--wide"
          :value="edgeLabel"
          placeholder="Текст метки"
          @input="handleEdgeLabelChange(($event.target as HTMLInputElement).value)"
        >
      </div>

      <div class="style-row">
        <label class="style-label">Цвет метки</label>
        <div class="color-group">
          <input
            type="color"
            class="color-picker"
            :value="edgeLabelColor"
            @input="handleEdgeLabelColorChange(($event.target as HTMLInputElement).value)"
          >
          <input
            type="text"
            class="style-input"
            :value="edgeLabelColor"
            @change="handleEdgeLabelColorChange(($event.target as HTMLInputElement).value)"
          >
        </div>
      </div>

      <div class="style-row">
        <label class="style-label">Размер метки</label>
        <input
          type="number"
          class="style-input style-input--num"
          :value="edgeLabelFontSize"
          min="8"
          max="72"
          step="1"
          @input="handleEdgeLabelFontSizeChange(($event.target as HTMLInputElement).value)"
        >
      </div>

      <div class="style-row">
        <label class="style-label">Фон метки</label>
        <div class="color-group">
          <input
            type="color"
            class="color-picker"
            :value="edgeLabelBgColor"
            @input="handleEdgeLabelBgColorChange(($event.target as HTMLInputElement).value)"
          >
          <input
            type="text"
            class="style-input"
            :value="edgeLabelBgColor"
            @change="handleEdgeLabelBgColorChange(($event.target as HTMLInputElement).value)"
          >
        </div>
      </div>

      <div class="style-row">
        <label class="style-label">Цвет</label>
        <div class="color-group">
          <input
            type="color"
            class="color-picker"
            :value="edgeStrokeColor"
            @input="handleEdgeStrokeColorChange(($event.target as HTMLInputElement).value)"
          >
          <input
            type="text"
            class="style-input"
            :value="edgeStrokeColor"
            @change="handleEdgeStrokeColorChange(($event.target as HTMLInputElement).value)"
          >
        </div>
      </div>

      <div class="style-row">
        <label class="style-label">Толщина</label>
        <input
          type="number"
          class="style-input style-input--num"
          :value="edgeStrokeWidth"
          min="0"
          max="20"
          step="1"
          @input="handleEdgeStrokeWidthChange(($event.target as HTMLInputElement).value)"
        >
      </div>

      <div class="style-row">
        <label class="style-label">Стиль линии</label>
        <select
          class="style-select"
          :value="edgeLineStyle"
          @change="handleEdgeLineStyleChange(($event.target as HTMLSelectElement).value)"
        >
          <option value="solid">Сплошная</option>
          <option value="dashed">Пунктир</option>
        </select>
      </div>

      <div v-if="edgeLineStyle === 'dashed'" class="style-row">
        <label class="style-label">Паттерн</label>
        <input
          type="text"
          class="style-input style-input--wide"
          :value="edgeLineDashPattern"
          placeholder="8,4"
          @change="handleEdgeLineDashChange(($event.target as HTMLInputElement).value)"
        >
      </div>

      <div class="style-row">
        <label class="style-label">Тип линии</label>
        <select
          class="style-select"
          :value="edgeType"
          @change="handleEdgeTypeChange(($event.target as HTMLSelectElement).value)"
        >
          <option value="straight">Прямая</option>
          <option value="polyline">Ломаная</option>
          <option value="bezier">Кривая</option>
        </select>
      </div>

      <div class="style-row">
        <label class="style-label">Начало</label>
        <select
          class="style-select"
          :value="edgeStartMarker"
          @change="handleEdgeStartMarkerChange(($event.target as HTMLSelectElement).value)"
        >
          <option value="none">Нет</option>
          <option value="arrow">Стрелка</option>
          <option value="open">Открытая</option>
          <option value="diamond">Ромб</option>
          <option value="circle">Круг</option>
        </select>
      </div>

      <div v-if="edgeStartMarker !== 'none'" class="style-row">
        <label class="style-label">Размер нач.</label>
        <input
          type="number"
          class="style-input style-input--num"
          :value="edgeStartMarkerSize"
          min="4"
          max="40"
          step="1"
          @input="handleEdgeStartMarkerSizeChange(($event.target as HTMLInputElement).value)"
        >
      </div>

      <div v-if="edgeStartMarker !== 'none'" class="style-row">
        <label class="style-label">Заливка нач.</label>
        <div class="color-group">
          <input
            type="color"
            class="color-picker"
            :value="edgeStartMarkerFillColor"
            @input="handleEdgeStartMarkerFillColorChange(($event.target as HTMLInputElement).value)"
          >
          <input
            type="text"
            class="style-input"
            :value="edgeStartMarkerFillColor"
            @change="handleEdgeStartMarkerFillColorChange(($event.target as HTMLInputElement).value)"
          >
        </div>
      </div>

      <div v-if="edgeStartMarker !== 'none'" class="style-row">
        <label class="style-label">Непрозр. нач.</label>
        <input
          type="number"
          class="style-input style-input--num"
          :value="edgeStartMarkerFillOpacity"
          min="0"
          max="1"
          step="0.1"
          @input="handleEdgeStartMarkerFillOpacityChange(($event.target as HTMLInputElement).value)"
        >
      </div>

      <div class="style-row">
        <label class="style-label">Конец</label>
        <select
          class="style-select"
          :value="edgeEndMarker"
          @change="handleEdgeEndMarkerChange(($event.target as HTMLSelectElement).value)"
        >
          <option value="none">Нет</option>
          <option value="arrow">Стрелка</option>
          <option value="open">Открытая</option>
          <option value="diamond">Ромб</option>
          <option value="circle">Круг</option>
        </select>
      </div>

      <div v-if="edgeEndMarker !== 'none'" class="style-row">
        <label class="style-label">Размер кон.</label>
        <input
          type="number"
          class="style-input style-input--num"
          :value="edgeEndMarkerSize"
          min="4"
          max="40"
          step="1"
          @input="handleEdgeEndMarkerSizeChange(($event.target as HTMLInputElement).value)"
        >
      </div>

      <div v-if="edgeEndMarker !== 'none'" class="style-row">
        <label class="style-label">Заливка кон.</label>
        <div class="color-group">
          <input
            type="color"
            class="color-picker"
            :value="edgeEndMarkerFillColor"
            @input="handleEdgeEndMarkerFillColorChange(($event.target as HTMLInputElement).value)"
          >
          <input
            type="text"
            class="style-input"
            :value="edgeEndMarkerFillColor"
            @change="handleEdgeEndMarkerFillColorChange(($event.target as HTMLInputElement).value)"
          >
        </div>
      </div>

      <div v-if="edgeEndMarker !== 'none'" class="style-row">
        <label class="style-label">Непрозр. кон.</label>
        <input
          type="number"
          class="style-input style-input--num"
          :value="edgeEndMarkerFillOpacity"
          min="0"
          max="1"
          step="0.1"
          @input="handleEdgeEndMarkerFillOpacityChange(($event.target as HTMLInputElement).value)"
        >
      </div>

      <div class="style-row">
        <label class="style-label">Прозрачность</label>
        <input
          type="number"
          class="style-input style-input--num"
          :value="edgeOpacity"
          min="0"
          max="1"
          step="0.1"
          @input="handleEdgeOpacityChange(($event.target as HTMLInputElement).value)"
        >
      </div>
    </div>

    <!-- Node style controls -->
    <div v-else class="style-panel__body">
      <div class="style-row">
        <label class="style-label">Метка</label>
        <input
          class="style-input style-input--wide"
          :value="label"
          placeholder="Текст метки"
          @input="handleLabelChange(($event.target as HTMLInputElement).value)"
        >
      </div>

      <div class="style-row">
        <label class="style-label">Цвет метки</label>
        <div class="color-group">
          <input
            type="color"
            class="color-picker"
            :value="labelColor"
            @input="handleLabelColorChange(($event.target as HTMLInputElement).value)"
          >
          <input
            type="text"
            class="style-input"
            :value="labelColor"
            @change="handleLabelColorChange(($event.target as HTMLInputElement).value)"
          >
        </div>
      </div>

      <div class="style-row">
        <label class="style-label">Размер метки</label>
        <input
          type="number"
          class="style-input style-input--num"
          :value="labelFontSize"
          min="8"
          max="72"
          step="1"
          @input="handleLabelFontSizeChange(($event.target as HTMLInputElement).value)"
        >
      </div>

      <div class="style-row">
        <label class="style-label">Отступ метки</label>
        <input
          type="number"
          class="style-input style-input--num"
          :value="labelPadding"
          min="0"
          max="50"
          step="1"
          @input="handleLabelPaddingChange(($event.target as HTMLInputElement).value)"
        >
      </div>

      <div class="style-row">
        <label class="style-label">Маргин метки</label>
        <input
          type="number"
          class="style-input style-input--num"
          :value="labelMargin"
          min="0"
          max="50"
          step="1"
          @input="handleLabelMarginChange(($event.target as HTMLInputElement).value)"
        >
      </div>

      <div class="style-row">
        <label class="style-label">Позиция метки</label>
        <select
          class="style-select"
          :value="labelPlacement"
          @change="handleLabelPlacementChange(($event.target as HTMLSelectElement).value)"
        >
          <option value="auto">Авто</option>
          <option value="center">Центр</option>
          <option value="top">Сверху</option>
          <option value="bottom">Снизу</option>
          <option value="left">Слева</option>
          <option value="right">Справа</option>
        </select>
      </div>

      <div class="style-row">
        <label class="style-label">Иконка</label>
        <div class="icon-group">
          <select
            class="style-select style-select--wide"
            :value="iconName"
            @change="handleIconChange(($event.target as HTMLSelectElement).value)"
          >
            <option value="">Нет</option>
            <option v-for="name in AVAILABLE_ICONS" :key="name" :value="name">
              {{ name }}
            </option>
          </select>
          <img
            v-if="iconName"
            class="icon-preview"
            :src="`/icons/${iconName}.svg`"
            :alt="iconName"
          >
        </div>
      </div>

      <div class="style-row">
        <label class="style-label">Заливка</label>
        <div class="color-group">
          <input
            type="color"
            class="color-picker"
            :value="fillColor"
            @input="handleFillChange(($event.target as HTMLInputElement).value)"
          >
          <input
            type="text"
            class="style-input"
            :value="fillColor"
            @change="handleFillChange(($event.target as HTMLInputElement).value)"
          >
        </div>
      </div>

      <div class="style-row">
        <label class="style-label">Обводка</label>
        <div class="color-group">
          <input
            type="color"
            class="color-picker"
            :value="strokeColor"
            @input="handleStrokeColorChange(($event.target as HTMLInputElement).value)"
          >
          <input
            type="text"
            class="style-input"
            :value="strokeColor"
            @change="handleStrokeColorChange(($event.target as HTMLInputElement).value)"
          >
        </div>
      </div>

      <div class="style-row">
        <label class="style-label">Толщина</label>
        <input
          type="number"
          class="style-input style-input--num"
          :value="strokeWidth"
          min="0"
          max="20"
          step="1"
          @input="handleStrokeWidthChange(($event.target as HTMLInputElement).value)"
        >
      </div>

      <div class="style-row">
        <label class="style-label">Стиль линии</label>
        <select
          class="style-select"
          :value="lineStyle"
          @change="handleLineStyleChange(($event.target as HTMLSelectElement).value)"
        >
          <option value="solid">Сплошная</option>
          <option value="dashed">Пунктир</option>
        </select>
      </div>

      <div v-if="lineStyle === 'dashed'" class="style-row">
        <label class="style-label">Паттерн</label>
        <input
          type="text"
          class="style-input style-input--wide"
          :value="lineDashPattern"
          placeholder="8,4"
          @change="handleLineDashChange(($event.target as HTMLInputElement).value)"
        >
      </div>

      <div class="style-row">
        <label class="style-label">Скругление</label>
        <input
          type="number"
          class="style-input style-input--num"
          :value="cornerRadius"
          min="0"
          max="50"
          step="1"
          @input="handleCornerRadiusChange(($event.target as HTMLInputElement).value)"
        >
      </div>

      <div class="style-row">
        <label class="style-label">Прозрачность</label>
        <input
          type="number"
          class="style-input style-input--num"
          :value="opacity"
          min="0"
          max="1"
          step="0.1"
          @input="handleOpacityChange(($event.target as HTMLInputElement).value)"
        >
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
  background: var(--surface);
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
  font-size: 13px;
  font-weight: 600;
  color: var(--base-text);
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.style-panel__empty {
  padding: 24px 16px;
  text-align: center;
  font-size: 13px;
  color: var(--text-subtle);
}

.style-panel__body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.style-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.style-label {
  flex: 0 0 80px;
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
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
  width: 28px;
  height: 28px;
  padding: 2px;
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
  flex-shrink: 0;
  background: var(--surface-muted);
}
</style>
