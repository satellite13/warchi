export type DiagramHistoryCommand = {
  execute: () => void
  undo: () => void
}

export type DiagramHistoryBatcherOptions = {
  executeCommand: (command: DiagramHistoryCommand) => void
  debounceMs?: number
}

type PendingChange = {
  key: string
  execute: () => void
  undo: () => void
  timerId: ReturnType<typeof setTimeout>
}

const DEFAULT_DEBOUNCE_MS = 350

export function createDiagramHistoryBatcher(options: DiagramHistoryBatcherOptions) {
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS
  const pending = new Map<string, PendingChange>()

  const clearTimer = (entry: PendingChange): void => {
    clearTimeout(entry.timerId)
  }

  const flushOne = (key: string): void => {
    const entry = pending.get(key)
    if (!entry) return
    pending.delete(key)
    clearTimer(entry)
    options.executeCommand({
      execute: entry.execute,
      undo: entry.undo,
    })
  }

  const flush = (): void => {
    for (const key of [...pending.keys()]) {
      flushOne(key)
    }
  }

  const drop = (): void => {
    for (const entry of pending.values()) {
      clearTimer(entry)
    }
    pending.clear()
  }

  const record = (key: string, command: DiagramHistoryCommand): void => {
    const existing = pending.get(key)
    if (existing) {
      existing.execute = command.execute
      clearTimer(existing)
      existing.timerId = setTimeout(() => flushOne(key), debounceMs)
      return
    }
    pending.set(key, {
      key,
      execute: command.execute,
      undo: command.undo,
      timerId: setTimeout(() => flushOne(key), debounceMs),
    })
  }

  const commit = (command: DiagramHistoryCommand): void => {
    flush()
    options.executeCommand(command)
  }

  return { record, flush, drop, commit }
}
