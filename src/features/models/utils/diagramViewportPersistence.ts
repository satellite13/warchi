import type { DiagramRenderer } from '@ngroznykh/papirus'
import { loadJson, saveJson } from '@/utils/localStorage'

const DIAGRAM_VIEWPORT_STORAGE_KEY = 'warchi:model-diagram-viewport:v1'
const MAX_STORED_DIAGRAM_VIEWPORTS = 200

type DiagramViewportState = {
  zoom: number
  offsetX: number
  offsetY: number
  updatedAt: number
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const MIN_ZOOM = 0.3
const MAX_ZOOM = 2.5

function readStoredDiagramViewports(): Record<string, DiagramViewportState> {
  const parsed = loadJson<Record<string, unknown>>(DIAGRAM_VIEWPORT_STORAGE_KEY)
  if (!parsed) return {}
  const result: Record<string, DiagramViewportState> = {}
  for (const [diagramId, value] of Object.entries(parsed)) {
    if (!value || typeof value !== 'object') continue
    const candidate = value as Partial<DiagramViewportState>
    if (
      !isFiniteNumber(candidate.zoom) ||
      !isFiniteNumber(candidate.offsetX) ||
      !isFiniteNumber(candidate.offsetY)
    ) {
      continue
    }
    result[diagramId] = {
      zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, candidate.zoom)),
      offsetX: candidate.offsetX,
      offsetY: candidate.offsetY,
      updatedAt: isFiniteNumber(candidate.updatedAt) ? candidate.updatedAt : 0,
    }
  }
  return result
}

function writeStoredDiagramViewports(viewports: Record<string, DiagramViewportState>) {
  const entries = Object.entries(viewports)
    .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
    .slice(0, MAX_STORED_DIAGRAM_VIEWPORTS)
  saveJson(DIAGRAM_VIEWPORT_STORAGE_KEY, Object.fromEntries(entries))
}

export function persistDiagramViewport(
  diagramId: string,
  currentRenderer: DiagramRenderer,
): void {
  const viewports = readStoredDiagramViewports()
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, currentRenderer.zoom))
  viewports[diagramId] = {
    zoom,
    offsetX: currentRenderer.offsetX,
    offsetY: currentRenderer.offsetY,
    updatedAt: Date.now(),
  }
  writeStoredDiagramViewports(viewports)
}

export function restoreDiagramViewport(
  diagramId: string,
  currentRenderer: DiagramRenderer,
): boolean {
  const viewports = readStoredDiagramViewports()
  const saved = viewports[diagramId]
  if (!saved) return false
  currentRenderer.viewport = {
    zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, saved.zoom)),
    offsetX: saved.offsetX,
    offsetY: saved.offsetY,
  }
  currentRenderer.markDirty()
  return true
}
