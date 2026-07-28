import { describe, it, expect } from 'vitest'
import type { OutlineSegment } from '@/domain/attrs/notationAttrs'
import type { EditorComponent } from '../types'
import {
  collectCustomShapeIds,
  mergeShapePackage,
  remapComponentCustomShapeIds,
  synthesizeShapesFromComponents,
} from './notationShapePackage'

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

const component = (partial: Partial<EditorComponent> & { id: string }): EditorComponent =>
  ({
    name: 'C',
    ownerId: 'o',
    notationId: 'n',
    nodeTypeId: 't',
    version: '1.0.0',
    parsedAttrs: { tags: [], customProperties: [] },
    ...partial,
  }) as EditorComponent

describe('notationShapePackage', () => {
  describe('collectCustomShapeIds', () => {
    it('collects distinct non-empty customShapeIds from non-deleted components', () => {
      const ids = collectCustomShapeIds([
        component({
          id: 'c1',
          parsedAttrs: {
            tags: [],
            customProperties: [],
            diagramStyle: { customShapeId: 's1', customOutline: rectOutline },
          },
        }),
        component({
          id: 'c2',
          parsedAttrs: {
            tags: [],
            customProperties: [],
            diagramStyle: { customShapeId: 's1', customOutline: otherOutline },
          },
        }),
        component({
          id: 'c3',
          _isDeleted: true,
          parsedAttrs: {
            tags: [],
            customProperties: [],
            diagramStyle: { customShapeId: 's2' },
          },
        }),
        component({
          id: 'c4',
          parsedAttrs: {
            tags: [],
            customProperties: [],
            diagramStyle: { customShapeId: '', customOutline: rectOutline },
          },
        }),
      ])
      expect([...ids].sort()).toEqual(['s1'])
    })
  })

  describe('synthesizeShapesFromComponents', () => {
    it('creates shapes for missing ids with outline snapshot', () => {
      const shapes = synthesizeShapesFromComponents(
        [
          component({
            id: 'c1',
            parsedAttrs: {
              tags: [],
              customProperties: [],
              diagramStyle: { customShapeId: 's2', customOutline: otherOutline },
            },
          }),
        ],
        new Set(['s1'])
      )
      expect(shapes).toHaveLength(1)
      expect(shapes[0]).toEqual({
        id: 's2',
        name: 'Imported shape',
        outline: JSON.stringify(otherOutline),
      })
    })

    it('uses outline fingerprint as id when customShapeId is absent', () => {
      const shapes = synthesizeShapesFromComponents(
        [
          component({
            id: 'c1',
            parsedAttrs: {
              tags: [],
              customProperties: [],
              diagramStyle: { customOutline: rectOutline },
            },
          }),
        ],
        new Set()
      )
      expect(shapes).toHaveLength(1)
      expect(shapes[0]?.id).toBe(JSON.stringify(rectOutline))
      expect(shapes[0]?.name).toBe('Imported shape')
      expect(shapes[0]?.outline).toBe(JSON.stringify(rectOutline))
    })

    it('skips components whose id is already covered', () => {
      const shapes = synthesizeShapesFromComponents(
        [
          component({
            id: 'c1',
            parsedAttrs: {
              tags: [],
              customProperties: [],
              diagramStyle: { customShapeId: 's1', customOutline: rectOutline },
            },
          }),
        ],
        new Set(['s1'])
      )
      expect(shapes).toHaveLength(0)
    })

    it('dedupes synthesized shapes by id', () => {
      const shapes = synthesizeShapesFromComponents(
        [
          component({
            id: 'c1',
            parsedAttrs: {
              tags: [],
              customProperties: [],
              diagramStyle: { customShapeId: 's2', customOutline: rectOutline },
            },
          }),
          component({
            id: 'c2',
            parsedAttrs: {
              tags: [],
              customProperties: [],
              diagramStyle: { customShapeId: 's2', customOutline: otherOutline },
            },
          }),
        ],
        new Set()
      )
      expect(shapes).toHaveLength(1)
      expect(shapes[0]?.id).toBe('s2')
    })

    it('ignores components without non-empty customOutline', () => {
      const shapes = synthesizeShapesFromComponents(
        [
          component({
            id: 'c1',
            parsedAttrs: {
              tags: [],
              customProperties: [],
              diagramStyle: { customShapeId: 's1' },
            },
          }),
          component({
            id: 'c2',
            parsedAttrs: {
              tags: [],
              customProperties: [],
              diagramStyle: { customShapeId: 's2', customOutline: [] },
            },
          }),
        ],
        new Set()
      )
      expect(shapes).toHaveLength(0)
    })
  })

  describe('mergeShapePackage', () => {
    it('merges package with outline fallback for missing ids', () => {
      const shapes = mergeShapePackage(
        [{ id: 's1', name: 'Pack', outline: JSON.stringify(rectOutline) }],
        [
          component({
            id: 'c1',
            parsedAttrs: {
              tags: [],
              customProperties: [],
              diagramStyle: { customShapeId: 's1', customOutline: rectOutline },
            },
          }),
          component({
            id: 'c2',
            parsedAttrs: {
              tags: [],
              customProperties: [],
              diagramStyle: { customShapeId: 's2', customOutline: otherOutline },
            },
          }),
        ]
      )
      expect(shapes.map((s) => s.id).sort()).toEqual(['s1', 's2'])
      expect(shapes.find((s) => s.id === 's1')?.name).toBe('Pack')
      expect(shapes.find((s) => s.id === 's2')?.name).toBe('Imported shape')
    })

    it('keeps package entry when id collides with synthesis', () => {
      const shapes = mergeShapePackage(
        [{ id: 's1', name: 'Pack wins', outline: JSON.stringify(rectOutline) }],
        [
          component({
            id: 'c1',
            parsedAttrs: {
              tags: [],
              customProperties: [],
              diagramStyle: { customShapeId: 's1', customOutline: otherOutline },
            },
          }),
        ]
      )
      expect(shapes).toHaveLength(1)
      expect(shapes[0]?.name).toBe('Pack wins')
    })
  })

  describe('remapComponentCustomShapeIds', () => {
    it('remaps customShapeId on non-deleted components', () => {
      const comps = [
        component({
          id: 'c1',
          parsedAttrs: {
            tags: [],
            customProperties: [],
            diagramStyle: { customShapeId: 'old', customOutline: rectOutline },
          },
        }),
      ]
      remapComponentCustomShapeIds(comps, new Map([['old', 'new']]))
      expect(comps[0]?.parsedAttrs.diagramStyle?.customShapeId).toBe('new')
    })

    it('marks existing components dirty when id changes', () => {
      const comps = [
        component({
          id: 'c1',
          parsedAttrs: {
            tags: [],
            customProperties: [],
            diagramStyle: { customShapeId: 'old', customOutline: rectOutline },
          },
        }),
      ]
      remapComponentCustomShapeIds(comps, new Map([['old', 'new']]))
      expect(comps[0]?._isDirty).toBe(true)
    })

    it('does not mark new components dirty when id changes', () => {
      const comps = [
        component({
          id: 'c1',
          _isNew: true,
          parsedAttrs: {
            tags: [],
            customProperties: [],
            diagramStyle: { customShapeId: 'old', customOutline: rectOutline },
          },
        }),
      ]
      remapComponentCustomShapeIds(comps, new Map([['old', 'new']]))
      expect(comps[0]?.parsedAttrs.diagramStyle?.customShapeId).toBe('new')
      expect(comps[0]?._isDirty).toBeUndefined()
    })

    it('leaves unmapped ids unchanged', () => {
      const comps = [
        component({
          id: 'c1',
          parsedAttrs: {
            tags: [],
            customProperties: [],
            diagramStyle: { customShapeId: 'keep', customOutline: rectOutline },
          },
        }),
      ]
      remapComponentCustomShapeIds(comps, new Map([['other', 'new']]))
      expect(comps[0]?.parsedAttrs.diagramStyle?.customShapeId).toBe('keep')
      expect(comps[0]?._isDirty).toBeUndefined()
    })

    it('skips deleted components', () => {
      const comps = [
        component({
          id: 'c1',
          _isDeleted: true,
          parsedAttrs: {
            tags: [],
            customProperties: [],
            diagramStyle: { customShapeId: 'old', customOutline: rectOutline },
          },
        }),
      ]
      remapComponentCustomShapeIds(comps, new Map([['old', 'new']]))
      expect(comps[0]?.parsedAttrs.diagramStyle?.customShapeId).toBe('old')
    })
  })
})
