<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from "vue"
import type { OutlineSegment, OutlineSegmentBezier, OutlineSegmentLine } from "../notations/notationAttrs"
import { DEFAULT_RECTANGLE_OUTLINE } from "../notations/notationAttrs"

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

function cloneSegments(segments: OutlineSegment[]): OutlineSegment[] {
  return segments.map((seg) => {
    if (seg.type === "line") {
      return { type: "line" as const, points: [seg.points[0].slice() as [number, number], seg.points[1].slice() as [number, number]] }
    }
    return {
      type: "bezier" as const,
      points: seg.points.map((p) => p.slice() as [number, number]) as OutlineSegmentBezier["points"]
    }
  })
}

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

type DragTarget =
  | { type: "vertex"; segmentIndex: number }
  | { type: "cp"; segmentIndex: number; cp: 1 | 2 }
const dragging = ref<DragTarget | null>(null)

/** Индекс подсвечиваемого отрезка (клик по ребру) */
const selectedSegmentIndex = ref<number | null>(null)

/** Конечная точка сегмента (она же начальная у следующего) */
function segmentEnd(seg: OutlineSegment): [number, number] {
  if (seg.type === "line") return seg.points[1]
  return seg.points[3]
}

/** Начальная точка сегмента */
function segmentStart(seg: OutlineSegment): [number, number] {
  return seg.points[0]
}

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

const MIN_SEGMENTS = 3
const HIT_CP_RADIUS = 0.04

function emitUpdate() {
  if (segments.value.length >= 1) {
    emit("update:modelValue", cloneSegments(segments.value))
  }
}

/** Точка на кривой Bezier (t 0..1) */
function bezierPoint(
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
  t: number
): [number, number] {
  const u = 1 - t
  const u2 = u * u
  const u3 = u2 * u
  const t2 = t * t
  const t3 = t2 * t
  return [
    u3 * p0[0] + 3 * u2 * t * p1[0] + 3 * u * t2 * p2[0] + t3 * p3[0],
    u3 * p0[1] + 3 * u2 * t * p1[1] + 3 * u * t2 * p2[1] + t3 * p3[1]
  ]
}

/** Расстояние от точки до кривой Bezier (приближение по выборке) */
function distanceToBezier(
  px: number,
  py: number,
  seg: OutlineSegmentBezier
): number {
  const [p0, p1, p2, p3] = seg.points
  const steps = 12
  let best = Infinity
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps
    const t1 = (i + 1) / steps
    const a = bezierPoint(p0, p1, p2, p3, t0)
    const b = bezierPoint(p0, p1, p2, p3, t1)
    const d = distanceToSegment(px, py, a[0], a[1], b[0], b[1])
    if (d < best) best = d
  }
  return best
}

/** Hit test: сначала ручки Bezier (cp1, cp2), затем узлы, затем рёбра */
function hitTest(coord: [number, number]): DragTarget | { type: "edge"; segmentIndex: number } | null {
  const [x, y] = coord
  const segs = segments.value
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i]!
    if (seg.type === "bezier") {
      for (const cpIdx of [1, 2] as const) {
        const cp = seg.points[cpIdx]
        if (Math.hypot(cp[0] - x, cp[1] - y) <= HIT_CP_RADIUS) {
          return { type: "cp", segmentIndex: i, cp: cpIdx }
        }
      }
    }
  }
  for (let i = 0; i < segs.length; i++) {
    const end = segmentEnd(segs[i]!)
    if (Math.hypot(end[0] - x, end[1] - y) <= HIT_RADIUS) {
      return { type: "vertex", segmentIndex: i }
    }
  }
  let bestSeg = -1
  let bestD = EDGE_HIT_RADIUS
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i]!
    if (seg.type === "line") {
      const d = distanceToSegment(x, y, seg.points[0][0], seg.points[0][1], seg.points[1][0], seg.points[1][1])
      if (d < bestD) {
        bestD = d
        bestSeg = i
      }
    } else {
      const d = distanceToBezier(x, y, seg)
      if (d < bestD) {
        bestD = d
        bestSeg = i
      }
    }
  }
  if (bestSeg >= 0) return { type: "edge", segmentIndex: bestSeg }
  return null
}

