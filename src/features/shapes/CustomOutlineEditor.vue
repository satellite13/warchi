<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from "vue"
import type {
  OutlineSegment,
  OutlineSegmentLine,
  ScaleSlice,
} from "@/domain/attrs/notationAttrs"
import {
  DEFAULT_RECTANGLE_OUTLINE,
  createDefaultScaleSlice,
} from "@/domain/attrs/notationAttrs"
import {
  cloneSegments,
  segmentStart,
  segmentEnd,
  projectOnSegment,
  hitTest,
  snapCoord,
  segmentLineToBezier,
  segmentBezierToLine,
  ZOOM_MIN,
  ZOOM_MAX,
  ZOOM_STEP,
  MIN_SEGMENTS,
  GUIDE_AXES,
  type DragTarget,
} from "./outlineGeometry"

const SLICE_GUIDE_HIT = 0.025
const SLICE_MIN_MIDDLE = 0.04

type SliceGuide = "left" | "right" | "top" | "bottom"

const props = withDefaults(
  defineProps<{
    modelValue: OutlineSegment[]
    disabled?: boolean
    scaleSlice?: ScaleSlice | null
    showScaleGuides?: boolean
  }>(),
  { disabled: false, scaleSlice: null, showScaleGuides: false }
)

const emit = defineEmits<{
  (e: "update:modelValue", value: OutlineSegment[]): void
  (e: "update:scaleSlice", value: ScaleSlice): void
}>()

const segments = ref<OutlineSegment[]>(cloneSegments(DEFAULT_RECTANGLE_OUTLINE))

function syncFromModel() {
  if (props.modelValue?.length) {
    segments.value = cloneSegments(props.modelValue)
    return
  }
  segments.value = cloneSegments(DEFAULT_RECTANGLE_OUTLINE)
  emitUpdate()
}

watch(
  () => props.modelValue,
  () => syncFromModel(),
  { immediate: true, deep: true }
)

const canvasRef = ref<HTMLCanvasElement | null>(null)
const dragging = ref<DragTarget | null>(null)
const draggingGuide = ref<SliceGuide | null>(null)

/** Индекс подсвечиваемого отрезка (клик по ребру) */
const selectedSegmentIndex = ref<number | null>(null)

const zoomFactor = ref(1)

function activeSlice(): ScaleSlice {
  return props.scaleSlice ?? createDefaultScaleSlice()
}

function sliceGuidePositions(slice: ScaleSlice): Record<SliceGuide, number> {
  return {
    left: slice.left / slice.refWidth,
    right: 1 - slice.right / slice.refWidth,
    top: slice.top / slice.refHeight,
    bottom: 1 - slice.bottom / slice.refHeight,
  }
}

function hitScaleGuide(coord: [number, number]): SliceGuide | null {
  if (!props.showScaleGuides) return null
  const slice = activeSlice()
  const pos = sliceGuidePositions(slice)
  const [x, y] = coord
  const candidates: Array<{ guide: SliceGuide; dist: number }> = [
    { guide: "left", dist: Math.abs(x - pos.left) },
    { guide: "right", dist: Math.abs(x - pos.right) },
    { guide: "top", dist: Math.abs(y - pos.top) },
    { guide: "bottom", dist: Math.abs(y - pos.bottom) },
  ]
  candidates.sort((a, b) => a.dist - b.dist)
  const best = candidates[0]
  return best && best.dist <= SLICE_GUIDE_HIT ? best.guide : null
}

