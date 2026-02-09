<script setup lang="ts">
import { ref, toRef, onMounted, onBeforeUnmount } from "vue";
import { DiagramRenderer } from "papirus";
import type { DiagramOptions } from "papirus";
import type { NotationEditorState } from "../types";
import { useNotationDiagram, type EntityKind } from "../composables/useNotationDiagram";

const props = defineProps<{
  state: NotationEditorState;
  selectedId: string | null;
}>();

const emit = defineEmits<{
  select: [id: string, kind: EntityKind];
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const canvasWidth = ref(800);
const canvasHeight = ref(600);

const stateRef = toRef(props, "state");
const selectedIdRef = toRef(props, "selectedId");

let renderer: DiagramRenderer | null = null;

const { initRenderer, destroyRenderer, fitToView, resetView } = useNotationDiagram({
  state: stateRef,
  selectedId: selectedIdRef,
  onSelect: (id, kind) => emit("select", id, kind)
});

function updateSize() {
  if (canvasRef.value) {
    const newWidth = canvasRef.value.clientWidth || 800;
    const newHeight = canvasRef.value.clientHeight || 600;

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
  if (!canvasRef.value) {
    return;
  }

  const initCanvas = () => {
    if (!canvasRef.value) return;

    const width = canvasRef.value.clientWidth;
    const height = canvasRef.value.clientHeight;

    if (width === 0 || height === 0) {
      window.requestAnimationFrame(initCanvas);
      return;
    }

    canvasWidth.value = width;
    canvasHeight.value = height;

    const options: DiagramOptions = {
      width,
      height,
      backgroundColor: "#fafafa"
    };

    renderer = new DiagramRenderer(canvasRef.value, options);
    initRenderer(renderer);

    resizeObserver = new ResizeObserver(() => {
      updateSize();
    });
    resizeObserver.observe(canvasRef.value);
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
  resetView
});
</script>

<template>
  <div class="notation-diagram-wrapper">
    <div class="diagram-toolbar">
      <button
        type="button"
        class="toolbar-button"
        title="Вписать в экран"
        @click="fitToView"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
        </svg>
      </button>
      <button
        type="button"
        class="toolbar-button"
        title="Сбросить масштаб"
        @click="resetView"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <path d="M3 3v5h5" />
        </svg>
      </button>
    </div>
    <div class="notation-diagram">
      <canvas
        ref="canvasRef"
        class="diagram-canvas"
      />
    </div>
  </div>
</template>

<style scoped>
.notation-diagram-wrapper {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.diagram-toolbar {
  display: flex;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}

.toolbar-button {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
}

.toolbar-button:hover {
  background: var(--primary-soft);
  color: var(--primary);
  border-color: var(--primary);
}

.toolbar-button svg {
  width: 16px;
  height: 16px;
}

.notation-diagram {
  flex: 1;
  overflow: hidden;
  position: relative;
}

.diagram-canvas {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
