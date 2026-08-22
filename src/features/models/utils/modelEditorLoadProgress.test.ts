import { describe, expect, it } from 'vitest'
import { createModelEditorLoadProgressTracker } from './modelEditorLoadProgress'

describe('createModelEditorLoadProgressTracker', () => {
  it('keeps progress monotonic while parallel shell totals become known', () => {
    const tracker = createModelEditorLoadProgressTracker({
      generation: 3,
      modelId: 'model-1',
    })

    const nodes = tracker.update({
      kind: 'collection',
      collection: 'nodes',
      loaded: 50,
      total: 100,
    })
    const diagrams = tracker.update({
      kind: 'collection',
      collection: 'diagrams',
      loaded: 0,
      total: 100,
    })
    const shellComplete = tracker.update({
      kind: 'collection',
      collection: 'nodes',
      loaded: 100,
      total: 100,
    })

    expect(nodes.percent).toBeGreaterThan(0)
    expect(diagrams.percent).toBeGreaterThanOrEqual(nodes.percent)
    expect(shellComplete.percent).toBeGreaterThanOrEqual(diagrams.percent)
    expect(shellComplete.blocking).toBe(true)
    expect(shellComplete).toMatchObject({ generation: 3, modelId: 'model-1' })
  })

  it('moves from scoped shell preparation to nonblocking catalog completion', () => {
    const tracker = createModelEditorLoadProgressTracker({
      generation: 4,
      modelId: 'model-2',
    })

    tracker.update({ kind: 'collection', collection: 'nodes', loaded: 100, total: 100 })
    tracker.update({ kind: 'collection', collection: 'diagrams', loaded: 10, total: 10 })
    const preparing = tracker.update({
      kind: 'preparing',
      target: 'shell',
      loaded: 50,
      total: 100,
    })
    const catalogStarted = tracker.update({ kind: 'catalog', status: 'started' })
    tracker.setBlocking(false)
    const catalogComplete = tracker.update({ kind: 'catalog', status: 'complete' })
    const complete = tracker.update({ kind: 'complete' })

    expect(preparing).toMatchObject({
      phase: 'preparing',
      loaded: 50,
      total: 100,
      blocking: true,
    })
    expect(catalogStarted.percent).toBeGreaterThanOrEqual(preparing.percent)
    expect(catalogComplete).toMatchObject({
      phase: 'catalog',
      loaded: 1,
      total: 1,
      blocking: false,
    })
    expect(catalogComplete.percent).toBeGreaterThanOrEqual(catalogStarted.percent)
    expect(complete.percent).toBe(100)
  })
})
