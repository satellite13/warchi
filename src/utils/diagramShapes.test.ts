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
    it('uses default 12px cut when cutPx omitted', () => {
      const svg = diagramShapeFactories['beveled-rectangle'].svgPath(200, 100)
      expect(svg).toContain('M 12 0')
    })

    it('keeps cut px when width grows', () => {
      const narrow = diagramShapeFactories['beveled-rectangle'].svgPath(120, 80, 14)
      const wide = diagramShapeFactories['beveled-rectangle'].svgPath(300, 80, 14)
      expect(narrow).toContain('M 14 0')
      expect(wide).toContain('M 14 0')
    })

    it('clamps cut to half min dimension', () => {
      const svg = diagramShapeFactories['beveled-rectangle'].svgPath(20, 20, 50)
      expect(svg).toContain('M 10 0')
    })
  })

  describe('trapezoid', () => {
    it('uses fixed 24px top inset', () => {
      const svg = diagramShapeFactories['trapezoid'].svgPath(200, 100)
      expect(svg).toContain('M 24 0')
    })

    it('keeps inset when width grows', () => {
      const narrow = diagramShapeFactories['trapezoid'].svgPath(120, 80)
      const wide = diagramShapeFactories['trapezoid'].svgPath(300, 80)
      expect(narrow).toContain('M 24 0')
      expect(wide).toContain('M 24 0')
    })

    it('clamps inset on tiny width', () => {
      const svg = diagramShapeFactories['trapezoid'].svgPath(30, 40)
      expect(svg).toContain('M 15 0')
    })
  })

  describe('slanted-rectangle', () => {
    it('uses fixed 24px skew', () => {
      const svg = diagramShapeFactories['slanted-rectangle'].svgPath(200, 100)
      expect(svg).toContain('M 24 0')
      expect(svg).toContain('L 176 100') // 200 - 24
    })

    it('keeps skew when width grows', () => {
      const narrow = diagramShapeFactories['slanted-rectangle'].svgPath(120, 80)
      const wide = diagramShapeFactories['slanted-rectangle'].svgPath(300, 80)
      expect(narrow).toContain('M 24 0')
      expect(wide).toContain('M 24 0')
      expect(wide).toContain('L 276 80')
    })
  })

  describe('sticky-note', () => {
    it('uses fixed 16px cut on large note', () => {
      const svg = diagramShapeFactories['sticky-note'].svgPath(200, 100)
      expect(svg).toContain('L 184 0') // 200 - 16
    })

    it('clamps cut on tiny note', () => {
      const svg = diagramShapeFactories['sticky-note'].svgPath(20, 20)
      expect(svg).toContain('L 10 0') // min(16, 10)
    })
  })
})
