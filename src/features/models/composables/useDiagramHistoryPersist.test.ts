import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useDiagramHistoryPersist } from './useDiagramHistoryPersist'

describe('useDiagramHistoryPersist', () => {
  it('binds undo/redo/change and persists layout when not suppressed', () => {
    const canUndo = ref(false)
    const canRedo = ref(false)
    const persistHistoryLayoutFromRenderer = vi.fn()
    const detectLabelChanges = vi.fn()
    const detectEdgeLabelChanges = vi.fn()
    const syncEdgeAnchors = vi.fn()

    const history = {
      canUndo: true,
      canRedo: false,
      undoCount: 1,
      undo: vi.fn(),
      redo: vi.fn(),
      clear: vi.fn(),
      on: vi.fn(),
    }

    const persist = useDiagramHistoryPersist({
      canUndo,
      canRedo,
      isReadOnly: () => false,
      isDiagramDirty: () => false,
      persistHistoryLayoutFromRenderer,
      detectLabelChanges,
      detectEdgeLabelChanges,
      syncEdgeAnchors,
    })

    persist.bindHistoryEvents(history)
    expect(history.on).toHaveBeenCalledWith('undo', expect.any(Function))
    expect(history.on).toHaveBeenCalledWith('redo', expect.any(Function))
    expect(history.on).toHaveBeenCalledWith('change', expect.any(Function))

    const changeHandler = history.on.mock.calls.find(c => c[0] === 'change')?.[1] as () => void
    const undoHandler = history.on.mock.calls.find(c => c[0] === 'undo')?.[1] as () => void
    undoHandler()
    changeHandler()

    expect(canUndo.value).toBe(true)
    expect(persistHistoryLayoutFromRenderer).toHaveBeenCalledWith({ dirty: false })
    expect(detectLabelChanges).not.toHaveBeenCalled()
    expect(syncEdgeAnchors).toHaveBeenCalledWith({ persist: false, updateRenderer: true })
  })

  it('skips persist while layout command suppresses canvas persist', async () => {
    const persistHistoryLayoutFromRenderer = vi.fn()
    const history = {
      canUndo: false,
      canRedo: false,
      undoCount: 0,
      undo: vi.fn(),
      redo: vi.fn(),
      clear: vi.fn(),
      on: vi.fn(),
    }
    const persist = useDiagramHistoryPersist({
      canUndo: ref(false),
      canRedo: ref(false),
      isReadOnly: () => false,
      isDiagramDirty: () => true,
      persistHistoryLayoutFromRenderer,
      detectLabelChanges: vi.fn(),
      detectEdgeLabelChanges: vi.fn(),
      syncEdgeAnchors: vi.fn(),
    })
    persist.bindHistoryEvents(history)
    const changeHandler = history.on.mock.calls.find(c => c[0] === 'change')?.[1] as () => void

    persist.runWithoutCanvasPersist(() => {
      changeHandler()
    })
    expect(persistHistoryLayoutFromRenderer).not.toHaveBeenCalled()
    await Promise.resolve()
    changeHandler()
    expect(persistHistoryLayoutFromRenderer).toHaveBeenCalled()
  })

  it('resetHistory clears stack and flags', () => {
    const canUndo = ref(true)
    const canRedo = ref(true)
    const history = {
      canUndo: false,
      canRedo: false,
      undoCount: 0,
      undo: vi.fn(),
      redo: vi.fn(),
      clear: vi.fn(),
      on: vi.fn(),
    }
    const persist = useDiagramHistoryPersist({
      canUndo,
      canRedo,
      isReadOnly: () => false,
      isDiagramDirty: () => false,
      persistHistoryLayoutFromRenderer: vi.fn(),
      detectLabelChanges: vi.fn(),
      detectEdgeLabelChanges: vi.fn(),
      syncEdgeAnchors: vi.fn(),
    })
    persist.dirtyBeforeHistoryCommand.push(true)
    persist.resetHistory(history)
    expect(history.clear).toHaveBeenCalled()
    expect(persist.dirtyBeforeHistoryCommand).toEqual([])
    expect(canUndo.value).toBe(false)
    expect(canRedo.value).toBe(false)
  })
})
