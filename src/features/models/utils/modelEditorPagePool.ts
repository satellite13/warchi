import { MODEL_PAGE_FETCH_CONCURRENCY } from '@/api/queryHelpers'

const waiting: Array<() => void> = []
let active = 0

function acquire(): Promise<void> {
  if (active < MODEL_PAGE_FETCH_CONCURRENCY) {
    active += 1
    return Promise.resolve()
  }

  return new Promise(resolve => {
    waiting.push(() => {
      active += 1
      resolve()
    })
  })
}

function release(): void {
  active -= 1
  waiting.shift()?.()
}

export async function withModelEditorPageSlot<T>(operation: () => Promise<T>): Promise<T> {
  await acquire()
  try {
    return await operation()
  } finally {
    release()
  }
}
