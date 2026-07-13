import { describe, it, expect } from 'vitest'
import { applyStylePropertyBindings, injectCompositeNameAndIcon, BIND_TO_NAME } from '@/features/diagram-style/utils/compositeBindings'
import type { CompositeSerializedCComponent, DiagramStyle } from '@/domain/attrs/notationAttrs'

describe('compositeBindings', () => {
  it('applies first matched branch patch to target id', () => {
    const content: CompositeSerializedCComponent = {
      type: 'container',
      children: [
        { type: 'shape', id: 'statusShape', backgroundColor: '#fff' },
        { type: 'text', id: 'nameText', text: 'Old' },
      ],
    }
    const style = {
      nodeShape: 'composite',
      stylePropertyBindings: [
        {
          valueSource: 'component',
          propertyName: 'status',
          branches: [
            {
              when: { op: 'equals', value: 'new' },
              patches: [{ targetId: 'statusShape', patch: { backgroundColor: '#ff0' } }],
            },
          ],
        },
      ],
    } satisfies DiagramStyle

    const result = applyStylePropertyBindings(style, content, {
      componentProperties: [{ id: 'p1', name: 'status', type: 'enum', required: false, min: null, max: null }],
      componentValues: { status: 'new' },
      nodeTypeProperties: [],
      nodeTypeValues: {},
    })

    expect(result.content.children?.[0]?.backgroundColor).toBe('#ff0')
  })

  it('treats missing boolean as false in matching', () => {
    const content: CompositeSerializedCComponent = {
      type: 'container',
      children: [{ type: 'shape', id: 'flagShape', backgroundColor: '#fff' }],
    }
    const style = {
      nodeShape: 'composite',
      stylePropertyBindings: [
        {
          valueSource: 'component',
          propertyName: 'flag',
          branches: [
            {
              when: { op: 'is', value: false },
              patches: [{ targetId: 'flagShape', patch: { backgroundColor: '#0f0' } }],
            },
          ],
        },
      ],
    } satisfies DiagramStyle

    const result = applyStylePropertyBindings(style, content, {
      componentProperties: [{ id: 'p1', name: 'flag', type: 'boolean', required: false, min: null, max: null }],
      componentValues: {},
      nodeTypeProperties: [],
      nodeTypeValues: {},
    })

    expect(result.content.children?.[0]?.backgroundColor).toBe('#0f0')
  })

  it('injects name and icon bindings', () => {
    const content: CompositeSerializedCComponent = {
      type: 'container',
      children: [
        { type: 'text', id: 'name', bindToProperty: BIND_TO_NAME, text: 'Old Name' },
        { type: 'icon', id: 'mainIcon', source: '/icons/old.svg', bindsNotationIcon: true },
      ],
    }
    const patched = injectCompositeNameAndIcon(content, {
      displayName: 'Service A',
      notationIconName: 'component',
    })

    expect(patched.children?.[0]?.text).toBe('Service A')
    expect(patched.children?.[1]?.source).toBe('/icons/component.svg')
  })

})

