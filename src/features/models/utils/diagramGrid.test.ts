import { describe, expect, it } from 'vitest'
import {
  MODEL_DIAGRAM_GRID_SIZE,
  modelDiagramGridOptions,
  snapDiagramTopLeft,
} from './diagramGrid'

describe('model diagram grid', () => {
  it('draws grid lines on the same step the top-left corner snaps to', () => {
    const options = modelDiagramGridOptions()
    expect(options.overlayGridSize).toBe(MODEL_DIAGRAM_GRID_SIZE)
    expect(options.snapGridSize).toBe(MODEL_DIAGRAM_GRID_SIZE)
    expect(options.overlayGridSize).toBe(options.snapGridSize)
  })

  it('puts the top-left corner on a grid line when the size is not a multiple of the step', () => {
    const width = 150
    const height = 56
    const snapped = snapDiagramTopLeft({ x: 33, y: 47 })

    expect(snapped.x % MODEL_DIAGRAM_GRID_SIZE).toBe(0)
    expect(snapped.y % MODEL_DIAGRAM_GRID_SIZE).toBe(0)

    const center = { x: 33 + width / 2, y: 47 + height / 2 }
    const snappedCenter = snapDiagramTopLeft(center)
    const topLeftIfCenterWereSnapped = {
      x: snappedCenter.x - width / 2,
      y: snappedCenter.y - height / 2,
    }
    expect(topLeftIfCenterWereSnapped.x % MODEL_DIAGRAM_GRID_SIZE).not.toBe(0)
    expect(topLeftIfCenterWereSnapped.y % MODEL_DIAGRAM_GRID_SIZE).not.toBe(0)
  })
})
