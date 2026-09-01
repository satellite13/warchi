import { describe, expect, it } from 'vitest'
import type { DiagramNodeInstance } from '../modelAttrs'
import {
  applyContainerInlineLabel,
  getContainerLabel,
  getNoteText,
  isContainerInstance,
  isDiagramOnlyVisualInstance,
  isDirectoryNoteInstance,
  isNoteInstance,
  isStickyNoteInstance,
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

describe('note instance predicates', () => {
  it('detects notes, directory notes, sticky notes, and diagram-only visuals', () => {
    const note: DiagramNodeInstance = {
      id: 'n1',
      modelNodeId: '__diagram-note__:n1',
      x: 0,
      y: 0,
      attrs: { isNote: true, noteText: 'Hello' },
    }
    const directory: DiagramNodeInstance = {
      id: 'd1',
      modelNodeId: '__diagram-note__:d1',
      x: 0,
      y: 0,
      attrs: { isNote: true, isDirectoryNote: true },
    }
    const plain: DiagramNodeInstance = {
      id: 'p1',
      modelNodeId: 'node-1',
      x: 0,
      y: 0,
      attrs: {},
    }

    expect(isNoteInstance(note)).toBe(true)
    expect(isDirectoryNoteInstance(note)).toBe(false)
    expect(isStickyNoteInstance(note)).toBe(true)
    expect(getNoteText(note)).toBe('Hello')
    expect(getNoteText(note, 'fallback')).toBe('Hello')
    expect(getNoteText({ ...note, attrs: { isNote: true } }, 'fb')).toBe('fb')

    expect(isDirectoryNoteInstance(directory)).toBe(true)
    expect(isStickyNoteInstance(directory)).toBe(false)
    expect(isDiagramOnlyVisualInstance(note)).toBe(true)
    expect(isDiagramOnlyVisualInstance(containerInstance())).toBe(true)
    expect(isDiagramOnlyVisualInstance(plain)).toBe(false)
  })
})
