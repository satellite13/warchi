import { describe, expect, it, beforeAll } from 'vitest'
import { customOutlineToSvgPath, customOutlineToPath2D } from '@/utils/customOutlinePath'
import type { OutlineSegment } from '@/types/shapes'

class Path2DPolyfill {
  moveTo(_x: number, _y: number) {}
  lineTo(_x: number, _y: number) {}
  bezierCurveTo(_x1: number, _y1: number, _x2: number, _y2: number, _x3: number, _y3: number) {}
  closePath() {}
}

beforeAll(() => {
  globalThis.Path2D = Path2DPolyfill as unknown as typeof Path2D
})

describe('customOutlineToSvgPath', () => {
  it('returns empty string for empty segments', () => {
    expect(customOutlineToSvgPath([], 100, 100)).toBe('')
  })

  it('generates SVG path for normalized line segments (0-1)', () => {
    const segments: OutlineSegment[] = [
      { type: 'line', points: [[0, 0], [1, 0]] },
      { type: 'line', points: [[1, 0], [1, 1]] },
      { type: 'line', points: [[1, 1], [0, 1]] },
      { type: 'line', points: [[0, 1], [0, 0]] },
    ]
    const path = customOutlineToSvgPath(segments, 200, 100)
    expect(path).toContain('M 0 0')
    expect(path).toContain('L 200 0')
    expect(path).toContain('L 200 100')
    expect(path).toContain('L 0 100')
    expect(path).toContain('Z')
  })

  it('generates SVG path for design-space segments (0-180, 0-80)', () => {
    const segments: OutlineSegment[] = [
      { type: 'line', points: [[0, 0], [180, 0]] },
      { type: 'line', points: [[180, 0], [180, 80]] },
      { type: 'line', points: [[180, 80], [0, 80]] },
      { type: 'line', points: [[0, 80], [0, 0]] },
    ]
    const path = customOutlineToSvgPath(segments, 200, 100)
    expect(path).toContain('M 0 0')
    expect(path).toContain('L 200 0')
    expect(path).toContain('L 200 100')
    expect(path).toContain('Z')
  })

  it('handles bezier segments', () => {
    const segments: OutlineSegment[] = [
      {
        type: 'bezier',
        points: [[0, 0], [0.25, 0], [0.75, 0], [1, 0]],
      },
      { type: 'line', points: [[1, 0], [1, 1]] },
      { type: 'line', points: [[1, 1], [0, 1]] },
      { type: 'line', points: [[0, 1], [0, 0]] },
    ]
    const path = customOutlineToSvgPath(segments, 100, 50)
    expect(path).toContain('C ')
    expect(path).toContain('Z')
  })

  it('uses width/height minimum of 1', () => {
    const segments: OutlineSegment[] = [
      { type: 'line', points: [[0, 0], [1, 0]] },
      { type: 'line', points: [[1, 0], [1, 1]] },
    ]
    const path = customOutlineToSvgPath(segments, 0, 0)
    // Should not produce NaN or Infinity
    expect(path).not.toContain('NaN')
    expect(path).not.toContain('Infinity')
  })
})

describe('customOutlineToPath2D', () => {
  it('returns Path2D for empty segments', () => {
    const path = customOutlineToPath2D([], 100, 100)
    expect(path).toBeInstanceOf(Path2D)
  })

  it('returns Path2D for line segments', () => {
    const segments: OutlineSegment[] = [
      { type: 'line', points: [[0, 0], [1, 0]] },
      { type: 'line', points: [[1, 0], [1, 1]] },
      { type: 'line', points: [[1, 1], [0, 1]] },
      { type: 'line', points: [[0, 1], [0, 0]] },
    ]
    const path = customOutlineToPath2D(segments, 200, 100)
    expect(path).toBeInstanceOf(Path2D)
  })

  it('returns Path2D for bezier segments', () => {
    const segments: OutlineSegment[] = [
      {
        type: 'bezier',
        points: [[0, 0], [0.25, 0.1], [0.75, 0.1], [1, 0]],
      },
      { type: 'line', points: [[1, 0], [1, 1]] },
      { type: 'line', points: [[1, 1], [0, 1]] },
      { type: 'line', points: [[0, 1], [0, 0]] },
    ]
    const path = customOutlineToPath2D(segments, 100, 50)
    expect(path).toBeInstanceOf(Path2D)
  })

  it('returns Path2D for design-space segments', () => {
    const segments: OutlineSegment[] = [
      { type: 'line', points: [[0, 0], [180, 0]] },
      { type: 'line', points: [[180, 0], [180, 80]] },
    ]
    const path = customOutlineToPath2D(segments, 200, 100)
    expect(path).toBeInstanceOf(Path2D)
  })
})
