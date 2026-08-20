<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import {
  DiagramRenderer,
  CompositeNode,
  deserializeCComponent,
  isExternalLabelPlacement,
  type CContainer,
  type CComponent,
  type CompositeShapeType,
  type LabelPlacement,
} from '@ngroznykh/papirus'
import type { CompositeSerializedCComponent, DiagramStyle } from '@/domain/attrs/notationAttrs'

const props = defineProps<{
  content: CompositeSerializedCComponent
  width?: number
  height?: number
  selectedNodeId?: string | null
  label?: string
  labelPlacement?: DiagramStyle['labelPlacement']
  labelGap?: number
  shapeType?: DiagramStyle['compositeShapeType']
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
let renderer: DiagramRenderer | null = null

type BoundsRecord = { id: string; x: number; y: number; width: number; height: number }

/**
 * Recursively wrap render methods on CComponents to capture their bounds
 * and optionally highlight the selected node.
 */
function instrumentTree(
  component: CComponent,
  boundsCollector: BoundsRecord[],
  selectedId: string | null,
): void {
  const orig = component.render.bind(component)
  const compId = component.id
  const isContainer = component.type === 'container'
  const isSelected = compId != null && compId === selectedId

  component.render = (
    ctx: CanvasRenderingContext2D,
    bounds: { x: number; y: number; width: number; height: number },
  ) => {
    orig(ctx, bounds)

    if (compId) {
      boundsCollector.push({ id: compId, ...bounds })
    }

    // Draw dashed border for all containers
    if (isContainer) {
      ctx.save()
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.2)'
      ctx.lineWidth = 1
      ctx.setLineDash([2, 2])
      ctx.strokeRect(bounds.x + 0.5, bounds.y + 0.5, bounds.width - 1, bounds.height - 1)
      ctx.restore()
    }

    // Highlight selected node
    if (isSelected) {
      ctx.save()
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.8)'
      ctx.lineWidth = 2
      ctx.setLineDash([4, 3])
      ctx.strokeRect(bounds.x + 1, bounds.y + 1, bounds.width - 2, bounds.height - 2)
      ctx.restore()
    }
  }

  // Recurse into children
  if (component.type === 'container') {
    const cont = component as CContainer & { children: readonly CComponent[] }
    if (cont.children) {
      for (const child of cont.children) {
        instrumentTree(child, boundsCollector, selectedId)
      }
    }
  }
  if (component.type === 'shape') {
    const shape = component as unknown as { content?: CComponent }
    if (shape.content) {
      instrumentTree(shape.content, boundsCollector, selectedId)
    }
  }
}

function findBoundName(node: CompositeSerializedCComponent): string | undefined {
  if (node.type === 'text' && node.bindToProperty === '__name__' && typeof node.text === 'string') {
    return node.text
  }
  if (node.content) {
    const nested = findBoundName(node.content)
    if (nested) return nested
  }
  if (node.children) {
    for (const child of node.children) {
      const found = findBoundName(child)
      if (found) return found
    }
  }
  return undefined
}

function resolvePreviewShape(shape?: DiagramStyle['compositeShapeType']): CompositeShapeType {
  if (shape === 'circle' || shape === 'diamond') return shape
  return 'rectangle'
}

function resolvePreviewPlacement(value?: DiagramStyle['labelPlacement']): LabelPlacement {
  if (
    value === 'top' ||
    value === 'bottom' ||
    value === 'left' ||
    value === 'right' ||
    value === 'center' ||
    value === 'auto'
  ) {
    return value
  }
  return 'center'
}

function renderPreview(): void {
  if (!renderer) return
  renderer.clear()
  const w = props.width ?? 300
  const h = props.height ?? 120
  const content = deserializeCComponent(props.content) as unknown as CContainer
  const boundsCollector: BoundsRecord[] = []

  instrumentTree(content, boundsCollector, props.selectedNodeId ?? null)

  const placement = resolvePreviewPlacement(props.labelPlacement)
  const pad = isExternalLabelPlacement(placement) ? 36 : 20
  const labelText = props.label?.trim() || findBoundName(props.content) || 'Name'
  const node = new CompositeNode({
    id: 'preview-composite',
    x: pad,
    y: pad,
    width: Math.max(24, w - pad * 2),
    height: Math.max(24, h - pad * 2),
    content,
    shapeType: resolvePreviewShape(props.shapeType),
    label: labelText,
    labelPlacement: placement,
    ...(typeof props.labelGap === 'number' ? { labelGap: props.labelGap } : {}),
  })
  renderer.addNode(node)
  renderer.markDirty()
}

onMounted(() => {
  if (!canvasRef.value) return
  renderer = new DiagramRenderer(canvasRef.value, {
    width: props.width ?? 300,
    height: props.height ?? 120,
    backgroundColor: '#ffffff',
  })
  renderPreview()
})

watch(
  [
    () => props.content,
    () => props.selectedNodeId,
    () => props.label,
    () => props.labelPlacement,
    () => props.labelGap,
    () => props.shapeType,
  ],
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
    <canvas ref="canvasRef" :width="width ?? 300" :height="height ?? 120" />
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