function onPointerDown(e: MouseEvent) {
  if (e.button === 0) closeContextMenu()
  if (props.disabled) return
  const coord = getEventPoint(e)
  if (!coord) return
  const target = hitTest(coord)
  if (e.button === 0) {
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

/** Добавить узел на ребре (только для линейного сегмента: разбить на два) */
function addPointOnEdge(coord: [number, number]) {
  const target = hitTest(coord)
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

/** Преобразовать линейный сегмент в Bezier (начально прямая) */
function segmentLineToBezier(seg: OutlineSegmentLine): OutlineSegmentBezier {
  const [p0, p3] = [seg.points[0], seg.points[1]]
  const dx = (p3[0] - p0[0]) / 3
  const dy = (p3[1] - p0[1]) / 3
  return {
    type: "bezier",
    points: [
      [p0[0], p0[1]],
      [p0[0] + dx, p0[1] + dy],
      [p3[0] - dx, p3[1] - dy],
      [p3[0], p3[1]]
    ]
  }
}

/** Преобразовать Bezier-сегмент в линию */
function segmentBezierToLine(seg: OutlineSegmentBezier): OutlineSegmentLine {
  return { type: "line", points: [seg.points[0].slice() as [number, number], seg.points[3].slice() as [number, number]] }
}

function onDoubleClick(e: MouseEvent) {
  if (props.disabled) return
  const coord = getEventPoint(e)
  if (!coord) return
  const target = hitTest(coord)
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
  const target = hitTest(coord)
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

/** Позиции вспомогательных осей (четверти + центр) для прилипания */
const GUIDE_AXES = [0.25, 0.5, 0.75]

/** Прилипание к другим точкам и к вспомогательным осям */
function snapCoord(
  coord: [number, number],
  excludeSegmentIndex: number | null,
  excludeCp: 1 | 2 | null
): [number, number] {
  let x = coord[0]
  let y = coord[1]
  const segs = segments.value
  let bestDx = SNAP_THRESHOLD
  let bestDy = SNAP_THRESHOLD
  for (let i = 0; i < segs.length; i++) {
    const end = segmentEnd(segs[i]!)
    const skipVertex = excludeSegmentIndex === i && excludeCp === null
    if (!skipVertex) {
      const dx = Math.abs(coord[0] - end[0])
      const dy = Math.abs(coord[1] - end[1])
      if (dx < bestDx) {
        bestDx = dx
        x = end[0]
      }
      if (dy < bestDy) {
        bestDy = dy
        y = end[1]
      }
    }
    if (segs[i]!.type === "bezier" && (excludeSegmentIndex !== i || excludeCp === null)) {
      for (const cpIdx of [1, 2] as const) {
        if (excludeSegmentIndex === i && excludeCp === cpIdx) continue
        const cp = segs[i]!.type === "bezier" ? segs[i]!.points[cpIdx] : null
        if (cp) {
          const dcx = Math.abs(coord[0] - cp[0])
          const dcy = Math.abs(coord[1] - cp[1])
          if (dcx < bestDx) {
            bestDx = dcx
            x = cp[0]
          }
          if (dcy < bestDy) {
            bestDy = dcy
            y = cp[1]
          }
        }
      }
    }
  }
  for (const g of GUIDE_AXES) {
    if (Math.abs(coord[0] - g) < bestDx) {
      bestDx = Math.abs(coord[0] - g)
      x = g
    }
    if (Math.abs(coord[1] - g) < bestDy) {
      bestDy = Math.abs(coord[1] - g)
      y = g
    }
  }
  return [x, y]
}

function onPointerMove(e: MouseEvent) {
  const d = dragging.value
  if (!d) return
  const coord = getEventPoint(e)
  if (!coord) return
  const snapped = snapCoord(
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
}

watch([segments, selectedSegmentIndex, () => props.disabled, zoomFactor], () => draw(), { deep: true })

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
