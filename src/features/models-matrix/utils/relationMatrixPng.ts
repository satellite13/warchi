import type { RelationMatrixResult } from "../types"
import { relationMatrixCellKey } from "./buildRelationMatrix"

const CELL_WIDTH = 140
const CELL_HEIGHT = 36
const HEADER_HEIGHT = 44
const ROW_LABEL_WIDTH = 240
const PADDING = 24

function clamp01(value: number): number {
  if (value <= 0) return 0
  if (value >= 1) return 1
  return value
}

function cellFillColor(total: number, maxTotal: number, heatmapEnabled: boolean): string {
  if (total <= 0) return "#f4f2ef"
  if (!heatmapEnabled || maxTotal <= 0) return "#d7cffd"
  const intensity = clamp01(total / maxTotal)
  const alpha = 0.1 + intensity * 0.5
  return `rgba(124, 92, 252, ${alpha.toFixed(3)})`
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function drawCenteredText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  const clipped = text.length > 22 ? `${text.slice(0, 20)}...` : text
  ctx.save()
  ctx.fillStyle = "#1a1a1a"
  ctx.font = "12px Outfit, sans-serif"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText(clipped, x + width / 2, y + height / 2)
  ctx.restore()
}

export async function exportRelationMatrixPng(params: {
  matrix: RelationMatrixResult
  filenameBase: string
  title: string
  heatmapEnabled: boolean
  axesLabel: string
}): Promise<void> {
  const columnsCount = params.matrix.columns.length
  const rowsCount = params.matrix.rows.length
  const width = PADDING * 2 + ROW_LABEL_WIDTH + columnsCount * CELL_WIDTH
  const height = PADDING * 2 + HEADER_HEIGHT + rowsCount * CELL_HEIGHT + 36

  const canvas = document.createElement("canvas")
  canvas.width = Math.max(width, 640)
  canvas.height = Math.max(height, 240)
  const ctx = canvas.getContext("2d")
  if (!ctx) return

  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.fillStyle = "#1a1a1a"
  ctx.font = "600 15px Outfit, sans-serif"
  ctx.fillText(params.title, PADDING, PADDING - 6 + 16)

  const baseX = PADDING
  const baseY = PADDING + 24

  ctx.fillStyle = "#faf9f7"
  ctx.fillRect(baseX, baseY, ROW_LABEL_WIDTH, HEADER_HEIGHT)
  drawCenteredText(ctx, params.axesLabel, baseX, baseY, ROW_LABEL_WIDTH, HEADER_HEIGHT)

  params.matrix.columns.forEach((column, colIdx) => {
    const x = baseX + ROW_LABEL_WIDTH + colIdx * CELL_WIDTH
    ctx.fillStyle = "#faf9f7"
    ctx.fillRect(x, baseY, CELL_WIDTH, HEADER_HEIGHT)
    drawCenteredText(ctx, column.name, x, baseY, CELL_WIDTH, HEADER_HEIGHT)
  })

  params.matrix.rows.forEach((row, rowIdx) => {
    const y = baseY + HEADER_HEIGHT + rowIdx * CELL_HEIGHT

    ctx.fillStyle = "#faf9f7"
    ctx.fillRect(baseX, y, ROW_LABEL_WIDTH, CELL_HEIGHT)
    drawCenteredText(ctx, row.name, baseX, y, ROW_LABEL_WIDTH, CELL_HEIGHT)

    params.matrix.columns.forEach((column, colIdx) => {
      const x = baseX + ROW_LABEL_WIDTH + colIdx * CELL_WIDTH
      const cell = params.matrix.cells[relationMatrixCellKey(row.id, column.id)]
      const total = cell?.total ?? 0

      ctx.fillStyle = cellFillColor(total, params.matrix.maxCellTotal, params.heatmapEnabled)
      ctx.fillRect(x, y, CELL_WIDTH, CELL_HEIGHT)
      drawCenteredText(ctx, String(total), x, y, CELL_WIDTH, CELL_HEIGHT)
    })
  })

  ctx.strokeStyle = "#d9d4cb"
  ctx.lineWidth = 1
  for (let i = 0; i <= columnsCount; i += 1) {
    const x = baseX + ROW_LABEL_WIDTH + i * CELL_WIDTH
    ctx.beginPath()
    ctx.moveTo(x, baseY)
    ctx.lineTo(x, baseY + HEADER_HEIGHT + rowsCount * CELL_HEIGHT)
    ctx.stroke()
  }
  for (let i = 0; i <= rowsCount; i += 1) {
    const y = baseY + HEADER_HEIGHT + i * CELL_HEIGHT
    ctx.beginPath()
    ctx.moveTo(baseX, y)
    ctx.lineTo(baseX + ROW_LABEL_WIDTH + columnsCount * CELL_WIDTH, y)
    ctx.stroke()
  }
  ctx.strokeRect(baseX, baseY, ROW_LABEL_WIDTH + columnsCount * CELL_WIDTH, HEADER_HEIGHT + rowsCount * CELL_HEIGHT)

  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png", 1))
  if (!blob) return
  triggerDownload(blob, `${params.filenameBase}.png`)
}

