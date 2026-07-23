import { describe, expect, it } from 'vitest'
import {
  parseNodeAttrs,
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
})
