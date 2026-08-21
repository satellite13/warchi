import { describe, expect, it, vi } from 'vitest'
import type { DiagramResponse } from '@/types/api'
import type { ModelData } from '@/types/entities'
import type { EditorDiagram, TreeParentScope } from '../types'
import { parseDiagramAttrs } from '../modelAttrs'
import {
  createBoundedModelReconcile,
  type BoundedModelReconcileFetchers,
} from './useBoundedModelReconcile'

const REVISION_1 = '2026-01-01T00:00:00.000Z'
const REVISION_2 = '2026-01-02T00:00:00.000Z'

const ok = <T>(data: T) => ({ success: true as const, data })

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}

function model(id = 'model-1', updatedAt = REVISION_1): ModelData {
  return {
    id,
    name: id,
    version: '1.0.0',
    ownerId: 'owner-1',
    attrs: null,
    accessPermission: 'OWNER',
    createdAt: REVISION_1,
    updatedAt,
  }
}

function diagramResponse(id: string, name = id): DiagramResponse {
  return {
    id,
    name,
    version: '1.0.0',
    modelId: 'model-1',
    ownerId: 'owner-1',
    notationId: 'notation-1',
    nodeId: null,
    attrs: null,
    createdAt: REVISION_1,
    updatedAt: REVISION_2,
  }
}

function editorDiagram(id: string, name = id): EditorDiagram {
  return {
    ...diagramResponse(id, name),
    parsedAttrs: parseDiagramAttrs(null),
    _attrsPending: false,
  }
}

function harness(overrides?: {
  modelId?: () => string | null
  currentModel?: ModelData | null
  diagrams?: EditorDiagram[]
  scopes?: TreeParentScope[]
  fetchers?: Partial<BoundedModelReconcileFetchers>
  refreshVisibleChildrenScope?: (
    scope: TreeParentScope,
    signal: AbortSignal
  ) => Promise<void>
  reloadOpenDiagramScope?: (diagramId: string, signal: AbortSignal) => Promise<void>
}) {
  let currentModel = overrides?.currentModel ?? model()
  let diagrams = overrides?.diagrams ?? [editorDiagram('diagram-1', 'local')]
  const fetchers: BoundedModelReconcileFetchers = {
    fetchModel: vi.fn(async id => ok(model(id, REVISION_1))),
    fetchSlimDiagrams: vi.fn(async () => ok([])),
    ...overrides?.fetchers,
  }
  const replaceModel = vi.fn((next: ModelData) => {
    currentModel = next
  })
  const replaceDiagrams = vi.fn((next: EditorDiagram[]) => {
    diagrams = next
  })
  const refreshVisibleChildrenScope = vi.fn(
    overrides?.refreshVisibleChildrenScope ??
      (async (_scope: TreeParentScope, _signal: AbortSignal) => undefined)
  )
  const reloadOpenDiagramScope = vi.fn(
    overrides?.reloadOpenDiagramScope ??
      (async (_diagramId: string, _signal: AbortSignal) => undefined)
  )
  const detachedInvalidated = vi.fn()
  const errors = vi.fn()
  const recovered = vi.fn()
  const unavailable = vi.fn()
  const reconciler = createBoundedModelReconcile({
    modelId: overrides?.modelId ?? (() => 'model-1'),
    model: () => currentModel,
    replaceModel,
    modelDirty: () => false,
    diagrams: () => diagrams,
    replaceDiagrams,
    materializedScopes: () => overrides?.scopes ?? [],
    refreshVisibleChildrenScope,
    openDiagramId: () => 'diagram-1',
    reloadOpenDiagramScope,
    fetchers,
    onDetachedSnapshotInvalidated: detachedInvalidated,
    onError: errors,
    onRecovered: recovered,
    onModelUnavailable: unavailable,
  })
  return {
    reconciler,
    fetchers,
    replaceModel,
    replaceDiagrams,
    refreshVisibleChildrenScope,
    reloadOpenDiagramScope,
    detachedInvalidated,
    errors,
    recovered,
    unavailable,
    getModel: () => currentModel,
    getDiagrams: () => diagrams,
  }
}

