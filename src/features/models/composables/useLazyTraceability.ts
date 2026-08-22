import { computed, onScopeDispose, ref, watch, type Ref } from 'vue'
import type {
  DiagramReferenceResponse,
  LinkResponse,
  NodeResponse,
} from '@/types/api'
import type {
  EditorGraphNeighbor,
  ModelPartialRequestGuard,
  TraceabilityBranchQuery,
  TraceabilityNeighborRef,
} from '../types'
import {
  paginatedContent,
  paginatedIsLastPage,
  paginatedTotalElements,
} from '@/utils/paginatedResponse'
import { fetchDiagramReferences, fetchGraphNeighbors } from './modelScopedApi'

const TRACEABILITY_PAGE_SIZE = 50

export type { TraceabilityBranchQuery, TraceabilityDirection } from '../types'

export type LazyTraceabilityPageState = {
  rows: TraceabilityNeighborRef[]
  loading: boolean
  error: string | null
  nextPage: number | null
  totalElements: number
  token: number
  generation: number
}

export type LazyTraceabilityBranchState = Omit<LazyTraceabilityPageState, 'rows'> & {
  rows: EditorGraphNeighbor[]
  failedPage: number | null
}

type DiagramPageState = {
  rows: DiagramReferenceResponse[]
  loading: boolean
  error: string | null
  nextPage: number | null
  totalElements: number
  token: number
  generation: number
}

type RequestSession = {
  controller: AbortController
  generation: number
  modelId: string
  token: number
}

export function lazyTraceabilityBranchPageKey(
  query: TraceabilityBranchQuery,
  page: number
): string {
  return [
    encodeURIComponent(query.nodeId),
    query.direction,
    query.linkTypeId ? encodeURIComponent(query.linkTypeId) : '*',
    page,
  ].join('|')
}

const diagramPageKey = (nodeId: string, page: number): string =>
  `${encodeURIComponent(nodeId)}|${page}`

const messageFrom = (caught: unknown, fallback: string): string =>
  caught instanceof Error ? caught.message : fallback

const uniqueNeighborRefs = (
  states: readonly LazyTraceabilityPageState[]
): TraceabilityNeighborRef[] => {
  const rows = new Map<string, TraceabilityNeighborRef>()
  for (const state of states) {
    for (const row of state.rows) rows.set(row.linkId, row)
  }
  return [...rows.values()]
}

const uniqueDiagrams = (states: readonly DiagramPageState[]): DiagramReferenceResponse[] => {
  const rows = new Map<string, DiagramReferenceResponse>()
  for (const state of states) {
    for (const row of state.rows) rows.set(row.id, row)
  }
  return [...rows.values()]
}

