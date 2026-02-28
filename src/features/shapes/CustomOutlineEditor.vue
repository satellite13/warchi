<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from "vue"
import type { OutlineSegment } from "../notations/notationAttrs"
import { DEFAULT_RECTANGLE_OUTLINE } from "../notations/notationAttrs"

/** Базовый размер фигуры в нотации (для отображения подложки) */
const BASE_SHAPE_WIDTH = 180
const BASE_SHAPE_HEIGHT = 80

const props = withDefaults(
  defineProps<{
    modelValue: OutlineSegment[]
    disabled?: boolean
  }>(),
  { disabled: false }
)

const emit = defineEmits<{
  (e: "update:modelValue", value: OutlineSegment[]): void
}>()

function segmentsToPoints(segments: OutlineSegment[]): [number, number][] {
  const points: [number, number][] = []
  for (const seg of segments) {
    if (seg.type === "line") {
      if (points.length === 0) points.push([...seg.points[0]])
      points.push([...seg.points[1]])
    }
    // Bezier: for phase 1 we skip; could add later
  }
  // Замкнутый контур: последний сегмент ведёт в первую точку — убираем дубликат
  if (
    points.length > 1 &&
    points[0]![0] === points[points.length - 1]![0] &&
    points[0]![1] === points[points.length - 1]![1]
  ) {
    points.pop()
  }
  return points
}

function pointsToSegments(points: [number, number][]): OutlineSegment[] {
  if (points.length < 2) return []
  const segments: OutlineSegment[] = []
  for (let i = 0; i < points.length; i++) {
    const next = (i + 1) % points.length
    const a = points[i]!
    const b = points[next]!
    segments.push({
      type: "line",
      points: [[a[0], a[1]], [b[0], b[1]]]
    })
  }
  return segments
}

const points = ref<[number, number][]>([])

function getDefaultRectanglePoints(): [number, number][] {
  return segmentsToPoints(DEFAULT_RECTANGLE_OUTLINE)
}

function syncFromModel() {
  if (props.modelValue?.length) {
    const p = segmentsToPoints(props.modelValue)
    if (p.length >= 2) {
      points.value = p
      return
    }
  }
  points.value = getDefaultRectanglePoints()
  emitUpdate()
}

watch(
  () => props.modelValue,
  () => syncFromModel(),
  { immediate: true, deep: true }
)

const canvasRef = ref<HTMLCanvasElement | null>(null)
const draggingIndex = ref<number | null>(null)

const ZOOM_MIN = 0.5
const ZOOM_MAX = 3
const ZOOM_STEP = 0.25
const zoomFactor = ref(1)

function getEventPoint(e: MouseEvent): [number, number] | null {
  const canvas = canvasRef.value
  if (!canvas) return null
  const rect = canvas.getBoundingClientRect()
  const sx = (e.clientX - rect.left) / rect.width
  const sy = (e.clientY - rect.top) / rect.height
  const zoom = zoomFactor.value
  const x = 0.5 + (sx - 0.5) / zoom
  const y = 0.5 + (sy - 0.5) / zoom
  return [Math.max(0, Math.min(1, x)), Math.max(0, Math.min(1, y))]
}

function getCanvasStyles(): {
  surface: string
  surfaceMuted: string
  baseText: string
  border: string
  primary: string
  textSubtle: string
  textMuted: string
} {
  const el = canvasRef.value?.parentElement
  if (!el) {
    return {
      surface: "#ffffff",
      surfaceMuted: "#faf9f7",
      baseText: "#1a1a1a",
      border: "#e0e0e0",
      primary: "#7c5cfc",
      textSubtle: "#9a9a9a",
      textMuted: "#5c5c5c"
    }
  }
  const s = getComputedStyle(el)
  return {
    surface: s.getPropertyValue("--surface").trim() || "#ffffff",
    surfaceMuted: s.getPropertyValue("--surface-muted").trim() || "#faf9f7",
    baseText: s.getPropertyValue("--base-text").trim() || "#1a1a1a",
    border: s.getPropertyValue("--border").trim() || "#e0e0e0",
    primary: s.getPropertyValue("--primary").trim() || "#7c5cfc",
    textSubtle: s.getPropertyValue("--text-subtle").trim() || "#9a9a9a",
    textMuted: s.getPropertyValue("--text-muted").trim() || "#5c5c5c"
  }
}

