import { computed, ref } from 'vue'
import { MODEL_TREE_PAGE_SIZE } from '@/api/queryHelpers'
import type { NodeResponse } from '@/types/api'
import type { TreeParentScope } from '../types'
import { paginatedContent, paginatedIsLastPage } from '@/utils/paginatedResponse'
import { fetchNodeChildren } from './modelScopedApi'

export type LazyFolderScopeState = {
  rows: NodeResponse[]
  nextPage: number
  hasMore: boolean
  loading: boolean
  error: string | null
  failedPage: number | null
  expanded: boolean
}

export type LazyFolderRow = {
  node: NodeResponse
  depth: number
}

const scopeKey = (scope: TreeParentScope): string =>
  scope.kind === 'root' ? 'root' : `node:${scope.nodeId}`

const emptyScope = (expanded = false): LazyFolderScopeState => ({
  rows: [],
  nextPage: 0,
  hasMore: true,
  loading: false,
  error: null,
  failedPage: null,
  expanded,
})

export function useLazyFolderTree() {
  const scopes = ref<Map<string, LazyFolderScopeState>>(new Map())
  const controllers = new Map<string, AbortController>()
  const requestTokens = new Map<string, number>()
  let modelId = ''
  let generation = 0

  const publishScope = (key: string, state: LazyFolderScopeState): void => {
    const next = new Map(scopes.value)
    next.set(key, state)
    scopes.value = next
  }

  const visibleRows = computed<LazyFolderRow[]>(() => {
    const rows: LazyFolderRow[] = []
    const visited = new Set<string>()
    const append = (scope: TreeParentScope, depth: number): void => {
      const state = scopes.value.get(scopeKey(scope))
      if (!state) return
      for (const node of state.rows) {
        if (visited.has(node.id)) continue
        visited.add(node.id)
        rows.push({ node, depth })
        const childState = scopes.value.get(`node:${node.id}`)
        if (childState?.expanded) append({ kind: 'node', nodeId: node.id }, depth + 1)
      }
    }
    append({ kind: 'root' }, 0)
    return rows
  })

  const setModel = (nextModelId: string): void => {
    if (nextModelId === modelId) return
    generation += 1
    modelId = nextModelId
    for (const controller of controllers.values()) controller.abort()
    controllers.clear()
    requestTokens.clear()
    scopes.value = new Map()
  }

  const loadScope = async (
    scope: TreeParentScope,
    page: number,
    restart = false
  ): Promise<void> => {
    if (!modelId) return
    const key = scopeKey(scope)
    const current = scopes.value.get(key) ?? emptyScope(scope.kind === 'root')
    if (current.loading) return
    const token = (requestTokens.get(key) ?? 0) + 1
    requestTokens.set(key, token)
    controllers.get(key)?.abort()
    const controller = new AbortController()
    controllers.set(key, controller)
    const requestedModelId = modelId
    const requestedGeneration = generation
    publishScope(key, {
      ...(restart ? emptyScope(current.expanded) : current),
      loading: true,
      error: null,
    })

    try {
      const result = await fetchNodeChildren(requestedModelId, scope, {
        page,
        size: MODEL_TREE_PAGE_SIZE,
        foldersOnly: true,
        signal: controller.signal,
      })
      if (
        controller.signal.aborted ||
        requestedGeneration !== generation ||
        requestedModelId !== modelId ||
        requestTokens.get(key) !== token
      ) {
        return
      }
      const latest = scopes.value.get(key) ?? emptyScope(scope.kind === 'root')
      if (!result.success) {
        publishScope(key, {
          ...latest,
          loading: false,
          error: result.error.message,
          failedPage: page,
        })
        return
      }
      const merged = restart || page === 0 ? [] : [...latest.rows]
      const knownIds = new Set(merged.map(row => row.id))
      for (const row of paginatedContent(result.data)) {
        if (!knownIds.has(row.id)) {
          knownIds.add(row.id)
          merged.push(row)
        }
      }
      publishScope(key, {
        ...latest,
        rows: merged,
        nextPage: page + 1,
        hasMore: !paginatedIsLastPage(result.data, page),
        loading: false,
        error: null,
        failedPage: null,
      })
    } catch (error) {
      if (
        !controller.signal.aborted &&
        requestedGeneration === generation &&
        requestedModelId === modelId &&
        requestTokens.get(key) === token
      ) {
        const latest = scopes.value.get(key) ?? emptyScope(scope.kind === 'root')
        publishScope(key, {
          ...latest,
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to load folders',
          failedPage: page,
        })
      }
    } finally {
      if (controllers.get(key) === controller) controllers.delete(key)
    }
  }

  const loadRoot = (): Promise<void> => {
    const root = scopes.value.get('root')
    if (root && (root.loading || (root.nextPage > 0 && !root.error))) return Promise.resolve()
    return loadScope({ kind: 'root' }, 0, true)
  }

  const toggleFolder = async (nodeId: string): Promise<void> => {
    const key = `node:${nodeId}`
    const current = scopes.value.get(key) ?? emptyScope()
    const expanded = !current.expanded
    publishScope(key, { ...current, expanded })
    if (expanded && current.nextPage === 0) {
      await loadScope({ kind: 'node', nodeId }, 0, true)
    }
  }

  const loadMore = (scope: TreeParentScope): Promise<void> => {
    const state = scopes.value.get(scopeKey(scope)) ?? emptyScope(scope.kind === 'root')
    if (!state.hasMore || state.loading) return Promise.resolve()
    return loadScope(scope, state.nextPage)
  }

  const retry = (scope: TreeParentScope): Promise<void> => {
    const state = scopes.value.get(scopeKey(scope)) ?? emptyScope(scope.kind === 'root')
    const page = state.failedPage ?? 0
    return loadScope(scope, page, page === 0)
  }

  return {
    scopes,
    visibleRows,
    setModel,
    loadRoot,
    toggleFolder,
    loadMore,
    retry,
  }
}
