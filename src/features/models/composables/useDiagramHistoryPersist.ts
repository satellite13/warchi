import type { Ref } from 'vue'
import {
  applyHistoryPersistDirty,
  type HistoryPersistKind,
} from '../utils/historyPersistDirty'

export type DiagramHistoryApi = {
  canUndo: boolean
  canRedo: boolean
  undoCount: number
  undo: () => void
  redo: () => void
  clear: () => void
  on: (event: 'undo' | 'redo' | 'change', handler: () => void) => void
}

/**
 * History undo/redo persist orchestration for ModelDiagramCanvas.
 *
 * Owns:
 * - suppressHistoryCanvasPersist (layout commands must not persist-from-papirus)
 * - dirtyBeforeHistoryCommand stack + pendingHistoryPersistKind
 * - canUndo / canRedo mirrors
 *
 * Does NOT own papirus HistoryManager internals — only wires host persist.
 */
export function useDiagramHistoryPersist(options: {
  canUndo: Ref<boolean>
  canRedo: Ref<boolean>
  isReadOnly: () => boolean
  isDiagramDirty: () => boolean
  persistHistoryLayoutFromRenderer: (opts: { dirty: boolean }) => void
  detectLabelChanges: () => void
  detectEdgeLabelChanges: () => void
  syncEdgeAnchors: (opts: { persist: boolean; updateRenderer: boolean }) => void
}) {
  let suppressHistoryCanvasPersist = false
  const dirtyBeforeHistoryCommand: boolean[] = []
  let pendingHistoryPersistKind: HistoryPersistKind = 'execute'

  const runWithoutCanvasPersist = (fn: () => void): void => {
    suppressHistoryCanvasPersist = true
    try {
      fn()
    } finally {
      // HistoryManager emits `change` synchronously after execute/undo returns;
      // clear on microtask so persist-from-papirus stays suppressed for that tick.
      queueMicrotask(() => {
        suppressHistoryCanvasPersist = false
      })
    }
  }

  const bindHistoryEvents = (history: DiagramHistoryApi): void => {
    history.on('undo', () => {
      pendingHistoryPersistKind = 'undo'
    })
    history.on('redo', () => {
      pendingHistoryPersistKind = 'redo'
    })
    history.on('change', () => {
      if (options.isReadOnly()) return
      options.canUndo.value = history.canUndo
      options.canRedo.value = history.canRedo
      const persistDirty = applyHistoryPersistDirty(
        dirtyBeforeHistoryCommand,
        pendingHistoryPersistKind,
        options.isDiagramDirty()
      )
      pendingHistoryPersistKind = 'execute'
      while (dirtyBeforeHistoryCommand.length > history.undoCount) {
        dirtyBeforeHistoryCommand.shift()
      }
      if (suppressHistoryCanvasPersist) return
      // One attrs write: nodes + editable-polyline bends + ports + anchors.
      // A later cloneDiagramAttrs() still sees pre-undo props and would restore
      // post-drag controlPoints after nested group undo.
      options.persistHistoryLayoutFromRenderer({ dirty: persistDirty.dirty })
      if (persistDirty.dirty) {
        options.detectLabelChanges()
        options.detectEdgeLabelChanges()
      }
      options.syncEdgeAnchors({ persist: false, updateRenderer: true })
    })
  }

  const undo = (history: DiagramHistoryApi | null | undefined): void => {
    history?.undo()
  }

  const redo = (history: DiagramHistoryApi | null | undefined): void => {
    history?.redo()
  }

  const resetHistory = (history: DiagramHistoryApi | null | undefined): void => {
    suppressHistoryCanvasPersist = true
    try {
      history?.clear()
    } finally {
      suppressHistoryCanvasPersist = false
    }
    dirtyBeforeHistoryCommand.length = 0
    pendingHistoryPersistKind = 'execute'
    options.canUndo.value = false
    options.canRedo.value = false
  }

  return {
    get suppressHistoryCanvasPersist() {
      return suppressHistoryCanvasPersist
    },
    set suppressHistoryCanvasPersist(value: boolean) {
      suppressHistoryCanvasPersist = value
    },
    dirtyBeforeHistoryCommand,
    get pendingHistoryPersistKind() {
      return pendingHistoryPersistKind
    },
    set pendingHistoryPersistKind(value: HistoryPersistKind) {
      pendingHistoryPersistKind = value
    },
    runWithoutCanvasPersist,
    bindHistoryEvents,
    undo,
    redo,
    resetHistory,
  }
}

export type DiagramHistoryPersist = ReturnType<typeof useDiagramHistoryPersist>
