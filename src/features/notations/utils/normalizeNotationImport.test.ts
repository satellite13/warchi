import { describe, it, expect } from 'vitest'
import type { OutlineSegment } from '@/domain/attrs/notationAttrs'
import { normalizeNotationImport } from './normalizeNotationImport'

const rectOutline: OutlineSegment[] = [
  { type: 'line', points: [[0, 0], [1, 0]] },
  { type: 'line', points: [[1, 0], [1, 1]] },
  { type: 'line', points: [[1, 1], [0, 1]] },
  { type: 'line', points: [[0, 1], [0, 0]] },
]

const otherOutline: OutlineSegment[] = [
  { type: 'line', points: [[0, 0], [0.5, 0.5]] },
  { type: 'line', points: [[0.5, 0.5], [1, 0]] },
]

const t = (key: string) => key

const context = {
  baseOwnerId: 'owner-session',
  baseNotationId: 'notation-session',
  t,
}

describe('normalizeNotationImport', () => {
  it('loads v2 package shapes from top-level raw.shapes', () => {
    const raw = {
      format: 'warchi-notation-export',
      version: 2,
      exportedAt: '2026-07-23T00:00:00.000Z',
      notation: { id: 'file-notation', name: 'File', version: '1.0.0' },
      state: {
        notationId: 'file-notation',
        ownerId: 'file-owner',
        nodeTypes: [{ id: 'nt1', name: 'Node type', parsedAttrs: {} }],
        linkTypes: [{ id: 'lt1', name: 'Link type', parsedAttrs: {} }],
        components: [
          {
            id: 'c1',
            name: 'Component',
            nodeTypeId: 'nt1',
            parsedAttrs: {
              tags: [],
              customProperties: [],
              diagramStyle: { customShapeId: 's1', customOutline: rectOutline },
            },
          },
          {
            id: 'c2',
            name: 'Other',
            nodeTypeId: 'nt1',
            parsedAttrs: {
              tags: [],
              customProperties: [],
              diagramStyle: { customShapeId: 's2', customOutline: otherOutline },
            },
          },
        ],
        relations: [],
        relationRules: [],
        diagramLayer: { version: 1, nodes: [], edges: [] },
      },
      shapes: [
        { id: 's1', name: 'Pack shape', outline: JSON.stringify(rectOutline) },
      ],
    }

    const { state, pendingShapes } = normalizeNotationImport(raw, context)

    expect(state.notationId).toBe('notation-session')
    expect(state.ownerId).toBe('owner-session')
    expect(pendingShapes.map((shape) => shape.id).sort()).toEqual(['s1', 's2'])
    expect(pendingShapes.find((shape) => shape.id === 's1')?.name).toBe('Pack shape')
    expect(pendingShapes.find((shape) => shape.id === 's2')?.name).toBe('Imported shape')
  })

  it('synthesizes pending shapes for v1 bare state with customOutline only', () => {
    const raw = {
      notationId: 'file-notation',
      ownerId: 'file-owner',
      nodeTypes: [{ id: 'nt1', name: 'Node type', parsedAttrs: {} }],
      linkTypes: [{ id: 'lt1', name: 'Link type', parsedAttrs: {} }],
      components: [
        {
          id: 'c1',
          name: 'Component',
          nodeTypeId: 'nt1',
          parsedAttrs: {
            tags: [],
            customProperties: [],
            diagramStyle: { customShapeId: 'legacy-shape', customOutline: rectOutline },
          },
        },
      ],
      relations: [],
      relationRules: [],
      diagramLayer: { version: 1, nodes: [], edges: [] },
    }

    const { state, pendingShapes } = normalizeNotationImport(raw, context)

    expect(state.notationId).toBe('notation-session')
    expect(state.ownerId).toBe('owner-session')
    expect(pendingShapes).toHaveLength(1)
    expect(pendingShapes[0]).toMatchObject({
      id: 'legacy-shape',
      name: 'Imported shape',
      outline: JSON.stringify(rectOutline),
    })
  })

  it('reads shapes from top-level raw.shapes, not raw.state.shapes', () => {
    const raw = {
      format: 'warchi-notation-export',
      version: 2,
      exportedAt: '2026-07-23T00:00:00.000Z',
      notation: { id: 'file-notation', name: 'File', version: '1.0.0' },
      state: {
        notationId: 'file-notation',
        ownerId: 'file-owner',
        nodeTypes: [{ id: 'nt1', name: 'Node type', parsedAttrs: {} }],
        linkTypes: [{ id: 'lt1', name: 'Link type', parsedAttrs: {} }],
        components: [
          {
            id: 'c1',
            name: 'Component',
            nodeTypeId: 'nt1',
            parsedAttrs: {
              tags: [],
              customProperties: [],
              diagramStyle: { customShapeId: 'top-level', customOutline: rectOutline },
            },
          },
        ],
        relations: [],
        relationRules: [],
        diagramLayer: { version: 1, nodes: [], edges: [] },
        shapes: [{ id: 'state-level', name: 'Wrong', outline: JSON.stringify(otherOutline) }],
      },
      shapes: [{ id: 'top-level', name: 'Top level', outline: JSON.stringify(rectOutline) }],
    }

    const { pendingShapes } = normalizeNotationImport(raw, context)

    expect(pendingShapes).toHaveLength(1)
    expect(pendingShapes[0]?.id).toBe('top-level')
    expect(pendingShapes[0]?.name).toBe('Top level')
  })

  it('strips documentFileId from imported shape attrs', () => {
    const raw = {
      format: 'warchi-notation-export',
      version: 2,
      state: {
        nodeTypes: [{ id: 'nt1', name: 'Node type', parsedAttrs: {} }],
        linkTypes: [{ id: 'lt1', name: 'Link type', parsedAttrs: {} }],
        components: [
          {
            id: 'c1',
            name: 'Component',
            nodeTypeId: 'nt1',
            parsedAttrs: {
              tags: [],
              customProperties: [],
              diagramStyle: { customShapeId: 's1', customOutline: rectOutline },
            },
          },
        ],
        relations: [],
        relationRules: [],
        diagramLayer: { version: 1, nodes: [], edges: [] },
      },
      shapes: [
        {
          id: 's1',
          name: 'Shape',
          outline: JSON.stringify(rectOutline),
          attrs: JSON.stringify({ documentFileId: 'doc-1', keep: true }),
        },
      ],
    }

    const { pendingShapes } = normalizeNotationImport(raw, context)

    expect(JSON.parse(pendingShapes[0]!.attrs!)).toEqual({ keep: true })
  })
})
