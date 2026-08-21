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
}) {
  const generation = ref(0)
  const branchPages = ref(new Map<string, LazyTraceabilityPageState>())
  const diagramPages = ref(new Map<string, DiagramPageState>())
  const branchSessions = new Map<string, RequestSession>()
  const diagramSessions = new Map<string, RequestSession>()
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

  const reset = (): void => {
    generation.value += 1
    abortSessions()
    branchPages.value = new Map()
    diagramPages.value = new Map()
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
      generation: last?.generation ?? generation.value,
    }
  }

  const isBranchSessionCurrent = (
    key: string,
    session: RequestSession,
    guard: ModelPartialRequestGuard
  ): boolean =>
    generation.value === session.generation &&
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
      generation: generation.value,
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
    generation.value === session.generation &&
    options.modelId.value === session.modelId &&
    diagramSessions.get(key) === session

  const loadDiagramPage = async (nodeId: string, page: number, force = false): Promise<boolean> => {
    const modelId = options.modelId.value
    if (!modelId) return false
    const key = diagramPageKey(nodeId, page)
    const existing = diagramPages.value.get(key)
    if (diagramSessions.has(key)) return false
    if (!force && existing && !existing.error && !existing.loading) return true

    const session: RequestSession = {
      controller: new AbortController(),
      generation: generation.value,
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
  const diagramReferences = computed(() => uniqueDiagrams(diagramStates.value))
  const diagramsLoading = computed(() => diagramStates.value.some(state => state.loading))
  const diagramsError = computed(
    () => diagramStates.value.find(state => state.error)?.error ?? null
  )
  const diagramsNextPage = computed(
    () => diagramStates.value[diagramStates.value.length - 1]?.nextPage ?? null
  )
  const diagramsTotalElements = computed(
    () => diagramStates.value[diagramStates.value.length - 1]?.totalElements ?? 0
  )

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
    loadBranch,
    loadMore,
    retry,
    loadMoreDiagrams,
    retryDiagrams,
    reset,
  }
}
