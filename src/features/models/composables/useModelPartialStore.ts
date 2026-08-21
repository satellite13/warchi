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
  const sessions = new Map<string, ScopeRequestSession>()
  const inFlight = new Map<string, { promise: Promise<void> }>()
  let modelId: string | null = null

  const publishRows = (): void => {
    state.value = {
      ...state.value,
      nodes: store.nodes,
      links: store.links,
    }
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
    setLoading(scopeKey, false)
    setError(scopeKey, null)
    store.invalidateChildrenScope(scope)
  }

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

  const mergePage = (
    scope: TreeParentScope,
    pageNumber: number,
    response: PaginatedResponse<NodeResponse>,
    session: ScopeRequestSession
  ): void => {
    // Tree operations still mutate compatible state arrays directly. Capture those local
    // materialized rows before every remote merge so the partial store remains merge owner.
    captureMaterializedRows()
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
    return loadPage(scope, 0, true)
  }

  const ensureChildrenScopeComplete = async (scope: TreeParentScope): Promise<void> => {
    const scopeKey = store.scopeKey(scope)
    while (!store.loadedChildrenFor.has(scopeKey)) {
      await loadNextChildrenPage(scope)
      if (childrenErrors.value.has(scopeKey) || !store.childrenPages.get(scopeKey)) return
    }
  }

  const resetPartialScopes = (nextModelId: string | null, initial?: InitialChildrenScope): void => {
    for (const session of sessions.values()) session.controller.abort()
    sessions.clear()
    inFlight.clear()
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

  onScopeDispose(() => {
    resetPartialScopes(null)
  })

  return {
    store,
    generation,
    childrenLoading,
    childrenErrors,
    loadChildren,
    loadNextChildrenPage,
    refreshChildrenScope,
    ensureChildrenScopeComplete,
    resetPartialScopes,
    mergeFullLinks,
    mergePartialEntities,
    reconcileMaterializedRows,
    invalidateChildrenScope,
    publishMaterializedRows: publishRows,
  }
}
