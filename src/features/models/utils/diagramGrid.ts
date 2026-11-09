/**
 * Один шаг для нарисованной сетки и для привязки.
 * Фигура садится левым верхним углом. Если шаги разные,
 * угол оказывается между линиями и контур с сеткой не совпадает.
 */
export const MODEL_DIAGRAM_GRID_SIZE = 20
export const MODEL_DIAGRAM_GRID_COLOR = '#e2e8f0'

export function modelDiagramGridOptions(): {
  overlayGridSize: number
  snapGridSize: number
  color: string
} {
  return {
    overlayGridSize: MODEL_DIAGRAM_GRID_SIZE,
    snapGridSize: MODEL_DIAGRAM_GRID_SIZE,
    color: MODEL_DIAGRAM_GRID_COLOR,
  }
}

export function snapDiagramCoord(value: number, gridSize = MODEL_DIAGRAM_GRID_SIZE): number {
  return Math.round(value / gridSize) * gridSize
}

export function snapDiagramTopLeft(
  point: { x: number; y: number },
  gridSize = MODEL_DIAGRAM_GRID_SIZE
): { x: number; y: number } {
  return {
    x: snapDiagramCoord(point.x, gridSize),
    y: snapDiagramCoord(point.y, gridSize),
  }
}