function draw() {
  const canvas = canvasRef.value
  if (!canvas) return
  const container = canvas.parentElement
  if (!container) return
  const w = container.clientWidth
  const h = container.clientHeight
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  canvas.style.width = `${w}px`
  canvas.style.height = `${h}px`
  const ctx = canvas.getContext("2d")
  if (!ctx) return
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  const styles = getCanvasStyles()
  const p = points.value

  // Подложка: весь канвас в пикселях, scale 1
  ctx.fillStyle = styles.surface
  ctx.strokeStyle = styles.border
  ctx.lineWidth = 1
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1)

  const zoom = zoomFactor.value
  ctx.save()
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.scale(zoom, zoom)
  ctx.translate(-canvas.width / 2, -canvas.height / 2)

  if (p.length >= 2) {
    // Контур: Path2D в пикселях
    const outlinePath = new Path2D()
    outlinePath.moveTo(p[0]![0] * canvas.width, p[0]![1] * canvas.height)
    for (let i = 1; i < p.length; i++) {
      outlinePath.lineTo(p[i]![0] * canvas.width, p[i]![1] * canvas.height)
    }
    outlinePath.closePath()
    ctx.fillStyle = styles.surfaceMuted
    ctx.fill(outlinePath)
    ctx.strokeStyle = styles.baseText
    ctx.lineWidth = 2
    ctx.lineCap = "butt"
    ctx.lineJoin = "miter"
    ctx.stroke(outlinePath)
  }

  // Серый прямоугольник 180×80 по центру — рисуем поверх контура, пунктирная обводка
  const rw = Math.round(BASE_SHAPE_WIDTH * dpr)
  const rh = Math.round(BASE_SHAPE_HEIGHT * dpr)
  const rx = (canvas.width - rw) / 2
  const ry = (canvas.height - rh) / 2
  ctx.strokeStyle = styles.textMuted
  ctx.lineWidth = 2
  ctx.setLineDash([4, 4])
  ctx.strokeRect(rx, ry, rw, rh)
  ctx.setLineDash([])
  // Центральные оси серого прямоугольника
  const cx = rx + rw / 2
  const cy = ry + rh / 2
  ctx.setLineDash([3, 3])
  ctx.beginPath()
  ctx.moveTo(cx, ry)
  ctx.lineTo(cx, ry + rh)
  ctx.moveTo(rx, cy)
  ctx.lineTo(rx + rw, cy)
  ctx.stroke()
  ctx.setLineDash([])

  // Круги управления в пикселях
  const handleRadiusPx = 8
  const handleFill = props.disabled ? styles.textSubtle : styles.primary
  ctx.strokeStyle = styles.surface
  ctx.lineWidth = 2
  for (let i = 0; i < p.length; i++) {
    const pt = p[i]!
    const px = pt[0] * canvas.width
    const py = pt[1] * canvas.height
    ctx.beginPath()
    ctx.arc(px, py, handleRadiusPx, 0, Math.PI * 2)
    ctx.fillStyle = handleFill
    ctx.fill()
    ctx.stroke()
  }

  ctx.restore()
}

function zoomIn() {
  zoomFactor.value = Math.min(ZOOM_MAX, zoomFactor.value + ZOOM_STEP)
}

function zoomOut() {
  zoomFactor.value = Math.max(ZOOM_MIN, zoomFactor.value - ZOOM_STEP)
}

function zoomReset() {
  zoomFactor.value = 1
}

const HIT_RADIUS = 0.06
const EDGE_HIT_RADIUS = 0.05
const SNAP_THRESHOLD = 0.025

function distanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const dx = bx - ax
  const dy = by - ay
  const len = Math.hypot(dx, dy) || 1e-6
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (len * len)))
  const nx = ax + t * dx
  const ny = ay + t * dy
  return Math.hypot(px - nx, py - ny)
}

function hitTestPoint(coord: [number, number]): number {
  const [x, y] = coord
  for (let i = 0; i < points.value.length; i++) {
    const p = points.value[i]!
    if (Math.hypot(p[0] - x, p[1] - y) <= HIT_RADIUS) return i
  }
  return -1
}

function hitTestEdge(coord: [number, number]): number {
  const [x, y] = coord
  const p = points.value
  if (p.length < 2) return -1
  let best = -1
  let bestD = EDGE_HIT_RADIUS
  for (let i = 0; i < p.length; i++) {
    const next = (i + 1) % p.length
    const pi = p[i]!
    const pn = p[next]!
    const d = distanceToSegment(x, y, pi[0], pi[1], pn[0], pn[1])
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return best
}

const MIN_POINTS = 3

function emitUpdate() {
  if (points.value.length >= 2) {
    emit("update:modelValue", pointsToSegments(points.value))
  }
}

function onPointerDown(e: MouseEvent) {
  if (props.disabled) return
  const coord = getEventPoint(e)
  if (!coord) return
  const idx = hitTestPoint(coord)
  if (idx >= 0 && e.button === 0) {
    draggingIndex.value = idx
  }
}

function projectOnSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): [number, number] {
  const dx = bx - ax
  const dy = by - ay
  const len = Math.hypot(dx, dy) || 1e-6
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (len * len)))
  return [ax + t * dx, ay + t * dy]
}

function addPointOnEdge(coord: [number, number]) {
  const edgeIdx = hitTestEdge(coord)
  if (edgeIdx < 0) return
  const pts = points.value
  const next = (edgeIdx + 1) % pts.length
  const a = pts[edgeIdx]!
  const b = pts[next]!
  const newPoint = projectOnSegment(coord[0], coord[1], a[0], a[1], b[0], b[1])
  const newPoints = [...points.value]
  newPoints.splice(edgeIdx + 1, 0, newPoint)
  points.value = newPoints
  emitUpdate()
}

