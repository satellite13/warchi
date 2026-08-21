import { onScopeDispose, ref, type Ref } from 'vue'
import {
  paginatedContent,
  paginatedIsLastPage,
  paginatedTotalElements,
} from '@/utils/paginatedResponse'
import type { PaginatedResponse } from '@/types/entities'
import type { LinkResponse, NodeResponse } from '@/types/api'
import type { ModelEditorState, ModelPartialRequestGuard, TreeParentScope } from '../types'
import { ModelPartialStore } from '../utils/modelPartialStore'
import { toEditorLink, toEditorNode } from './modelEditorMappers'
import { fetchNodeChildren } from './modelScopedApi'

export type InitialChildrenScope = {
  scope: TreeParentScope
  page: PaginatedResponse<NodeResponse>
  rootParentNodeId?: string | null
}

type ScopeRequestSession = {
  guard: ModelPartialRequestGuard
  controller: AbortController
  rowsById: Map<string, ReturnType<typeof toEditorNode>>
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Не удалось загрузить ветку модели.'

export function useModelPartialStore(state: Ref<ModelEditorState>) {
  const store = new ModelPartialStore()
  const childrenLoading = ref<Set<string>>(new Set())
  const childrenErrors = ref<Map<string, string>>(new Map())
  const generation = ref(store.generation)
  const materializedRevision = ref(0)
  const sessions = new Map<string, ScopeRequestSession>()
  const inFlight = new Map<string, { promise: Promise<void> }>()
  const visibleRefreshFailures = new Set<string>()
  const queuedVisibleRefreshes = new Set<string>()
  let modelId: string | null = null

  const publishRows = (): void => {
    state.value = {
      ...state.value,
      nodes: store.nodes,
      links: store.links,
    }
    materializedRevision.value += 1
  }

  const captureMaterializedRows = (): void => {
    store.replaceMaterializedRows(state.value.nodes, state.value.links)
  }

  const reconcileMaterializedRows = (
    affectedScopes: readonly TreeParentScope[] | 'all' = 'all'
  ): void => {
    const scopeKeys =
      affectedScopes === 'all'
        ? new Set([...sessions.keys(), ...inFlight.keys()])
        : new Set(affectedScopes.map(scope => store.scopeKey(scope)))
    for (const scopeKey of scopeKeys) {
      sessions.get(scopeKey)?.controller.abort()
      sessions.delete(scopeKey)
      inFlight.delete(scopeKey)
      visibleRefreshFailures.delete(scopeKey)
      queuedVisibleRefreshes.delete(scopeKey)
      setLoading(scopeKey, false)
      setError(scopeKey, null)
    }
    store.reconcileMaterializedRows(state.value.nodes, state.value.links, affectedScopes)
    publishRows()
  }

  const invalidateChildrenScope = (scope: TreeParentScope): void => {
    const scopeKey = store.scopeKey(scope)
    sessions.get(scopeKey)?.controller.abort()
    sessions.delete(scopeKey)
    inFlight.delete(scopeKey)
    visibleRefreshFailures.delete(scopeKey)
    queuedVisibleRefreshes.delete(scopeKey)
    setLoading(scopeKey, false)
    setError(scopeKey, null)
    store.invalidateChildrenScope(scope)
  }

  const materializedChildrenScopes = (): TreeParentScope[] =>
    [...sessions.keys()].map(scopeKey =>
      scopeKey === 'root'
        ? { kind: 'root' }
        : { kind: 'node', nodeId: scopeKey.slice('node:'.length) }
    )

  const setLoading = (scopeKey: string, loading: boolean): void => {
    const next = new Set(childrenLoading.value)
    if (loading) next.add(scopeKey)
    else next.delete(scopeKey)
    childrenLoading.value = next
  }

  const setError = (scopeKey: string, message: string | null): void => {
    const next = new Map(childrenErrors.value)
    if (message) next.set(scopeKey, message)
    else next.delete(scopeKey)
    childrenErrors.value = next
  }

  const startSession = (scope: TreeParentScope): ScopeRequestSession => {
    const scopeKey = store.scopeKey(scope)
    sessions.get(scopeKey)?.controller.abort()
    const session: ScopeRequestSession = {
      guard: store.beginChildrenRequest(scope),
      controller: new AbortController(),
      rowsById: new Map(),
    }
    sessions.set(scopeKey, session)
    return session
  }

  const mergePageIntoStore = (
    scope: TreeParentScope,
    pageNumber: number,
    response: PaginatedResponse<NodeResponse>,
    session: ScopeRequestSession
  ): void => {
    const rows = paginatedContent(response).map(toEditorNode)
    for (const row of rows) session.rowsById.set(row.id, row)
    const last = paginatedIsLastPage(response, pageNumber)
    store.mergeNodes(
      rows,
      {
        kind: 'childrenPage',
        scope,
        page: pageNumber,
        total: Math.max(paginatedTotalElements(response), rows.length),
        last,
        token: session.guard.token,
      },
      session.guard
    )
    if (last && store.loadedChildrenFor.has(store.scopeKey(scope))) {
      store.mergeNodes(
        [...session.rowsById.values()],
        { kind: 'childrenScope', scope, token: session.guard.token },
        session.guard
      )
    }
  }

  const mergePage = (
    scope: TreeParentScope,
    pageNumber: number,
    response: PaginatedResponse<NodeResponse>,
    session: ScopeRequestSession
  ): void => {
    // Tree operations still mutate compatible state arrays directly. Capture those local
    // materialized rows before every remote merge so the partial store remains merge owner.
    captureMaterializedRows()
    mergePageIntoStore(scope, pageNumber, response, session)
    publishRows()
  }

  const loadPage = (
    scope: TreeParentScope,
    pageNumber: number,
    restart: boolean
  ): Promise<void> => {
    const scopeKey = store.scopeKey(scope)
    const existing = inFlight.get(scopeKey)
    if (existing) return existing.promise
    if (!modelId) return Promise.resolve()

    const requestedModelId = modelId
    const session =
      restart || !sessions.has(scopeKey) ? startSession(scope) : sessions.get(scopeKey)!
    store.markChildrenScopeMutation(scope)
    setLoading(scopeKey, true)
    setError(scopeKey, null)
    const entry = { promise: Promise.resolve() }
    entry.promise = (async (): Promise<void> => {
      try {
        const result = await fetchNodeChildren(requestedModelId, scope, {
          page: pageNumber,
          signal: session.controller.signal,
        })
        if (session.controller.signal.aborted || requestedModelId !== modelId) return
        if (!result.success) {
          setError(scopeKey, result.error.message)
          return
        }
        mergePage(scope, pageNumber, result.data, session)
      } catch (error) {
        if (!session.controller.signal.aborted && requestedModelId === modelId) {
          setError(scopeKey, errorMessage(error))
        }
      } finally {
        if (inFlight.get(scopeKey) === entry) {
          inFlight.delete(scopeKey)
          setLoading(scopeKey, false)
        }
      }
    })()
    inFlight.set(scopeKey, entry)
    return entry.promise
  }

  const loadChildren = (scope: TreeParentScope): Promise<void> => {
    const scopeKey = store.scopeKey(scope)
    if (visibleRefreshFailures.has(scopeKey)) return refreshVisibleChildrenScope(scope)
    if (store.loadedChildrenFor.has(scopeKey)) return Promise.resolve()
    const existing = inFlight.get(scopeKey)
    if (existing) return existing.promise
    const pageState = store.childrenPages.get(scopeKey)
    if (pageState && !childrenErrors.value.has(scopeKey)) return Promise.resolve()
    return loadPage(scope, pageState?.nextPage ?? 0, !sessions.has(scopeKey))
  }

  const loadNextChildrenPage = (scope: TreeParentScope): Promise<void> => {
    const scopeKey = store.scopeKey(scope)
    if (store.loadedChildrenFor.has(scopeKey)) return Promise.resolve()
    const pageState = store.childrenPages.get(scopeKey)
    return loadPage(scope, pageState?.nextPage ?? 0, !sessions.has(scopeKey))
  }

  const refreshChildrenScope = (scope: TreeParentScope): Promise<void> => {
    const scopeKey = store.scopeKey(scope)
    inFlight.delete(scopeKey)
    visibleRefreshFailures.delete(scopeKey)
    return loadPage(scope, 0, true)
  }

  const refreshVisibleChildrenScope = (
    scope: TreeParentScope,
    externalSignal?: AbortSignal
  ): Promise<void> => {
    const scopeKey = store.scopeKey(scope)
    const existing = inFlight.get(scopeKey)
    if (existing) {
      queuedVisibleRefreshes.add(scopeKey)
      return existing.promise.then(async () => {
        if (externalSignal?.aborted) return
        if (queuedVisibleRefreshes.delete(scopeKey)) {
          await refreshVisibleChildrenScope(scope, externalSignal)
        } else {
          await inFlight.get(scopeKey)?.promise
        }
      })
    }
    if (!modelId || externalSignal?.aborted) return Promise.resolve()

    const requestedModelId = modelId
    const requestGeneration = store.generation
    const previousPageState = store.childrenPages.get(scopeKey)
    const visibleThroughPage =
      previousPageState && previousPageState.loadedPages.size > 0
        ? Math.max(...previousPageState.loadedPages)
        : 0
    const wasComplete = store.loadedChildrenFor.has(scopeKey)
    store.markChildrenScopeMutation(scope)
    const prefetchSession: ScopeRequestSession = {
      guard: store.beginRequest(`children-refresh:${scopeKey}`),
      controller: new AbortController(),
      rowsById: new Map(),
    }
    sessions.get(scopeKey)?.controller.abort()
    sessions.set(scopeKey, prefetchSession)
    const abortFromExternal = (): void => prefetchSession.controller.abort()
    externalSignal?.addEventListener('abort', abortFromExternal, { once: true })
    setLoading(scopeKey, true)
    setError(scopeKey, null)

    const entry = { promise: Promise.resolve() }
    entry.promise = (async (): Promise<void> => {
      const pages: Array<{ pageNumber: number; response: PaginatedResponse<NodeResponse> }> = []
      try {
        let pageNumber = 0
        while (true) {
          const result = await fetchNodeChildren(requestedModelId, scope, {
            page: pageNumber,
            signal: prefetchSession.controller.signal,
          })
          if (
            prefetchSession.controller.signal.aborted ||
            requestedModelId !== modelId ||
            requestGeneration !== store.generation ||
            !store.isRequestCurrent(prefetchSession.guard)
          ) {
            return
          }
          if (!result.success) {
            throw new Error(result.error.message)
          }
          pages.push({ pageNumber, response: result.data })
          if (
            paginatedIsLastPage(result.data, pageNumber) ||
            (!wasComplete && pageNumber >= visibleThroughPage)
          ) {
            break
          }
          pageNumber += 1
        }

        captureMaterializedRows()
        const commitSession = startSession(scope)
        store.prepareChildrenScopeRefresh(scope)
        for (const page of pages) {
          mergePageIntoStore(scope, page.pageNumber, page.response, commitSession)
        }
        visibleRefreshFailures.delete(scopeKey)
        publishRows()
      } catch (error) {
        if (
          !prefetchSession.controller.signal.aborted &&
          requestedModelId === modelId &&
          requestGeneration === store.generation
        ) {
          const message = errorMessage(error)
          visibleRefreshFailures.add(scopeKey)
          setError(scopeKey, message)
          if (externalSignal) {
            throw error instanceof Error ? error : new Error(message)
          }
        }
      } finally {
        externalSignal?.removeEventListener('abort', abortFromExternal)
        if (inFlight.get(scopeKey) === entry) {
          inFlight.delete(scopeKey)
          setLoading(scopeKey, false)
        }
      }
    })()
    inFlight.set(scopeKey, entry)
    return entry.promise
  }

  const prepareVisibleChildrenScopeRefresh = async (
    scope: TreeParentScope,
    externalSignal: AbortSignal
  ): Promise<{ isCurrent: () => boolean; commit: () => void }> => {
    const scopeKey = store.scopeKey(scope)
    const existing = inFlight.get(scopeKey)
    if (existing) {
      await existing.promise
      if (externalSignal.aborted) {
        return { isCurrent: () => false, commit: () => undefined }
      }
      return prepareVisibleChildrenScopeRefresh(scope, externalSignal)
    }
    if (!modelId || externalSignal.aborted) {
      return { isCurrent: () => false, commit: () => undefined }
    }

    const requestedModelId = modelId
    const requestGeneration = store.generation
    const scopeMutationVersion = store.childrenScopeMutationVersion(scope)
    const previousPageState = store.childrenPages.get(scopeKey)
    const visibleThroughPage =
      previousPageState && previousPageState.loadedPages.size > 0
        ? Math.max(...previousPageState.loadedPages)
        : 0
    const wasComplete = store.loadedChildrenFor.has(scopeKey)
    const guard = store.beginRequest(`children-refresh:${scopeKey}`)
    const controller = new AbortController()
    const abortFromExternal = (): void => controller.abort()
    externalSignal.addEventListener('abort', abortFromExternal, { once: true })
    setLoading(scopeKey, true)
    setError(scopeKey, null)

    let resolveEntry!: () => void
    const entry = {
      promise: new Promise<void>(resolve => {
        resolveEntry = resolve
      }),
    }
    inFlight.set(scopeKey, entry)
    try {
      const pages: Array<{ pageNumber: number; response: PaginatedResponse<NodeResponse> }> = []
      let pageNumber = 0
      while (true) {
        const result = await fetchNodeChildren(requestedModelId, scope, {
          page: pageNumber,
          signal: controller.signal,
        })
        if (
          controller.signal.aborted ||
          requestedModelId !== modelId ||
          requestGeneration !== store.generation ||
          !store.isRequestCurrent(guard)
        ) {
          return { isCurrent: () => false, commit: () => undefined }
        }
        if (!result.success) throw new Error(result.error.message)
        pages.push({ pageNumber, response: result.data })
        if (
          paginatedIsLastPage(result.data, pageNumber) ||
          (!wasComplete && pageNumber >= visibleThroughPage)
        ) {
          break
        }
        pageNumber += 1
      }

      const isCurrent = (): boolean =>
        !externalSignal.aborted &&
        requestedModelId === modelId &&
        requestGeneration === store.generation &&
        store.childrenScopeMutationVersion(scope) === scopeMutationVersion &&
        store.isRequestCurrent(guard)
      return {
        isCurrent,
        commit: () => {
          if (!isCurrent()) return
          captureMaterializedRows()
          const commitSession = startSession(scope)
          store.prepareChildrenScopeRefresh(scope)
          for (const page of pages) {
            mergePageIntoStore(scope, page.pageNumber, page.response, commitSession)
          }
          visibleRefreshFailures.delete(scopeKey)
          publishRows()
        },
      }
    } catch (error) {
      if (
        !controller.signal.aborted &&
        requestedModelId === modelId &&
        requestGeneration === store.generation
      ) {
        const message = errorMessage(error)
        visibleRefreshFailures.add(scopeKey)
        setError(scopeKey, message)
        throw error instanceof Error ? error : new Error(message)
      }
      return { isCurrent: () => false, commit: () => undefined }
    } finally {
      externalSignal.removeEventListener('abort', abortFromExternal)
      if (inFlight.get(scopeKey) === entry) {
        inFlight.delete(scopeKey)
        setLoading(scopeKey, false)
      }
      resolveEntry()
    }
  }

  const ensureChildrenScopeComplete = async (scope: TreeParentScope): Promise<void> => {
    const scopeKey = store.scopeKey(scope)
    while (!store.loadedChildrenFor.has(scopeKey)) {
      await loadNextChildrenPage(scope)
      if (childrenErrors.value.has(scopeKey) || !store.childrenPages.get(scopeKey)) return
    }
  }

  const abortInFlightScopes = (): void => {
    for (const session of sessions.values()) session.controller.abort()
    sessions.clear()
    inFlight.clear()
    visibleRefreshFailures.clear()
    queuedVisibleRefreshes.clear()
    childrenLoading.value = new Set()
  }

  const resetPartialScopes = (nextModelId: string | null, initial?: InitialChildrenScope): void => {
    abortInFlightScopes()
    store.reset()
    generation.value = store.generation
    modelId = nextModelId
    childrenLoading.value = new Set()
    childrenErrors.value = new Map()
    state.value = {
      ...state.value,
      modelId: nextModelId ?? '',
      nodes: [],
      links: [],
    }
    if (initial) {
      store.setRootParentNodeId(initial.rootParentNodeId)
      const session = startSession(initial.scope)
      mergePage(initial.scope, 0, initial.page, session)
    }
  }

  const mergeFullLinks = (links: ModelEditorState['links']): void => {
    captureMaterializedRows()
    store.mergeLinks(links, { kind: 'full' })
    publishRows()
  }

  const discardRemoteCascadeConflictLinks = (): void => {
    captureMaterializedRows()
    store.discardRemoteCascadeConflictLinks()
    publishRows()
  }

  const mergePartialEntities = (
    nodes: readonly NodeResponse[],
    links: readonly LinkResponse[],
    guard: ModelPartialRequestGuard
  ): boolean => {
    captureMaterializedRows()
    const nodesAccepted = store.mergeNodes(nodes.map(toEditorNode), { kind: 'partial' }, guard)
    const linksAccepted = store.mergeLinks(links.map(toEditorLink), { kind: 'partial' }, guard)
    if (!nodesAccepted || !linksAccepted) return false
    publishRows()
    return true
  }

  const syncLocalNode = (node: ModelEditorState['nodes'][number]): void => {
    store.upsertLocalNode(node)
    materializedRevision.value += 1
  }

  const syncLocalLink = (link: ModelEditorState['links'][number]): void => {
    store.upsertLocalLink(link)
    materializedRevision.value += 1
  }

  onScopeDispose(() => {
    resetPartialScopes(null)
  })

  return {
    store,
    generation,
    materializedRevision,
    childrenLoading,
    childrenErrors,
    loadChildren,
    loadNextChildrenPage,
    refreshChildrenScope,
    refreshVisibleChildrenScope,
    prepareVisibleChildrenScopeRefresh,
    ensureChildrenScopeComplete,
    abortInFlightScopes,
    resetPartialScopes,
    mergeFullLinks,
    discardRemoteCascadeConflictLinks,
    mergePartialEntities,
    syncLocalNode,
    syncLocalLink,
    reconcileMaterializedRows,
    invalidateChildrenScope,
    materializedChildrenScopes,
    publishMaterializedRows: publishRows,
  }
}
