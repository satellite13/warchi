import { describe, expect, it } from 'vitest'
import { MODEL_PAGE_FETCH_CONCURRENCY } from '@/api/queryHelpers'
import { withModelEditorPageSlot } from './modelEditorPagePool'

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void
  const promise = new Promise<void>(done => {
    resolve = done
  })
  return { promise, resolve }
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

describe('withModelEditorPageSlot', () => {
  it('limits concurrent operations and starts queued work in FIFO order', async () => {
    const gates = Array.from({ length: MODEL_PAGE_FETCH_CONCURRENCY + 2 }, deferred)
    const started: number[] = []
    const tasks = gates.map((gate, index) =>
      withModelEditorPageSlot(async () => {
        started.push(index)
        await gate.promise
        return index
      })
    )

    try {
      await flushMicrotasks()
      expect(started).toEqual(
        Array.from({ length: MODEL_PAGE_FETCH_CONCURRENCY }, (_, index) => index)
      )

      gates[0]?.resolve()
      await flushMicrotasks()
      expect(started).toEqual(
        Array.from({ length: MODEL_PAGE_FETCH_CONCURRENCY + 1 }, (_, index) => index)
      )

      gates[1]?.resolve()
      await flushMicrotasks()
      expect(started).toEqual(
        Array.from({ length: MODEL_PAGE_FETCH_CONCURRENCY + 2 }, (_, index) => index)
      )

      gates.forEach(gate => gate.resolve())
      await expect(Promise.all(tasks)).resolves.toEqual(
        Array.from({ length: MODEL_PAGE_FETCH_CONCURRENCY + 2 }, (_, index) => index)
      )
    } finally {
      gates.forEach(gate => gate.resolve())
      await Promise.allSettled(tasks)
    }
  })

  it('releases slots after rejected promises and synchronous throws', async () => {
    await expect(
      withModelEditorPageSlot(async () => {
        throw new Error('async failure')
      })
    ).rejects.toThrow('async failure')
    await expect(
      withModelEditorPageSlot(() => {
        throw new Error('sync failure')
      })
    ).rejects.toThrow('sync failure')

    const gates = Array.from({ length: MODEL_PAGE_FETCH_CONCURRENCY }, deferred)
    let started = 0
    const tasks = gates.map(gate =>
      withModelEditorPageSlot(async () => {
        started += 1
        await gate.promise
      })
    )

    try {
      await flushMicrotasks()
      expect(started).toBe(MODEL_PAGE_FETCH_CONCURRENCY)
    } finally {
      gates.forEach(gate => gate.resolve())
      await Promise.allSettled(tasks)
    }
  })
})
