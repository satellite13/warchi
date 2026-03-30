<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import {
  DiagramRenderer,
  CompositeNode,
  deserializeCComponent,
  type CContainer,
  type CComponent,
} from '@ngroznykh/papirus'
import type { CompositeSerializedCComponent } from '../../notationAttrs'

const props = defineProps<{
  content: CompositeSerializedCComponent
  width?: number
  height?: number
  showContainerBorders?: boolean
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
let renderer: DiagramRenderer | null = null

/** Recursively wrap CContainer.render to draw debug borders */
function wrapContainerRenders(
  component: CComponent,
  ctx: CanvasRenderingContext2D,
): void {
  if (component.type === 'container') {
    const container = component as CContainer & {
      _origRender?: (ctx: CanvasRenderingContext2D, bounds: { x: number; y: number; width: number; height: number }) => void
    }
    if (!container._origRender) {
      container._origRender = container.render.bind(container)
      container.render = (
        renderCtx: CanvasRenderingContext2D,
        bounds: { x: number; y: number; width: number; height: number },
      ) => {
        container._origRender!(renderCtx, bounds)
        // Draw dashed border overlay
        renderCtx.save()
        renderCtx.strokeStyle = 'rgba(99, 102, 241, 0.35)'
        renderCtx.lineWidth = 1
        renderCtx.setLineDash([3, 3])
        renderCtx.strokeRect(
          bounds.x + 0.5,
          bounds.y + 0.5,
          bounds.width - 1,
          bounds.height - 1,
        )
        renderCtx.restore()
      }
    }
    // Wrap children recursively
    const children = (container as unknown as { _children?: CComponent[] })._children
    if (Array.isArray(children)) {
      for (const child of children) {
        wrapContainerRenders(child, ctx)
      }
    }
  }
  // Shape has content container
  if (component.type === 'shape') {
    const shape = component as unknown as { _content?: CComponent }
    if (shape._content) {
      wrapContainerRenders(shape._content, ctx)
    }
  }
}

function renderPreview(): void {
  if (!renderer) return
  renderer.clear()
  const w = props.width ?? 300
  const h = props.height ?? 180
  const content = deserializeCComponent(props.content) as unknown as CContainer
  const node = new CompositeNode({
    id: 'preview-composite',
    x: 20,
    y: 20,
    width: w - 40,
    height: h - 40,
    content,
    shapeType: 'rectangle',
  })

  if (props.showContainerBorders !== false && canvasRef.value) {
    const ctx = canvasRef.value.getContext('2d')
    if (ctx) {
      wrapContainerRenders(content, ctx)
    }
  }

  renderer.addNode(node)
  renderer.markDirty()
}

onMounted(() => {
  if (!canvasRef.value) return
  renderer = new DiagramRenderer(canvasRef.value, {
    width: props.width ?? 300,
    height: props.height ?? 180,
    backgroundColor: '#ffffff',
  })
  renderPreview()
})

watch(
  () => props.content,
  () => {
    renderPreview()
  },
  { deep: true },
)

onBeforeUnmount(() => {
  renderer?.destroy()
  renderer = null
})
</script>

<template>
  <div class="preview">
    <canvas ref="canvasRef" :width="width ?? 300" :height="height ?? 180" />
  </div>
</template>

<style scoped>
.preview {
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  background: var(--surface);
}

canvas {
  display: block;
  width: 100%;
}
</style>
