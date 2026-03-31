import { describe, it, expect } from 'vitest'
import { parseEntityAttrs, serializeEntityAttrs } from './notationAttrs'
import { validateCompositeDiagramStyle } from './utils/validationIssues'

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

  it('validates missing name role and broken A5 target', () => {
    const issues = validateCompositeDiagramStyle(
      {
        nodeShape: 'composite',
        compositeContent: {
          type: 'container',
          children: [{ type: 'shape', id: 'box' }],
        },
        stylePropertyBindings: [
          {
            valueSource: 'component',
            propertyName: 'status',
            branches: [
              {
                when: { op: 'equals', value: 'new' },
                patches: [{ targetId: 'missing-id', patch: { backgroundColor: '#f00' } }],
              },
            ],
          },
        ],
      },
      ((key: string) => key) as any
    )

    expect(issues.some((i) => i.code === 'COMPOSITE_NAME_ROLE_MISSING')).toBe(true)
    expect(issues.some((i) => i.code === 'A5_TARGET_NOT_FOUND')).toBe(true)
  })
})

