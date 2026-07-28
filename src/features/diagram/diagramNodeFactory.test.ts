import { beforeAll, describe, expect, it } from 'vitest'
import {
  CircleNode,
  CustomShapeNode,
  DiamondNode,
  RectangleNode,
} from '@ngroznykh/papirus'
import {
  createDiagramNode,
  getDiagramNodeShape,
  resolveDiagramNodeShape,
} from './diagramNodeFactory'
import type { DiagramStyle } from '@/domain/attrs/notationAttrs'

class Path2DPolyfill {
  moveTo(_x: number, _y: number) {}
  lineTo(_x: number, _y: number) {}
  closePath() {}
}

beforeAll(() => {
  globalThis.Path2D = Path2DPolyfill as unknown as typeof Path2D
})

const baseNodeOptions = {
  id: 'node-1',
  x: 10,
  y: 20,
  width: 120,
  height: 80,
  style: { fillColor: '#fff', strokeColor: '#111', strokeWidth: 1 },
  anchorPoints: { top: 3, right: 1, bottom: 3, left: 1 },
}

describe('diagramNodeFactory', () => {
  it('falls back to rectangle for unknown node shapes', () => {
    expect(resolveDiagramNodeShape({ nodeShape: 'unknown' } as unknown as DiagramStyle)).toBe(
      'rectangle'
    )
  })

  it.each([
    'rectangle',
    'beveled-rectangle',
    'diamond',
    'circle',
    'trapezoid',
    'slanted-rectangle',
    'custom',
    'composite',
  ] as const)('resolves %s node shape', (nodeShape) => {
    expect(resolveDiagramNodeShape({ nodeShape } as DiagramStyle)).toBe(nodeShape)
  })

  it('creates rectangle nodes with shared base options', () => {
    const node = createDiagramNode({
      ...baseNodeOptions,
      diagramStyle: {},
      label: 'Node',
      cornerRadius: 12,
    })

    expect(node).toBeInstanceOf(RectangleNode)
    expect(node.id).toBe('node-1')
    expect(node.x).toBe(10)
    expect(node.y).toBe(20)
    expect(node.anchorPoints).toEqual(baseNodeOptions.anchorPoints)
    expect((node as RectangleNode).cornerRadius).toBe(12)
    expect(getDiagramNodeShape(node)).toBe('rectangle')
  })

  it('creates built-in shape variants as the expected node classes', () => {
    expect(
      createDiagramNode({ ...baseNodeOptions, diagramStyle: { nodeShape: 'diamond' } })
    ).toBeInstanceOf(DiamondNode)
    expect(
      createDiagramNode({ ...baseNodeOptions, diagramStyle: { nodeShape: 'circle' } })
    ).toBeInstanceOf(CircleNode)

    const custom = createDiagramNode({
      ...baseNodeOptions,
      diagramStyle: { nodeShape: 'beveled-rectangle' },
    })
    expect(custom).toBeInstanceOf(CustomShapeNode)
    expect(getDiagramNodeShape(custom)).toBe('beveled-rectangle')

    const beveledWithCut = createDiagramNode({
      ...baseNodeOptions,
      diagramStyle: { nodeShape: 'beveled-rectangle', cornerCut: 14 },
    })
    expect(beveledWithCut).toBeInstanceOf(CustomShapeNode)
    expect(getDiagramNodeShape(beveledWithCut)).toBe('beveled-rectangle')
  })

  it('uses a special rectangle outline for note and folder variants', () => {
    const note = createDiagramNode({
      ...baseNodeOptions,
      diagramStyle: {},
      specialRectangleShape: 'sticky-note',
    })
    const folder = createDiagramNode({
      ...baseNodeOptions,
      diagramStyle: {},
      specialRectangleShape: 'folder-tab',
    })

    expect(note).toBeInstanceOf(CustomShapeNode)
    expect(folder).toBeInstanceOf(CustomShapeNode)
    expect(getDiagramNodeShape(note)).toBe('rectangle')
    expect(note).toMatchObject({ noteShape: true })
    expect(folder).toMatchObject({ folderShape: true })
  })
})
