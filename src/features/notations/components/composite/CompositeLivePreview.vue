<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { DiagramRenderer, CompositeNode, deserializeCComponent, type CContainer } from '@ngroznykh/papirus'
import type { CompositeSerializedCComponent } from '../../notationAttrs'

const props = defineProps<{
  content: CompositeSerializedCComponent
  width?: number
  height?: number
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
let renderer: DiagramRenderer | null = null

function renderPreview(): void {
  if (!renderer) return
  renderer.clear()
  const node = new CompositeNode({
    id: 'preview-composite',
    x: 20,
    y: 20,
    width: (props.width ?? 300) - 40,
    height: (props.height ?? 180) - 40,
    content: deserializeCComponent(props.content) as unknown as CContainer,
    shapeType: 'rectangle',
  })
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
  { deep: true }
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
canvas { display: block; width: 100%; }
</style>

