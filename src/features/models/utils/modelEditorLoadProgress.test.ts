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

  it('reports real preparation and link counts across blocking and background phases', () => {
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
    const catalog = tracker.update({ kind: 'catalog', status: 'started' })
    tracker.setBlocking(false)
    const links = tracker.update({
      kind: 'collection',
      collection: 'links',
      loaded: 75,
      total: 100,
    })
    const complete = tracker.update({ kind: 'complete' })

    expect(preparing).toMatchObject({
      phase: 'preparing',
      loaded: 50,
      total: 100,
      blocking: true,
    })
    expect(catalog.percent).toBeGreaterThanOrEqual(preparing.percent)
    expect(links).toMatchObject({
      phase: 'links',
      loaded: 75,
      total: 100,
      blocking: false,
    })
    expect(links.percent).toBeGreaterThanOrEqual(catalog.percent)
    expect(complete.percent).toBe(100)
  })
})
