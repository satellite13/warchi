<script setup lang="ts">
import { ref, toRef, onMounted, onBeforeUnmount } from "vue";
import { DiagramRenderer } from "@ngroznykh/papirus";
import type { DiagramOptions } from "@ngroznykh/papirus";
import type { NotationEditorState } from "../types";
import { useNotationDiagram, type EntityKind } from "../composables/useNotationDiagram";

const props = defineProps<{
  state: NotationEditorState;
  selectedId: string | null;
}>();

const emit = defineEmits<{
  select: [id: string, kind: EntityKind];
}>();

const containerRef = ref<HTMLDivElement | null>(null);
const canvasRef = ref<HTMLCanvasElement | null>(null);
const canvasWidth = ref(800);
const canvasHeight = ref(600);

const stateRef = toRef(props, "state");
const selectedIdRef = toRef(props, "selectedId");

let renderer: DiagramRenderer | null = null;

const {
  initRenderer,
  destroyRenderer,
  fitToView,
  autoLayoutComponents,
  resetView,
  interactionManagerRef,
  gridOverlayRef,
  miniMapRef,
  rendererRef: diagramRendererRef,
  getNodeEntity
} = useNotationDiagram({
  state: stateRef,
  selectedId: selectedIdRef,
  onSelect: (id, kind) => emit("select", id, kind)
});

function updateSize() {
  if (containerRef.value) {
    const newWidth = containerRef.value.clientWidth || 800;
    const newHeight = containerRef.value.clientHeight || 600;

    if (newWidth !== canvasWidth.value || newHeight !== canvasHeight.value) {
      canvasWidth.value = newWidth;
      canvasHeight.value = newHeight;
      if (renderer) {
        renderer.resize(newWidth, newHeight);
      }
    }
  }
}

let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  if (!canvasRef.value || !containerRef.value) {
    return;
  }

  const initCanvas = () => {
    if (!canvasRef.value || !containerRef.value) return;

    const width = containerRef.value.clientWidth;
    const height = containerRef.value.clientHeight;

    if (width === 0 || height === 0) {
      window.requestAnimationFrame(initCanvas);
      return;
    }

    canvasWidth.value = width;
    canvasHeight.value = height;

    const options: DiagramOptions = {
      width,
      height,
      backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--base-bg').trim() || "#f4f2ef"
    };

    renderer = new DiagramRenderer(canvasRef.value, options);
    initRenderer(renderer);

    resizeObserver = new ResizeObserver(() => {
      updateSize();
    });
    resizeObserver.observe(containerRef.value);
  };

  initCanvas();
});

onBeforeUnmount(() => {
  destroyRenderer();
  renderer?.destroy();
  renderer = null;
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
});

defineExpose({
  fitToView,
  autoLayoutComponents,
  resetView,
  interactionManagerRef,
  gridOverlayRef,
  miniMapRef,
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
