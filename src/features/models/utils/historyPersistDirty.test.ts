import { describe, expect, it } from 'vitest'

import { applyHistoryPersistDirty } from './historyPersistDirty'

describe('applyHistoryPersistDirty', () => {
  it('clears dirty on undo when the undone command was the first local change', () => {
    const stack: boolean[] = []

    expect(applyHistoryPersistDirty(stack, 'execute', false)).toEqual({ dirty: true })
    expect(stack).toEqual([false])

    expect(applyHistoryPersistDirty(stack, 'undo', true)).toEqual({ dirty: false })
    expect(stack).toEqual([])
  })

  it('keeps dirty on undo when the diagram was already dirty', () => {
    const stack: boolean[] = []

    expect(applyHistoryPersistDirty(stack, 'execute', true)).toEqual({ dirty: true })
    expect(applyHistoryPersistDirty(stack, 'undo', true)).toEqual({ dirty: true })
  })

  it('undoes two commands back to a clean diagram', () => {
    const stack: boolean[] = []

    applyHistoryPersistDirty(stack, 'execute', false)
    applyHistoryPersistDirty(stack, 'execute', true)

    expect(applyHistoryPersistDirty(stack, 'undo', true)).toEqual({ dirty: true })
    expect(applyHistoryPersistDirty(stack, 'undo', true)).toEqual({ dirty: false })
  })

  it('marks dirty again on redo after undoing the first change', () => {
    const stack: boolean[] = []

    applyHistoryPersistDirty(stack, 'execute', false)
    applyHistoryPersistDirty(stack, 'undo', true)

    expect(applyHistoryPersistDirty(stack, 'redo', false)).toEqual({ dirty: true })
    expect(stack).toEqual([false])
    expect(applyHistoryPersistDirty(stack, 'undo', true)).toEqual({ dirty: false })
  })
})
