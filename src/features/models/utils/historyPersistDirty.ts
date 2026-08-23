export type HistoryPersistKind = 'execute' | 'undo' | 'redo'

/**
 * Tracks whether the diagram was already dirty before each papirus command.
 * Undo of the first local change can then clear the save indicator.
 */
export function applyHistoryPersistDirty(
  stack: boolean[],
  kind: HistoryPersistKind,
  currentDirty: boolean
): { dirty: boolean } {
  if (kind === 'undo') {
    return { dirty: stack.pop() ?? false }
  }
  stack.push(currentDirty)
  return { dirty: true }
}
