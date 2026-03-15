import { describe, expect, it, beforeAll } from 'vitest'
import { diagramShapeFactories, type DiagramShapeId } from '@/utils/diagramShapes'

class Path2DPolyfill {
  moveTo(_x: number, _y: number) {}
  lineTo(_x: number, _y: number) {}
  bezierCurveTo(_x1: number, _y1: number, _x2: number, _y2: number, _x3: number, _y3: number) {}
  closePath() {}
}

beforeAll(() => {
  globalThis.Path2D = Path2DPolyfill as unknown as typeof Path2D
})

const shapeIds: DiagramShapeId[] = [
  'beveled-rectangle',
  'trapezoid',
  'slanted-rectangle',
  'sticky-note',
]

describe('diagramShapeFactories', () => {
  it('has all expected shape ids', () => {
    for (const id of shapeIds) {
      expect(diagramShapeFactories[id]).toBeDefined()
    }
  })

  describe.each(shapeIds)('%s', (shapeId) => {
    it('path returns a Path2D', () => {
      const factory = diagramShapeFactories[shapeId]
      const path = factory.path(200, 100)
      expect(path).toBeInstanceOf(Path2D)
    })

    it('svgPath returns a non-empty string', () => {
      const factory = diagramShapeFactories[shapeId]
      const svg = factory.svgPath(200, 100)
      expect(typeof svg).toBe('string')
      expect(svg.length).toBeGreaterThan(0)
    })

    it('svgPath starts with M and ends with Z', () => {
      const factory = diagramShapeFactories[shapeId]
      const svg = factory.svgPath(200, 100)
      expect(svg).toMatch(/^M /)
      expect(svg).toMatch(/ Z$/)
    })
  })

  describe('beveled-rectangle', () => {
    it('uses 16% cut from min dimension', () => {
      const svg = diagramShapeFactories['beveled-rectangle'].svgPath(200, 100)
      const cut = 100 * 0.16
      expect(svg).toContain(`M ${cut} 0`)
    })
  })

  describe('trapezoid', () => {
    it('uses 18% top inset from width', () => {
      const svg = diagramShapeFactories['trapezoid'].svgPath(200, 100)
      const inset = 200 * 0.18
      expect(svg).toContain(`M ${inset} 0`)
    })
  })

  describe('sticky-note', () => {
    it('cut is at least 10', () => {
      const svg = diagramShapeFactories['sticky-note'].svgPath(20, 20)
      // min(20,20)*0.2 = 4, max(10, 4) = 10
      const cut = 10
      expect(svg).toContain(`L ${20 - cut} 0`)
    })

    it('cut scales with dimension for larger shapes', () => {
      const svg = diagramShapeFactories['sticky-note'].svgPath(200, 100)
      const cut = Math.min(200, 100) * 0.2
      expect(svg).toContain(`L ${200 - cut} 0`)
    })
  })
})
