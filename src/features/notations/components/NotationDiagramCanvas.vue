<script setup lang="ts">
import { ref, toRef } from "vue";
import type { NotationEditorState } from "../types";
import { useDiagramRenderer } from "@/features/diagram/useDiagramRenderer";
import { useNotationDiagram, type EntityKind } from "../composables/useNotationDiagram";

const props = defineProps<{
  state: NotationEditorState;
  selectedId: string | null;
}>();

const emit = defineEmits<{
  select: [id: string | null, kind: EntityKind | null];
}>();

const containerRef = ref<HTMLDivElement | null>(null);
const canvasRef = ref<HTMLCanvasElement | null>(null);

const stateRef = toRef(props, "state");
const selectedIdRef = toRef(props, "selectedId");

const {
  initRenderer,
  destroyRenderer: destroyNotationRenderer,
  fitToView,
  autoLayoutComponents,
  resetView,
  interactionManagerRef,
  rendererRef: diagramRendererRef,
  getNodeEntity
} = useNotationDiagram({
  state: stateRef,
  selectedId: selectedIdRef,
  onSelect: (id, kind) => emit("select", id, kind)
});

const {
  gridOverlayRef,
  miniMapRef,
  rulersOverlayRef,
} = useDiagramRenderer({
  canvasRef,
  containerRef,
  backgroundColor: () =>
    getComputedStyle(document.documentElement).getPropertyValue('--base-bg').trim() || "#f4f2ef",
  overlays: {
    grid: { options: { gridSize: 20, color: "#e2e8f0" } },
    rulers: { options: { enabled: true } },
    miniMap: { options: { width: 120, height: 60, padding: 20, contentMargin: 200 } },
  },
  interactions: {
    snapToGrid: true,
    gridSize: 20,
    alignToNodes: true,
    alignmentScreenTolerance: 40,
    previewPathType: "straight",
    keymap: { deleteKeys: [] }
  },
  onReady: ({ renderer, interactionManager }) => {
    if (interactionManager) initRenderer(renderer, interactionManager)
  },
  onBeforeDestroy: () => destroyNotationRenderer(),
});

defineExpose({
  fitToView,
  autoLayoutComponents,
  resetView,
  interactionManagerRef,
  gridOverlayRef,
  miniMapRef,
  rulersOverlayRef,
  rendererRef: diagramRendererRef,
  getNodeEntity
});
</script>

<template>
  <div ref="containerRef" class="notation-diagram">
    <canvas
      ref="canvasRef"
      class="diagram-canvas"
    />
  </div>
</template>

<style scoped>
.notation-diagram {
  width: 100%;
  height: 100%;
  overflow: hidden;
  position: relative;
}

.diagram-canvas {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