export function useLazyTraceability(options: {
  modelId: Ref<string | null>
  authoritativeRevision: Ref<number>
  diagramRevision: Ref<number>
  beginRequest: (requestKey: string) => ModelPartialRequestGuard
  isRequestCurrent: (guard: ModelPartialRequestGuard) => boolean
  mergePartialEntities: (
    nodes: readonly NodeResponse[],
    links: readonly LinkResponse[],
    guard: ModelPartialRequestGuard
  ) => boolean
  resolveBranchRows: (
    rowIds: readonly TraceabilityNeighborRef[],
    query: TraceabilityBranchQuery
  ) => EditorGraphNeighbor[]
  resolveDiagramReferences: (
    remoteRows: readonly DiagramReferenceResponse[],
    selectedNodeId: string
  ) => DiagramReferenceResponse[]
}) {
  const generation = ref(0)
  const branchGeneration = ref(0)
  const diagramGeneration = ref(0)
  const branchPages = ref(new Map<string, LazyTraceabilityPageState>())
  const diagramPages = ref(new Map<string, DiagramPageState>())
  const branchSessions = new Map<string, RequestSession>()
  const diagramSessions = new Map<string, RequestSession>()
  let diagramRefreshPromise: Promise<void> | null = null
  let diagramRefreshQueued = false
  let diagramToken = 0
  let selectedRootId: string | null = null

  const replaceBranchPage = (key: string, state: LazyTraceabilityPageState): void => {
    const next = new Map(branchPages.value)
    next.set(key, state)
    branchPages.value = next
  }

  const replaceDiagramPage = (key: string, state: DiagramPageState): void => {
    const next = new Map(diagramPages.value)
    next.set(key, state)
    diagramPages.value = next
  }

  const abortSessions = (): void => {
    for (const session of branchSessions.values()) session.controller.abort()
    for (const session of diagramSessions.values()) session.controller.abort()
    branchSessions.clear()
    diagramSessions.clear()
  }

  const invalidateBranches = (): void => {
    branchGeneration.value += 1
    for (const session of branchSessions.values()) session.controller.abort()
    branchSessions.clear()
    branchPages.value = new Map()
  }

  const reset = (): void => {
    generation.value += 1
    branchGeneration.value += 1
    diagramGeneration.value += 1
    abortSessions()
    branchPages.value = new Map()
    diagramPages.value = new Map()
    diagramRefreshQueued = false
    diagramRefreshPromise = null
    selectedRootId = null
  }

  const branchPageEntries = (
    query: TraceabilityBranchQuery
  ): Array<[number, LazyTraceabilityPageState]> => {
    const entries: Array<[number, LazyTraceabilityPageState]> = []
    for (let page = 0; ; page += 1) {
      const state = branchPages.value.get(lazyTraceabilityBranchPageKey(query, page))
      if (!state) break
      entries.push([page, state])
    }
    return entries
  }

  const getBranchState = (query: TraceabilityBranchQuery): LazyTraceabilityBranchState => {
    void options.authoritativeRevision.value
    const entries = branchPageEntries(query)
    const states = entries.map(([, state]) => state)
    const failed = entries.find(([, state]) => state.error !== null)
    const last = states[states.length - 1]
    const rows = options.resolveBranchRows(uniqueNeighborRefs(states), query)
    return {
      rows,
      loading: states.some(state => state.loading),
      error: failed?.[1].error ?? null,
      failedPage: failed?.[0] ?? null,
      nextPage: last?.nextPage ?? (entries.length === 0 ? 0 : null),
      totalElements: Math.max(last?.totalElements ?? 0, rows.length),
      token: last?.token ?? 0,
      generation: last?.generation ?? branchGeneration.value,
    }
  }

  const isBranchSessionCurrent = (
    key: string,
    session: RequestSession,
    guard: ModelPartialRequestGuard
  ): boolean =>
    branchGeneration.value === session.generation &&
    options.modelId.value === session.modelId &&
    branchSessions.get(key) === session &&
    options.isRequestCurrent(guard)

  const loadBranchPage = async (
    query: TraceabilityBranchQuery,
    page: number,
    force = false
  ): Promise<boolean> => {
    const modelId = options.modelId.value
    if (!modelId) return false
    const key = lazyTraceabilityBranchPageKey(query, page)
    const existing = branchPages.value.get(key)
    if (branchSessions.has(key)) return false
    if (!force && existing && !existing.error && !existing.loading) return true

    const guard = options.beginRequest(`traceability:${key}`)
    const session: RequestSession = {
      controller: new AbortController(),
      generation: branchGeneration.value,
      modelId,
      token: guard.token,
    }
    branchSessions.set(key, session)
    replaceBranchPage(key, {
      rows: existing?.rows ?? [],
      loading: true,
      error: null,
      nextPage: existing?.nextPage ?? page,
      totalElements: existing?.totalElements ?? 0,
      token: guard.token,
      generation: session.generation,
    })

    try {
      const result = await fetchGraphNeighbors(modelId, query.nodeId, {
        direction: query.direction,
        ...(query.linkTypeId ? { linkTypeId: query.linkTypeId } : {}),
        page,
        size: TRACEABILITY_PAGE_SIZE,
        signal: session.controller.signal,
      })
      if (!isBranchSessionCurrent(key, session, guard)) return false
      if (!result.success) {
        replaceBranchPage(key, {
          ...branchPages.value.get(key)!,
          loading: false,
          error: result.error.message,
        })
        return false
      }

      const rows = paginatedContent(result.data)
      if (
        !options.mergePartialEntities(
          rows.map(row => row.node),
          rows.map(row => row.link),
          guard
        ) ||
        !isBranchSessionCurrent(key, session, guard)
      ) {
        return false
      }
      replaceBranchPage(key, {
        rows: rows.map(row => ({ linkId: row.link.id, nodeId: row.node.id })),
        loading: false,
        error: null,
        nextPage: paginatedIsLastPage(result.data, page) ? null : page + 1,
        totalElements: Math.max(paginatedTotalElements(result.data), rows.length),
        token: guard.token,
        generation: session.generation,
      })
      return true
    } catch (caught) {
      if (!isBranchSessionCurrent(key, session, guard)) return false
      replaceBranchPage(key, {
        ...branchPages.value.get(key)!,
        loading: false,
        error: messageFrom(caught, 'Не удалось загрузить ветку трассировки.'),
      })
      return false
    } finally {
      if (branchSessions.get(key) === session) branchSessions.delete(key)
    }
  }

  const isDiagramSessionCurrent = (key: string, session: RequestSession): boolean =>
    diagramGeneration.value === session.generation &&
    options.modelId.value === session.modelId &&
    diagramSessions.get(key) === session

  const loadDiagramPage = async (
    nodeId: string,
    page: number,
    force = false,
    replaceSnapshot = false
  ): Promise<boolean> => {
    const modelId = options.modelId.value
    if (!modelId) return false
    const key = diagramPageKey(nodeId, page)
    const existing = diagramPages.value.get(key)
    if (diagramSessions.has(key)) return false
    if (!force && existing && !existing.error && !existing.loading) return true

    const session: RequestSession = {
      controller: new AbortController(),
      generation: diagramGeneration.value,
      modelId,
      token: ++diagramToken,
    }
    diagramSessions.set(key, session)
    replaceDiagramPage(key, {
      rows: existing?.rows ?? [],
      loading: true,
      error: null,
      nextPage: existing?.nextPage ?? page,
      totalElements: existing?.totalElements ?? 0,
      token: session.token,
      generation: session.generation,
    })

    try {
      const result = await fetchDiagramReferences(modelId, nodeId, {
        page,
        size: TRACEABILITY_PAGE_SIZE,
        signal: session.controller.signal,
      })
      if (!isDiagramSessionCurrent(key, session)) return false
      if (!result.success) {
        replaceDiagramPage(key, {
          ...diagramPages.value.get(key)!,
          loading: false,
          error: result.error.message,
        })
        return false
      }
      const rows = paginatedContent(result.data)
      replaceDiagramPage(key, {
        rows,
        loading: false,
        error: null,
        nextPage: paginatedIsLastPage(result.data, page) ? null : page + 1,
        totalElements: Math.max(paginatedTotalElements(result.data), rows.length),
        token: session.token,
        generation: session.generation,
      })
      if (replaceSnapshot) {
        const next = new Map(diagramPages.value)
        for (const existingKey of next.keys()) {
          if (existingKey.startsWith(`${encodeURIComponent(nodeId)}|`) && existingKey !== key) {
            next.delete(existingKey)
          }
        }
        diagramPages.value = next
      }
      return true
    } catch (caught) {
      if (!isDiagramSessionCurrent(key, session)) return false
      replaceDiagramPage(key, {
        ...diagramPages.value.get(key)!,
        loading: false,
        error: messageFrom(caught, 'Не удалось загрузить ссылки на диаграммы.'),
      })
      return false
    } finally {
      if (diagramSessions.get(key) === session) diagramSessions.delete(key)
    }
  }

  const selectRoot = async (query: TraceabilityBranchQuery): Promise<void> => {
    reset()
    selectedRootId = query.nodeId
    await Promise.all([loadBranchPage(query, 0), loadDiagramPage(query.nodeId, 0)])
  }

  const loadRootBranch = (query: TraceabilityBranchQuery): Promise<boolean> =>
    selectedRootId === query.nodeId ? loadBranchPage(query, 0) : Promise.resolve(false)

  const changeFilter = (query: TraceabilityBranchQuery): Promise<boolean> => {
    if (selectedRootId !== query.nodeId) return Promise.resolve(false)
    invalidateBranches()
    return loadBranchPage(query, 0)
  }

  const loadBranch = (
    query: TraceabilityBranchQuery,
    currentPath: ReadonlySet<string>
  ): Promise<boolean> => {
    if (currentPath.has(query.nodeId)) return Promise.resolve(false)
    return loadBranchPage(query, 0)
  }

  const loadMore = (query: TraceabilityBranchQuery): Promise<boolean> => {
    const nextPage = getBranchState(query).nextPage
    return nextPage === null ? Promise.resolve(false) : loadBranchPage(query, nextPage)
  }

  const retry = (query: TraceabilityBranchQuery): Promise<boolean> => {
    const failedPage = getBranchState(query).failedPage
    return failedPage === null ? Promise.resolve(false) : loadBranchPage(query, failedPage, true)
  }

  const diagramStates = computed(() => {
    if (!selectedRootId) return [] as DiagramPageState[]
    const states: DiagramPageState[] = []
    for (let page = 0; ; page += 1) {
      const state = diagramPages.value.get(diagramPageKey(selectedRootId, page))
      if (!state) break
      states.push(state)
    }
    return states
  })
  const diagramReferences = computed(() => {
    void options.diagramRevision.value
    if (!selectedRootId) return []
    return options.resolveDiagramReferences(uniqueDiagrams(diagramStates.value), selectedRootId)
  })
  const diagramsLoading = computed(() => diagramStates.value.some(state => state.loading))
  const diagramsError = computed(
    () => diagramStates.value.find(state => state.error)?.error ?? null
  )
  const diagramsNextPage = computed(
    () => diagramStates.value[diagramStates.value.length - 1]?.nextPage ?? null
  )
  const diagramsTotalElements = computed(() =>
    Math.max(
      diagramStates.value[diagramStates.value.length - 1]?.totalElements ?? 0,
      diagramReferences.value.length
    )
  )

  const runDiagramRefresh = (): Promise<void> => {
    if (diagramRefreshPromise) {
      diagramRefreshQueued = true
      return diagramRefreshPromise
    }
    const nodeId = selectedRootId
    if (!nodeId) return Promise.resolve()
    diagramRefreshQueued = false
    const task = (async (): Promise<void> => {
      await loadDiagramPage(nodeId, 0, true, true)
    })()
    const completion = task.finally(() => {
      if (diagramRefreshPromise !== completion) return
      diagramRefreshPromise = null
      if (diagramRefreshQueued && selectedRootId === nodeId) void runDiagramRefresh()
    })
    diagramRefreshPromise = completion
    return completion
  }

  const invalidateDiagramReferences = (): void => {
    if (!selectedRootId) return
    diagramGeneration.value += 1
    for (const session of diagramSessions.values()) session.controller.abort()
    diagramSessions.clear()
    void runDiagramRefresh()
  }

  const waitForDiagramRefresh = async (): Promise<void> => {
    while (diagramRefreshPromise) {
      const current = diagramRefreshPromise
      await current
      if (diagramRefreshPromise === current) break
    }
  }

  const loadMoreDiagrams = (): Promise<boolean> => {
    if (!selectedRootId || diagramsNextPage.value === null) return Promise.resolve(false)
    return loadDiagramPage(selectedRootId, diagramsNextPage.value)
  }

  const retryDiagrams = (): Promise<boolean> => {
    if (!selectedRootId) return Promise.resolve(false)
    const failedPage = diagramStates.value.findIndex(state => state.error !== null)
    return failedPage < 0
      ? Promise.resolve(false)
      : loadDiagramPage(selectedRootId, failedPage, true)
  }

  watch(options.modelId, reset)
  watch(options.diagramRevision, invalidateDiagramReferences, { flush: 'sync' })
  onScopeDispose(reset)

  return {
    generation,
    branchPages,
    diagramPages,
    diagramReferences,
    diagramsLoading,
    diagramsError,
    diagramsNextPage,
    diagramsTotalElements,
    getBranchState,
    selectRoot,
    loadRootBranch,
    changeFilter,
    loadBranch,
    loadMore,
    retry,
    loadMoreDiagrams,
    retryDiagrams,
    invalidateDiagramReferences,
    waitForDiagramRefresh,
    reset,
  }
}
