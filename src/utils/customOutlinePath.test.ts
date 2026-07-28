import { describe, expect, it, beforeAll } from 'vitest'
import {
  customOutlineToSvgPath,
  customOutlineToPath2D,
  mapSliceAxis,
} from '@/utils/customOutlinePath'
import type { OutlineSegment, ScaleSlice } from '@/types/shapes'

class Path2DPolyfill {
  moveTo(_x: number, _y: number) {}
  lineTo(_x: number, _y: number) {}
  bezierCurveTo(_x1: number, _y1: number, _x2: number, _y2: number, _x3: number, _y3: number) {}
  closePath() {}
}

beforeAll(() => {
  globalThis.Path2D = Path2DPolyfill as unknown as typeof Path2D
})

const rectSegments: OutlineSegment[] = [
  { type: 'line', points: [[0, 0], [1, 0]] },
  { type: 'line', points: [[1, 0], [1, 1]] },
  { type: 'line', points: [[1, 1], [0, 1]] },
  { type: 'line', points: [[0, 1], [0, 0]] },
]

/** Chamfered top-right corner: cut at (0.8,0)-(1,0.2) */
const chamferSegments: OutlineSegment[] = [
  { type: 'line', points: [[0, 0], [0.8, 0]] },
  { type: 'line', points: [[0.8, 0], [1, 0.2]] },
  { type: 'line', points: [[1, 0.2], [1, 1]] },
  { type: 'line', points: [[1, 1], [0, 1]] },
  { type: 'line', points: [[0, 1], [0, 0]] },
]

describe('customOutlineToSvgPath', () => {
  it('returns empty string for empty segments', () => {
    expect(customOutlineToSvgPath([], 100, 100)).toBe('')
  })

  it('generates SVG path for normalized line segments (0-1)', () => {
    const path = customOutlineToSvgPath(rectSegments, 200, 100)
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
    expect(path).not.toContain('NaN')
    expect(path).not.toContain('Infinity')
  })
})

describe('mapSliceAxis', () => {
  it('keeps edges fixed and stretches the middle', () => {
    expect(mapSliceAxis(0, 200, 20, 20, 100)).toBeCloseTo(0)
    expect(mapSliceAxis(0.2, 200, 20, 20, 100)).toBeCloseTo(20)
    expect(mapSliceAxis(0.5, 200, 20, 20, 100)).toBeCloseTo(100)
    expect(mapSliceAxis(0.8, 200, 20, 20, 100)).toBeCloseTo(180)
    expect(mapSliceAxis(1, 200, 20, 20, 100)).toBeCloseTo(200)
  })

  it('shrinks insets when size is smaller than sum of insets', () => {
    expect(mapSliceAxis(0, 20, 20, 20, 100)).toBeCloseTo(0)
    expect(mapSliceAxis(0.2, 20, 20, 20, 100)).toBeCloseTo(10)
    expect(mapSliceAxis(1, 20, 20, 20, 100)).toBeCloseTo(20)
  })
})

describe('customOutlineToSvgPath with scaleSlice', () => {
  const slice: ScaleSlice = {
    left: 0,
    right: 36,
    top: 24,
    bottom: 0,
    refWidth: 180,
    refHeight: 120,
  }

  it('keeps chamfer corner size when width grows', () => {
    const narrow = customOutlineToSvgPath(chamferSegments, 180, 120, slice)
    const wide = customOutlineToSvgPath(chamferSegments, 360, 120, slice)
    expect(narrow).toContain('L 144 0')
    expect(wide).toContain('L 324 0')
    expect(narrow).toContain('L 180 24')
    expect(wide).toContain('L 360 24')
  })

  it('falls back to uniform stretch without effective slice', () => {
    const path = customOutlineToSvgPath(chamferSegments, 200, 100, {
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      refWidth: 180,
      refHeight: 120,
    })
    expect(path).toContain('L 160 0')
    expect(path).toContain('L 200 20')
  })

  it('maps bezier control points through slice', () => {
    const segments: OutlineSegment[] = [
      {
        type: 'bezier',
        points: [
          [0.8, 0],
          [0.9, 0],
          [1, 0.1],
          [1, 0.2],
        ],
      },
      { type: 'line', points: [[1, 0.2], [1, 1]] },
      { type: 'line', points: [[1, 1], [0, 1]] },
      { type: 'line', points: [[0, 1], [0, 0]] },
      { type: 'line', points: [[0, 0], [0.8, 0]] },
    ]
    const path = customOutlineToSvgPath(segments, 360, 120, slice)
    expect(path).toContain('C ')
    expect(path).not.toContain('NaN')
  })
})

describe('customOutlineToPath2D', () => {
  it('returns Path2D for empty segments', () => {
    const path = customOutlineToPath2D([], 100, 100)
    expect(path).toBeInstanceOf(Path2D)
  })

  it('returns Path2D for line segments', () => {
    const path = customOutlineToPath2D(rectSegments, 200, 100)
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

  it('returns Path2D with scaleSlice', () => {
    const path = customOutlineToPath2D(chamferSegments, 360, 120, {
      left: 0,
      right: 36,
      top: 24,
      bottom: 0,
      refWidth: 180,
      refHeight: 120,
    })
    expect(path).toBeInstanceOf(Path2D)
  })
})
