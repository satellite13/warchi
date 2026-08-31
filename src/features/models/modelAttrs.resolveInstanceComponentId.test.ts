import { describe, expect, it } from 'vitest'
import {
  hasEligibleNotationComponent,
  parseNodeAttrs,
  resolveCompatibleNotationComponents,
  resolveInstanceComponentId,
  type DiagramNodeInstance,
} from './modelAttrs'

describe('resolveInstanceComponentId', () => {
  const node = {
    parsedAttrs: parseNodeAttrs(
      JSON.stringify({
        notationComponents: { 'notation-1': { componentId: 'node-default' } },
      }),
    ),
  }

  it('prefers instance notationComponentId over node binding', () => {
    const instance: DiagramNodeInstance = {
      id: 'inst-1',
      modelNodeId: 'node-1',
      x: 0,
      y: 0,
      attrs: { notationComponentId: 'instance-visual' },
    }
    expect(
      resolveInstanceComponentId({
        instance,
        node,
        notationId: 'notation-1',
      }),
    ).toBe('instance-visual')
  })

  it('ignores a stale instance binding that is not in the current notation', () => {
    const instance: DiagramNodeInstance = {
      id: 'inst-1',
      modelNodeId: 'node-1',
      x: 0,
      y: 0,
      attrs: { notationComponentId: 'old-version-component' },
    }
    expect(
      resolveInstanceComponentId({
        instance,
        node,
        notationId: 'notation-1',
        components: [
          { id: 'node-default', notationId: 'notation-1' },
          { id: 'old-version-component', notationId: 'notation-old' },
        ],
      }),
    ).toBe('node-default')
  })

  it('falls back to node notationComponents binding', () => {
    const instance: DiagramNodeInstance = {
      id: 'inst-1',
      modelNodeId: 'node-1',
      x: 0,
      y: 0,
    }
    expect(
      resolveInstanceComponentId({
        instance,
        node,
        notationId: 'notation-1',
      }),
    ).toBe('node-default')
  })

  it('returns null when neither instance nor node has a binding', () => {
    expect(
      resolveInstanceComponentId({
        instance: { id: 'inst-1', modelNodeId: 'node-1', x: 0, y: 0 },
        node: { parsedAttrs: parseNodeAttrs(null) },
        notationId: 'notation-1',
      }),
    ).toBeNull()
  })

  it('allows a node with a matching bound component', () => {
    expect(
      hasEligibleNotationComponent({
        node: {
          nodeTypeId: 'type-1',
          parsedAttrs: parseNodeAttrs(
            JSON.stringify({
              notationComponents: { 'notation-1': { componentId: 'bound-component' } },
            }),
          ),
        },
        notationId: 'notation-1',
        components: [{ id: 'bound-component', notationId: 'notation-1', nodeTypeId: 'type-2' }],
      }),
    ).toBe(true)
  })

  it('rejects a stale binding instead of falling back to a matching node type component', () => {
    expect(
      hasEligibleNotationComponent({
        node: {
          nodeTypeId: 'type-1',
          parsedAttrs: parseNodeAttrs(
            JSON.stringify({
              notationComponents: { 'notation-1': { componentId: 'stale-component' } },
            }),
          ),
        },
        notationId: 'notation-1',
        components: [{ id: 'other-component', notationId: 'notation-1', nodeTypeId: 'type-1' }],
      }),
    ).toBe(false)
  })

  it('returns a valid binding before node type matches and returns no fallback for stale binding', () => {
    const components = [
      { id: 'bound-component', notationId: 'notation-1', nodeTypeId: 'type-2' },
      { id: 'node-type-component', notationId: 'notation-1', nodeTypeId: 'type-1' },
    ]
    const boundNode = {
      nodeTypeId: 'type-1',
      parsedAttrs: parseNodeAttrs(
        JSON.stringify({
          notationComponents: { 'notation-1': { componentId: 'bound-component' } },
        }),
      ),
    }
    const staleNode = {
      nodeTypeId: 'type-1',
      parsedAttrs: parseNodeAttrs(
        JSON.stringify({
          notationComponents: { 'notation-1': { componentId: 'stale-component' } },
        }),
      ),
    }

    expect(
      resolveCompatibleNotationComponents({
        node: boundNode,
        notationId: 'notation-1',
        components,
      }).map(component => component.id),
    ).toEqual(['bound-component'])
    expect(
      resolveCompatibleNotationComponents({
        node: staleNode,
        notationId: 'notation-1',
        components,
      }),
    ).toEqual([])
  })
})