describe('createBoundedModelReconcile', () => {
  it('stops after the point model revision when updatedAt is unchanged', async () => {
    const h = harness()

    h.reconciler.request('poll_timer')
    await h.reconciler.flush()

    expect(h.fetchers.fetchModel).toHaveBeenCalledTimes(1)
    expect(h.fetchers.fetchSlimDiagrams).not.toHaveBeenCalled()
    expect(h.refreshVisibleChildrenScope).not.toHaveBeenCalled()
    expect(h.reloadOpenDiagramScope).not.toHaveBeenCalled()
    expect(h.detachedInvalidated).not.toHaveBeenCalled()
  })

  it('refreshes slim diagrams, every materialized parent scope, and the open diagram scope', async () => {
    const scopes: TreeParentScope[] = [
      { kind: 'root' },
      { kind: 'node', nodeId: 'partial-parent' },
      { kind: 'node', nodeId: 'complete-parent' },
    ]
    const dirty = { ...editorDiagram('dirty', 'local dirty'), _isDirty: true }
    const h = harness({
      diagrams: [editorDiagram('diagram-1', 'local open'), dirty],
      scopes,
      fetchers: {
        fetchModel: vi.fn(async () => ok(model('model-1', REVISION_2))),
        fetchSlimDiagrams: vi.fn(async () =>
          ok([
            diagramResponse('diagram-1', 'remote open'),
            diagramResponse('dirty', 'remote dirty'),
            diagramResponse('new', 'remote new'),
          ])
        ),
      },
    })

    h.reconciler.request('visibility')
    await h.reconciler.flush()

    expect(h.refreshVisibleChildrenScope.mock.calls.map(([scope]) => scope)).toEqual(scopes)
    expect(h.reloadOpenDiagramScope).toHaveBeenCalledWith('diagram-1', expect.any(AbortSignal))
    expect(h.getDiagrams().map(row => [row.id, row.name])).toEqual([
      ['diagram-1', 'remote open'],
      ['dirty', 'local dirty'],
      ['new', 'remote new'],
    ])
    expect(h.getModel().updatedAt).toBe(REVISION_2)
    expect(h.detachedInvalidated).toHaveBeenCalledTimes(1)
    expect(h.errors).not.toHaveBeenCalled()
  })

  it('keeps one single flight and coalesces overlaps into one follow-up probe', async () => {
    const first = deferred<ReturnType<typeof ok<ModelData>>>()
    let active = 0
    let maxActive = 0
    const fetchModel = vi.fn(async () => {
      active += 1
      maxActive = Math.max(maxActive, active)
      const result = fetchModel.mock.calls.length === 1 ? await first.promise : ok(model())
      active -= 1
      return result
    })
    const h = harness({ fetchers: { fetchModel } })

    h.reconciler.request('poll_timer')
    h.reconciler.request('visibility')
    h.reconciler.request('auth_refresh')
    first.resolve(ok(model()))
    await h.reconciler.flush()

    expect(fetchModel).toHaveBeenCalledTimes(2)
    expect(maxActive).toBe(1)
  })

  it('cancels and ignores a stale model response after generation invalidation', async () => {
    let activeModelId = 'model-1'
    const oldResponse = deferred<ReturnType<typeof ok<ModelData>>>()
    const fetchModel = vi.fn(async (id: string) =>
      id === 'model-1' ? oldResponse.promise : ok(model('model-2', REVISION_2))
    )
    const h = harness({
      modelId: () => activeModelId,
      fetchers: { fetchModel, fetchSlimDiagrams: vi.fn(async () => ok([])) },
    })

    h.reconciler.request('poll_timer')
    activeModelId = 'model-2'
    h.reconciler.invalidate()
    h.reconciler.request('visibility')
    oldResponse.resolve(ok(model('model-1', REVISION_2)))
    await h.reconciler.flush()

    expect(h.getModel().id).toBe('model-2')
    expect(h.replaceModel).toHaveBeenCalledTimes(1)
    expect(h.detachedInvalidated).toHaveBeenCalledTimes(1)
  })

  it('aborts a materialized scope and applies no late completion after invalidation', async () => {
    const scopeRefresh = deferred<void>()
    let refreshSignal: AbortSignal | undefined
    const h = harness({
      scopes: [{ kind: 'root' }],
      fetchers: {
        fetchModel: vi.fn(async () => ok(model('model-1', REVISION_2))),
        fetchSlimDiagrams: vi.fn(async () => ok([diagramResponse('diagram-1', 'remote')])),
      },
      refreshVisibleChildrenScope: async (_scope, signal) => {
        refreshSignal = signal
        await scopeRefresh.promise
      },
    })

    h.reconciler.request('poll_timer')
    await vi.waitFor(() => expect(h.refreshVisibleChildrenScope).toHaveBeenCalledTimes(1))
    expect(refreshSignal).toBeInstanceOf(AbortSignal)
    const diagramsAtInvalidation = h.getDiagrams()

    h.reconciler.invalidate()
    expect(refreshSignal?.aborted).toBe(true)
    scopeRefresh.resolve()
    await h.reconciler.flush()

    expect(h.getDiagrams()).toBe(diagramsAtInvalidation)
    expect(h.reloadOpenDiagramScope).not.toHaveBeenCalled()
    expect(h.getModel().updatedAt).toBe(REVISION_1)
    expect(h.detachedInvalidated).not.toHaveBeenCalled()
  })

  it('keeps a failed revision retryable and recovers without eager detached loading', async () => {
    let fail = true
    const fetchSlimDiagrams = vi.fn(async () =>
      fail
        ? {
            success: false as const,
            error: { status: 503, message: 'diagrams unavailable' },
          }
        : ok([diagramResponse('diagram-1', 'recovered')])
    )
    const h = harness({
      fetchers: {
        fetchModel: vi.fn(async () => ok(model('model-1', REVISION_2))),
        fetchSlimDiagrams,
      },
    })

    h.reconciler.request('poll_timer')
    await h.reconciler.flush()

    expect(h.errors).toHaveBeenCalledWith(
      'poll_timer',
      expect.objectContaining({ message: 'diagrams unavailable' }),
      expect.any(Function)
    )
    expect(h.detachedInvalidated).not.toHaveBeenCalled()
    expect(h.getModel().updatedAt).toBe(REVISION_1)

    fail = false
    const retry = h.errors.mock.calls[0]?.[2] as (() => void) | undefined
    retry?.()
    await h.reconciler.flush()

    expect(fetchSlimDiagrams).toHaveBeenCalledTimes(2)
    expect(h.getModel().updatedAt).toBe(REVISION_2)
    expect(h.detachedInvalidated).toHaveBeenCalledTimes(1)
    expect(h.recovered).toHaveBeenCalledWith('poll_timer')
  })

  it('does not accept the revision until every required scope succeeds', async () => {
    let failScope = true
    const refreshVisibleChildrenScope = vi.fn(async () => {
      if (failScope) throw new Error('root scope failed')
    })
    const h = harness({
      scopes: [{ kind: 'root' }],
      fetchers: {
        fetchModel: vi.fn(async () => ok(model('model-1', REVISION_2))),
        fetchSlimDiagrams: vi.fn(async () => ok([])),
      },
      refreshVisibleChildrenScope,
    })

    h.reconciler.request('poll_timer')
    await h.reconciler.flush()

    expect(h.errors).toHaveBeenCalledWith(
      'poll_timer',
      expect.objectContaining({ message: 'root scope failed' }),
      expect.any(Function)
    )
    expect(h.getModel().updatedAt).toBe(REVISION_1)
    expect(h.detachedInvalidated).not.toHaveBeenCalled()

    failScope = false
    const retry = h.errors.mock.calls[0]?.[2] as (() => void) | undefined
    retry?.()
    await h.reconciler.flush()

    expect(refreshVisibleChildrenScope).toHaveBeenCalledTimes(2)
    expect(h.getModel().updatedAt).toBe(REVISION_2)
    expect(h.detachedInvalidated).toHaveBeenCalledTimes(1)
  })

  it('does not accept the revision until the open diagram scope succeeds', async () => {
    let failDiagram = true
    const reloadOpenDiagramScope = vi.fn(async () => {
      if (failDiagram) throw new Error('open diagram failed')
    })
    const h = harness({
      fetchers: {
        fetchModel: vi.fn(async () => ok(model('model-1', REVISION_2))),
        fetchSlimDiagrams: vi.fn(async () => ok([diagramResponse('diagram-1')])),
      },
      reloadOpenDiagramScope,
    })

    h.reconciler.request('visibility')
    await h.reconciler.flush()

    expect(h.errors).toHaveBeenCalledWith(
      'visibility',
      expect.objectContaining({ message: 'open diagram failed' }),
      expect.any(Function)
    )
    expect(h.getModel().updatedAt).toBe(REVISION_1)
    expect(h.detachedInvalidated).not.toHaveBeenCalled()

    failDiagram = false
    const retry = h.errors.mock.calls[0]?.[2] as (() => void) | undefined
    retry?.()
    await h.reconciler.flush()

    expect(reloadOpenDiagramScope).toHaveBeenCalledTimes(2)
    expect(h.getModel().updatedAt).toBe(REVISION_2)
    expect(h.detachedInvalidated).toHaveBeenCalledTimes(1)
  })

  it('halts on an unavailable model without starting bounded collection requests', async () => {
    const h = harness({
      fetchers: {
        fetchModel: vi.fn(async () => ({
          success: false as const,
          error: { status: 403, message: 'Forbidden' },
        })),
      },
    })

    h.reconciler.request('ws_revision_changed')
    await h.reconciler.flush()

    expect(h.unavailable).toHaveBeenCalledWith(403)
    expect(h.fetchers.fetchSlimDiagrams).not.toHaveBeenCalled()
  })
})