function removePointAt(idx: number) {
  if (points.value.length <= MIN_POINTS) return
  points.value = points.value.filter((_, i) => i !== idx)
  emitUpdate()
}

function onDoubleClick(e: MouseEvent) {
  if (props.disabled) return
  const coord = getEventPoint(e)
  if (!coord) return
  const pointIdx = hitTestPoint(coord)
  if (pointIdx >= 0) {
    removePointAt(pointIdx)
    return
  }
  const edgeIdx = hitTestEdge(coord)
  if (edgeIdx >= 0) {
    addPointOnEdge(coord)
  }
}

const CENTER_AXIS = 0.5

/** Прилипание к другим точкам и к центральным осям (0.5, 0.5) */
function snapToOtherPoints(coord: [number, number], draggingIdx: number): [number, number] {
  let x = coord[0]
  let y = coord[1]
  const pts = points.value
  let bestDx = SNAP_THRESHOLD
  let bestDy = SNAP_THRESHOLD
  for (let i = 0; i < pts.length; i++) {
    if (i === draggingIdx) continue
    const p = pts[i]!
    const dx = Math.abs(coord[0] - p[0])
    const dy = Math.abs(coord[1] - p[1])
    if (dx < bestDx) {
      bestDx = dx
      x = p[0]
    }
    if (dy < bestDy) {
      bestDy = dy
      y = p[1]
    }
  }
  if (Math.abs(coord[0] - CENTER_AXIS) < bestDx) {
    x = CENTER_AXIS
  }
  if (Math.abs(coord[1] - CENTER_AXIS) < bestDy) {
    y = CENTER_AXIS
  }
  return [x, y]
}

function onPointerMove(e: MouseEvent) {
  if (draggingIndex.value === null) return
  const coord = getEventPoint(e)
  if (!coord) return
  const snapped = snapToOtherPoints(coord, draggingIndex.value)
  const p = [...points.value]
  p[draggingIndex.value] = [snapped[0], snapped[1]]
  points.value = p
  emitUpdate()
}

function onPointerUp() {
  draggingIndex.value = null
}

watch([points, () => props.disabled, zoomFactor], () => draw(), { deep: true })

let resizeObserver: ResizeObserver | null = null
onMounted(() => {
  draw()
  const container = canvasRef.value?.parentElement
  if (container) {
    resizeObserver = new ResizeObserver(() => draw())
    resizeObserver.observe(container)
  }
})
onUnmounted(() => {
  resizeObserver?.disconnect()
})
</script>

<template>
  <div class="outline-editor-wrap">
    <div
      class="outline-editor"
      @mousedown="onPointerDown"
      @mousemove="onPointerMove"
      @mouseup="onPointerUp"
      @mouseleave="onPointerUp"
      @dblclick="onDoubleClick"
    >
      <canvas
        ref="canvasRef"
        class="outline-editor__canvas"
      />
    </div>
    <div class="outline-editor__zoom">
      <button
        type="button"
        class="outline-editor__zoom-btn"
        :disabled="zoomFactor <= ZOOM_MIN"
        :aria-label="$t('shapes.zoomOut')"
        @click="zoomOut"
      >
        −
      </button>
      <span class="outline-editor__zoom-label">{{ Math.round(zoomFactor * 100) }}%</span>
      <button
        type="button"
        class="outline-editor__zoom-btn"
        :disabled="zoomFactor >= ZOOM_MAX"
        :aria-label="$t('shapes.zoomIn')"
        @click="zoomIn"
      >
        +
      </button>
      <button
        type="button"
        class="outline-editor__zoom-btn outline-editor__zoom-btn--reset"
        :aria-label="$t('shapes.zoomReset')"
        @click="zoomReset"
      >
        1:1
      </button>
    </div>
  </div>
</template>

<style scoped>
.outline-editor-wrap {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 520px;
}

.outline-editor {
  position: relative;
  width: 100%;
  height: 360px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-muted);
}

.outline-editor__canvas {
  width: 100%;
  height: 100%;
  display: block;
  cursor: crosshair;
}

.outline-editor__zoom {
  display: flex;
  align-items: center;
  gap: 6px;
}

.outline-editor__zoom-btn {
  min-width: 32px;
  height: 28px;
  padding: 0 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--base-text);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.outline-editor__zoom-btn:hover:not(:disabled) {
  background: var(--surface-muted);
  border-color: var(--text-subtle);
}

.outline-editor__zoom-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.outline-editor__zoom-btn--reset {
  margin-left: 4px;
  font-size: 12px;
}

.outline-editor__zoom-label {
  min-width: 48px;
  font-size: 12px;
  color: var(--text-muted);
  text-align: center;
}
</style>