function emitSliceUpdate(next: ScaleSlice) {
  emit("update:scaleSlice", next)
}

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
  warning: string
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
      warning: "#e67e22",
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
    warning: s.getPropertyValue("--warning").trim() || "#e67e22",
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
  const segs = segments.value
  const W = canvas.width
  const H = canvas.height
  const toPx = (x: number, y: number) => [x * W, y * H] as const

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

  if (segs.length >= 1) {
    // Контур: Path2D из сегментов (line + bezier)
    const outlinePath = new Path2D()
    const first = segmentStart(segs[0]!)
    outlinePath.moveTo(...toPx(first[0], first[1]))
    for (const seg of segs) {
      if (seg.type === "line") {
        const end = seg.points[1]
        outlinePath.lineTo(...toPx(end[0], end[1]))
      } else {
        const [p1, p2, p3] = [seg.points[1], seg.points[2], seg.points[3]]
        outlinePath.bezierCurveTo(
          ...toPx(p1[0], p1[1]),
          ...toPx(p2[0], p2[1]),
          ...toPx(p3[0], p3[1])
        )
      }
    }
    outlinePath.closePath()
    ctx.fillStyle = styles.surfaceMuted
    ctx.fill(outlinePath)
    ctx.strokeStyle = styles.baseText
    ctx.lineWidth = 2
    ctx.lineCap = "butt"
    ctx.lineJoin = "miter"
    ctx.stroke(outlinePath)

    // Подсветка выбранного отрезка
    const selIdx = selectedSegmentIndex.value
    if (selIdx !== null && segs[selIdx]) {
      const seg = segs[selIdx]!
      ctx.beginPath()
      const start = segmentStart(seg)
      ctx.moveTo(...toPx(start[0], start[1]))
      if (seg.type === "line") {
        ctx.lineTo(...toPx(seg.points[1][0], seg.points[1][1]))
      } else {
        const [p1, p2, p3] = [seg.points[1], seg.points[2], seg.points[3]]
        ctx.bezierCurveTo(
          ...toPx(p1[0], p1[1]),
          ...toPx(p2[0], p2[1]),
          ...toPx(p3[0], p3[1])
        )
      }
      ctx.strokeStyle = styles.primary
      ctx.lineWidth = 4
      ctx.lineCap = "round"
      ctx.lineJoin = "round"
      ctx.stroke()
    }

    // Серый прямоугольник по контуру (bounding box всех точек)
    let minX = 1
    let minY = 1
    let maxX = 0
    let maxY = 0
    for (const seg of segs) {
      for (const p of seg.points) {
        minX = Math.min(minX, p[0])
        minY = Math.min(minY, p[1])
        maxX = Math.max(maxX, p[0])
        maxY = Math.max(maxY, p[1])
      }
    }
    ctx.strokeStyle = styles.textMuted
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.strokeRect(minX * W, minY * H, (maxX - minX) * W, (maxY - minY) * H)
    ctx.setLineDash([])
  }

  // Вспомогательные вертикали и горизонтали (GUIDE_AXES; прилипание в snapToOtherPoints)
  ctx.strokeStyle = styles.textMuted
  ctx.lineWidth = 1
  ctx.setLineDash([3, 3])
  ctx.beginPath()
  for (const t of GUIDE_AXES) {
    const px = t * canvas.width
    const py = t * canvas.height
    ctx.moveTo(px, 0)
    ctx.lineTo(px, canvas.height)
    ctx.moveTo(0, py)
    ctx.lineTo(canvas.width, py)
  }
  ctx.stroke()
  ctx.setLineDash([])

  // 9-slice guides (when enabled) — warning color, distinct from outline/handles
  if (props.showScaleGuides) {
    const slice = activeSlice()
    const pos = sliceGuidePositions(slice)
    ctx.strokeStyle = styles.warning
    ctx.lineWidth = 1.5
    ctx.setLineDash([6, 4])
    ctx.beginPath()
    ctx.moveTo(pos.left * W, 0)
    ctx.lineTo(pos.left * W, H)
    ctx.moveTo(pos.right * W, 0)
    ctx.lineTo(pos.right * W, H)
    ctx.moveTo(0, pos.top * H)
    ctx.lineTo(W, pos.top * H)
    ctx.moveTo(0, pos.bottom * H)
    ctx.lineTo(W, pos.bottom * H)
    ctx.stroke()
    ctx.setLineDash([])
    const grip = 5
    ctx.fillStyle = styles.warning
    ctx.strokeStyle = styles.surface
    ctx.lineWidth = 1.5
    for (const [gx, gy] of [
      [pos.left * W, H * 0.5],
      [pos.right * W, H * 0.5],
      [W * 0.5, pos.top * H],
      [W * 0.5, pos.bottom * H],
    ] as const) {
      ctx.beginPath()
      ctx.rect(gx - grip, gy - grip, grip * 2, grip * 2)
      ctx.fill()
      ctx.stroke()
    }
  }

  // Узлы и усики Bezier
  const handleRadiusPx = 8
  const cpRadiusPx = 6
  const handleFill = props.disabled ? styles.textSubtle : styles.primary
  ctx.strokeStyle = styles.surface
  ctx.lineWidth = 2
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i]!
    const start = segmentStart(seg)
    const end = segmentEnd(seg)
    // Узел в конце сегмента (общий с началом следующего)
    ctx.beginPath()
    ctx.arc(end[0] * W, end[1] * H, handleRadiusPx, 0, Math.PI * 2)
    ctx.fillStyle = handleFill
    ctx.fill()
    ctx.stroke()
    if (seg.type === "bezier") {
      const [cp1, cp2] = [seg.points[1], seg.points[2]]
      // Усики: линия от начала к cp1, от cp2 к концу
      ctx.strokeStyle = styles.textMuted
      ctx.lineWidth = 1
      ctx.setLineDash([2, 2])
      ctx.beginPath()
      ctx.moveTo(...toPx(start[0], start[1]))
      ctx.lineTo(...toPx(cp1[0], cp1[1]))
      ctx.moveTo(...toPx(cp2[0], cp2[1]))
      ctx.lineTo(...toPx(end[0], end[1]))
      ctx.stroke()
      ctx.setLineDash([])
      ctx.strokeStyle = styles.surface
      ctx.lineWidth = 2
      // Ручки управления (усики)
      ctx.fillStyle = styles.textSubtle
      for (const cp of [cp1, cp2]) {
        ctx.beginPath()
        ctx.arc(cp[0] * W, cp[1] * H, cpRadiusPx, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      }
    }
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

function emitUpdate() {
  if (segments.value.length >= 1) {
    emit("update:modelValue", cloneSegments(segments.value))
  }
}


function onPointerDown(e: MouseEvent) {
  if (e.button === 0) closeContextMenu()
  if (props.disabled) return
  const coord = getEventPoint(e)
  if (!coord) return
  if (e.button === 0) {
    const guide = hitScaleGuide(coord)
    if (guide) {
      draggingGuide.value = guide
      dragging.value = null
      selectedSegmentIndex.value = null
      return
    }
    const target = hitTest(segments.value, coord)
    if (target && (target.type === "vertex" || target.type === "cp")) {
      dragging.value = target
      selectedSegmentIndex.value = null
    } else if (target?.type === "edge") {
      selectedSegmentIndex.value = target.segmentIndex
    } else {
      selectedSegmentIndex.value = null
    }
  }
}

/** Добавить узел на ребре (только для линейного сегмента: разбить на два) */
function addPointOnEdge(coord: [number, number]) {
  const target = hitTest(segments.value, coord)
  if (!target || target.type !== "edge") return
  const seg = segments.value[target.segmentIndex]!
  if (seg.type !== "line") return
  const [a, b] = [seg.points[0], seg.points[1]]
  const newPoint = projectOnSegment(coord[0], coord[1], a[0], a[1], b[0], b[1])
  const newSegs = [...segments.value]
  const line1: OutlineSegmentLine = { type: "line", points: [[a[0], a[1]], [newPoint[0], newPoint[1]]] }
  const line2: OutlineSegmentLine = { type: "line", points: [[newPoint[0], newPoint[1]], [b[0], b[1]]] }
  newSegs.splice(target.segmentIndex, 1, line1, line2)
  segments.value = newSegs
  emitUpdate()
}

/** Удалить узел (объединить два сегмента в один линейный) */
function removeVertexAt(segmentIndex: number) {
  const segs = segments.value
  if (segs.length <= MIN_SEGMENTS) return
  const next = (segmentIndex + 1) % segs.length
  const segCur = segs[segmentIndex]!
  const segNext = segs[next]!
  const start = segmentStart(segCur)
  const end = segmentEnd(segNext)
  const merged: OutlineSegmentLine = { type: "line", points: [[start[0], start[1]], [end[0], end[1]]] }
  const newSegs: OutlineSegment[] = []
  for (let i = 0; i < segs.length; i++) {
    if (i === next) continue
    if (i === segmentIndex) {
      newSegs.push(merged)
      continue
    }
    newSegs.push(segs[i]!)
  }
  segments.value = newSegs
  emitUpdate()
}

function onDoubleClick(e: MouseEvent) {
  if (props.disabled) return
  const coord = getEventPoint(e)
  if (!coord) return
  const target = hitTest(segments.value, coord)
  if (!target) return
  if (target.type === "vertex") {
    removeVertexAt(target.segmentIndex)
    return
  }
  if (target.type === "edge") {
    addPointOnEdge(coord)
  }
}

const contextMenu = ref<{ x: number; y: number; segmentIndex: number } | null>(null)

function onContextMenu(e: MouseEvent) {
  e.preventDefault()
  if (props.disabled) return
  const coord = getEventPoint(e)
  if (!coord) return
  const target = hitTest(segments.value, coord)
  if (target?.type === "edge") {
    contextMenu.value = { x: e.clientX, y: e.clientY, segmentIndex: target.segmentIndex }
  } else {
    contextMenu.value = null
  }
}

function closeContextMenu() {
  contextMenu.value = null
}

function convertSegmentToBezier(segmentIndex: number) {
  const seg = segments.value[segmentIndex]
  if (seg?.type !== "line") return
  const newSegs = [...segments.value]
  newSegs[segmentIndex] = segmentLineToBezier(seg)
  segments.value = newSegs
  emitUpdate()
  closeContextMenu()
}

function convertSegmentToLine(segmentIndex: number) {
  const seg = segments.value[segmentIndex]
  if (seg?.type !== "bezier") return
  const newSegs = [...segments.value]
  newSegs[segmentIndex] = segmentBezierToLine(seg)
  segments.value = newSegs
  emitUpdate()
  closeContextMenu()
}

function onPointerMove(e: MouseEvent) {
  const coord = getEventPoint(e)
  if (!coord) return

  const guide = draggingGuide.value
  if (guide) {
    const slice = { ...activeSlice() }
    const [x, y] = coord
    if (guide === "left") {
      const max = 1 - slice.right / slice.refWidth - SLICE_MIN_MIDDLE
      const nx = Math.max(0, Math.min(max, x))
      slice.left = Math.round(nx * slice.refWidth)
    } else if (guide === "right") {
      const min = slice.left / slice.refWidth + SLICE_MIN_MIDDLE
      const nx = Math.max(min, Math.min(1, x))
      slice.right = Math.round((1 - nx) * slice.refWidth)
    } else if (guide === "top") {
      const max = 1 - slice.bottom / slice.refHeight - SLICE_MIN_MIDDLE
      const ny = Math.max(0, Math.min(max, y))
      slice.top = Math.round(ny * slice.refHeight)
    } else {
      const min = slice.top / slice.refHeight + SLICE_MIN_MIDDLE
      const ny = Math.max(min, Math.min(1, y))
      slice.bottom = Math.round((1 - ny) * slice.refHeight)
    }
    emitSliceUpdate(slice)
    return
  }

  const d = dragging.value
  if (!d) return
  const snapped = snapCoord(
    segments.value,
    coord,
    d.type === "vertex" ? d.segmentIndex : d.segmentIndex,
    d.type === "cp" ? d.cp : null
  )
  const segs = [...segments.value]
  if (d.type === "vertex") {
    const i = d.segmentIndex
    const next = (i + 1) % segs.length
    const seg = segs[i]!
    const segNext = segs[next]!
    if (seg.type === "line") seg.points[1] = [snapped[0], snapped[1]]
    else seg.points[3] = [snapped[0], snapped[1]]
    segNext.points[0] = [snapped[0], snapped[1]]
    segments.value = segs
  } else {
    const seg = segs[d.segmentIndex]
    if (seg?.type === "bezier") {
      seg.points[d.cp] = [snapped[0], snapped[1]]
      segments.value = segs
    }
  }
  emitUpdate()
}

function onPointerUp() {
  dragging.value = null
  draggingGuide.value = null
}

watch(
  [segments, selectedSegmentIndex, () => props.disabled, zoomFactor, () => props.scaleSlice, () => props.showScaleGuides],
  () => draw(),
  { deep: true }
)

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
      @contextmenu.prevent="onContextMenu"
    >
      <canvas
        ref="canvasRef"
        class="outline-editor__canvas"
      />
    </div>
    <Teleport to="body">
      <div
        v-if="contextMenu"
        class="outline-editor__context-menu"
        :style="{ left: contextMenu.x + 6 + 'px', top: contextMenu.y + 6 + 'px' }"
      >
        <button
          v-if="segments[contextMenu.segmentIndex]?.type === 'line'"
          type="button"
          class="outline-editor__context-item"
          @click="convertSegmentToBezier(contextMenu.segmentIndex)"
        >
          {{ $t('shapes.convertToBezier') }}
        </button>
        <button
          v-else-if="segments[contextMenu.segmentIndex]?.type === 'bezier'"
          type="button"
          class="outline-editor__context-item"
          @click="convertSegmentToLine(contextMenu.segmentIndex)"
        >
          {{ $t('shapes.convertToLine') }}
        </button>
      </div>
    </Teleport>
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

.outline-editor__context-menu {
  position: fixed;
  z-index: 10;
  min-width: 140px;
  padding: 4px 0;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}

.outline-editor__context-item {
  display: block;
  width: 100%;
  padding: 6px 12px;
  font-size: 13px;
  text-align: left;
  color: var(--base-text);
  background: none;
  border: none;
  cursor: pointer;
}

.outline-editor__context-item:hover {
  background: var(--surface-muted);
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
