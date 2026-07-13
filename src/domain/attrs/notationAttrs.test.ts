import { describe, it, expect } from 'vitest'
import { parseEntityAttrs, serializeEntityAttrs } from './notationAttrs'

describe('notationAttrs composite schema', () => {
  it('round-trips compositeContent and stylePropertyBindings', () => {
    const raw = serializeEntityAttrs({
      tags: [],
      customProperties: [],
      diagramStyle: {
        nodeShape: 'composite',
        compositeContent: {
          type: 'container',
          children: [{ type: 'text', id: 'name', bindToProperty: '__name__', text: 'Node' }],
        },
        stylePropertyBindings: [
          {
            valueSource: 'component',
            propertyName: 'status',
            branches: [
              {
                when: { op: 'equals', value: 'new' },
                patches: [{ targetId: '__compositeOuter__', patch: { fillColor: '#ff0' } }],
              },
            ],
          },
        ],
      },
    })

    const parsed = parseEntityAttrs(raw)
    expect(parsed.diagramStyle?.nodeShape).toBe('composite')
    expect(parsed.diagramStyle?.compositeContent?.type).toBe('container')
    expect(parsed.diagramStyle?.stylePropertyBindings?.[0]?.propertyName).toBe('status')
  })

  it('preserves all compositeShapeType variants on parse', () => {
    for (const compositeShapeType of [
      'rectangle',
      'beveled-rectangle',
      'diamond',
      'circle',
      'trapezoid',
      'slanted-rectangle',
      'custom',
    ] as const) {
      const parsed = parseEntityAttrs(
        JSON.stringify({
          tags: [],
          customProperties: [],
          diagramStyle: {
            nodeShape: 'composite',
            compositeShapeType,
            compositeContent: { type: 'container', children: [] },
          },
        })
      )
      expect(parsed.diagramStyle?.compositeShapeType).toBe(compositeShapeType)
    }
  })
})

