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

  it('round-trips cornerCut on diagramStyle', () => {
    const parsed = parseEntityAttrs(
      serializeEntityAttrs({
        tags: [],
        customProperties: [],
        diagramStyle: { nodeShape: 'beveled-rectangle', cornerCut: 12 },
      })
    )
    expect(parsed.diagramStyle?.cornerCut).toBe(12)
  })

  it('round-trips contentInsetScale keeping only true sides', () => {
    const parsed = parseEntityAttrs(
      serializeEntityAttrs({
        tags: [],
        customProperties: [],
        diagramStyle: {
          contentInset: { top: 48, left: 8, right: 8, bottom: 8 },
          contentInsetScale: { top: true, left: true, right: false, bottom: false },
        },
      })
    )
    expect(parsed.diagramStyle?.contentInsetScale).toEqual({ top: true, left: true })

    const empty = parseEntityAttrs(
      serializeEntityAttrs({
        tags: [],
        customProperties: [],
        diagramStyle: {
          contentInset: 0,
          contentInsetScale: { top: false, left: false },
        },
      })
    )
    expect(empty.diagramStyle?.contentInsetScale).toBeUndefined()
  })

  it('round-trips showLabel boolean on diagramStyle', () => {
    const withFalse = parseEntityAttrs(
      serializeEntityAttrs({
        tags: [],
        customProperties: [],
        diagramStyle: { showLabel: false, fillColor: '#fff' },
      })
    )
    expect(withFalse.diagramStyle?.showLabel).toBe(false)

    const withTrue = parseEntityAttrs(
      serializeEntityAttrs({
        tags: [],
        customProperties: [],
        diagramStyle: { showLabel: true },
      })
    )
    expect(withTrue.diagramStyle?.showLabel).toBe(true)

    const absent = parseEntityAttrs(
      JSON.stringify({
        tags: [],
        customProperties: [],
        diagramStyle: { fillColor: '#fff' },
      })
    )
    expect(absent.diagramStyle?.showLabel).toBeUndefined()
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

