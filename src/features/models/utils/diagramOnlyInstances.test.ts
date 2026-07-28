import { describe, expect, it } from 'vitest'
import type { DiagramNodeInstance } from '../modelAttrs'
import {
  applyContainerInlineLabel,
  getContainerLabel,
  isContainerInstance,
} from './diagramOnlyInstances'

function containerInstance(label?: string): DiagramNodeInstance {
  return {
    id: 'c1',
    modelNodeId: '__diagram-container__:c1',
    x: 0,
    y: 0,
    width: 240,
    height: 160,
    attrs: {
      isContainer: true,
      ...(label !== undefined ? { containerLabel: label } : {}),
    },
  }
}

describe('applyContainerInlineLabel', () => {
  it('writes edited canvas text into attrs.containerLabel', () => {
    const instance = containerInstance('')
    expect(applyContainerInlineLabel(instance, 'Group A')).toBe(true)
    expect(getContainerLabel(instance)).toBe('Group A')
  })

  it('returns false when label is unchanged', () => {
    const instance = containerInstance('Same')
    expect(applyContainerInlineLabel(instance, 'Same')).toBe(false)
  })

  it('ignores non-container instances', () => {
    const instance: DiagramNodeInstance = {
      id: 'n1',
      modelNodeId: 'node-1',
      x: 0,
      y: 0,
      attrs: {},
    }
    expect(isContainerInstance(instance)).toBe(false)
    expect(applyContainerInlineLabel(instance, 'Nope')).toBe(false)
    expect(instance.attrs?.containerLabel).toBeUndefined()
  })

  it('allows clearing the label to empty string', () => {
    const instance = containerInstance('Was set')
    expect(applyContainerInlineLabel(instance, '')).toBe(true)
    expect(getContainerLabel(instance)).toBe('')
  })
})
