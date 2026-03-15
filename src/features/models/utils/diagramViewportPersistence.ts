import type { DiagramRenderer } from '@ngroznykh/papirus'

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

function readStoredDiagramViewports(): Record<string, DiagramViewportState> {
  try {
    const raw = window.localStorage.getItem(DIAGRAM_VIEWPORT_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    const result: Record<string, DiagramViewportState> = {}
    for (const [diagramId, value] of Object.entries(parsed as Record<string, unknown>)) {
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
  } catch {
    return {}
  }
}

function writeStoredDiagramViewports(viewports: Record<string, DiagramViewportState>) {
  try {
    const entries = Object.entries(viewports)
      .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
      .slice(0, MAX_STORED_DIAGRAM_VIEWPORTS)
    window.localStorage.setItem(
      DIAGRAM_VIEWPORT_STORAGE_KEY,
      JSON.stringify(Object.fromEntries(entries))
    )
  } catch {
    // localStorage may be unavailable (private mode/storage limits), ignore silently
  }
}

const MIN_ZOOM = 0.3
const MAX_ZOOM = 2.5

export function persistDiagramViewport(
  diagramId: string,
  currentRenderer: DiagramRenderer
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
  currentRenderer: DiagramRenderer
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
