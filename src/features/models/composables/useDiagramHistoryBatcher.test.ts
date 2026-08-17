import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDiagramHistoryBatcher } from './useDiagramHistoryBatcher'

describe('createDiagramHistoryBatcher', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('coalesces rapid updates on the same key into one command', () => {
    const executed: Array<{ execute: () => void; undo: () => void }> = []
    const batcher = createDiagramHistoryBatcher({
      executeCommand: command => executed.push(command),
      debounceMs: 350,
    })
    const firstUndo = vi.fn()
    const secondUndo = vi.fn()
    const firstApply = vi.fn()
    const secondApply = vi.fn()

    batcher.record('style:n1', { execute: firstApply, undo: firstUndo })
    batcher.record('style:n1', { execute: secondApply, undo: secondUndo })
    expect(executed).toHaveLength(0)

    vi.advanceTimersByTime(350)
    expect(executed).toHaveLength(1)
    executed[0]!.execute()
    executed[0]!.undo()
    expect(secondApply).toHaveBeenCalled()
    expect(firstUndo).toHaveBeenCalled()
    expect(secondUndo).not.toHaveBeenCalled()
    expect(firstApply).not.toHaveBeenCalled()
  })

  it('keeps separate keys as separate commands after pause', () => {
    const executed: Array<{ execute: () => void; undo: () => void }> = []
    const batcher = createDiagramHistoryBatcher({
      executeCommand: command => executed.push(command),
      debounceMs: 350,
    })

    batcher.record('style:n1', { execute: vi.fn(), undo: vi.fn() })
    vi.advanceTimersByTime(351)
    batcher.record('nodeType:n1', { execute: vi.fn(), undo: vi.fn() })
    vi.advanceTimersByTime(351)

    expect(executed).toHaveLength(2)
  })

  it('flush records pending command immediately', () => {
    const executed: Array<{ execute: () => void; undo: () => void }> = []
    const batcher = createDiagramHistoryBatcher({
      executeCommand: command => executed.push(command),
    })
    const undo = vi.fn()
    batcher.record('style:n1', { execute: vi.fn(), undo })
    batcher.flush()
    expect(executed).toHaveLength(1)
    executed[0]!.undo()
    expect(undo).toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    expect(executed).toHaveLength(1)
  })

  it('commit flushes pending then records the discrete command', () => {
    const executed: Array<{ execute: () => void; undo: () => void }> = []
    const batcher = createDiagramHistoryBatcher({
      executeCommand: command => executed.push(command),
    })
    batcher.record('style:n1', { execute: vi.fn(), undo: vi.fn() })
    const discrete = { execute: vi.fn(), undo: vi.fn() }
    batcher.commit(discrete)
    expect(executed).toHaveLength(2)
    expect(executed[1]).toBe(discrete)
  })

  it('drop discards pending without recording', () => {
    const executeCommand = vi.fn()
    const batcher = createDiagramHistoryBatcher({ executeCommand })
    batcher.record('style:n1', { execute: vi.fn(), undo: vi.fn() })
    batcher.drop()
    vi.advanceTimersByTime(1000)
    expect(executeCommand).not.toHaveBeenCalled()
  })
})
