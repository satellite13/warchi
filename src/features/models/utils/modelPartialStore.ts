import type {
  ChildrenPageState,
  EditorLink,
  EditorNode,
  EntityMergeMode,
  ModelPartialRequestGuard,
  TreeParentScope,
} from '../types'
import { mergeEntityListFromRemote, type MergeableEntity } from './modelEntityMerge'

type InternalChildrenPageState = ChildrenPageState & {
  token: number
  lastPage: number | null
  pageIds: Map<number, string[]>
}

const isProtectedLocal = (entity: MergeableEntity | undefined): boolean =>
  entity?._isNew === true || entity?._isDirty === true || entity?._isDeleted === true

const uniqueRowsById = <T extends MergeableEntity>(rows: readonly T[]): T[] => {
  const unique = new Map<string, T>()
  for (const row of rows) {
    const previous = unique.get(row.id)
    if (isProtectedLocal(previous) && !isProtectedLocal(row)) continue
    unique.set(row.id, row)
  }
  return [...unique.values()]
}

export class ModelPartialStore {
  generation = 0
  nodes: EditorNode[] = []
  links: EditorLink[] = []

  readonly nodeById = new Map<string, EditorNode>()
  readonly linkById = new Map<string, EditorLink>()
  readonly childrenByParent = new Map<string, string[]>()
  readonly childrenPages = new Map<string, ChildrenPageState>()
  readonly loadedChildrenFor = new Set<string>()
  readonly remoteDeletedNodeIds = new Set<string>()
  readonly remoteDeletedLinkIds = new Set<string>()
  readonly staleLinkIds = new Set<string>()
  /** Dirty/new incident links preserved after a remote node FK cascade. */
  readonly remoteCascadeConflictLinkIds = new Set<string>()

  private readonly requestTokens = new Map<string, number>()
  private readonly childrenScopeMutationVersions = new Map<string, number>()
  private readonly internalChildrenPages = new Map<string, InternalChildrenPageState>()
  /** Explicit materialization provenance; root cannot be reconstructed from parentNodeId. */
  private readonly treeScopeKeyByNodeId = new Map<string, string>()
  private rootParentNodeId: string | null | undefined

  scopeKey(scope: TreeParentScope): string {
    return scope.kind === 'root' ? 'root' : `node:${scope.nodeId}`
  }

  setRootParentNodeId(nodeId: string | null | undefined): void {
    this.rootParentNodeId = nodeId
  }

  treeScopeForParentNodeId(parentNodeId: string | null | undefined): TreeParentScope {
    return parentNodeId == null || parentNodeId === this.rootParentNodeId
      ? { kind: 'root' }
      : { kind: 'node', nodeId: parentNodeId }
  }

  treeScopeForNode(nodeId: string): TreeParentScope | null {
    const scopeKey = this.treeScopeKeyByNodeId.get(nodeId)
    if (!scopeKey) return null
    return scopeKey === 'root'
      ? { kind: 'root' }
      : { kind: 'node', nodeId: scopeKey.slice('node:'.length) }
  }

  isChildrenScopeKnown(scope: TreeParentScope): boolean {
    const scopeKey = this.scopeKey(scope)
    return (
      this.childrenPages.has(scopeKey) ||
      this.loadedChildrenFor.has(scopeKey) ||
      this.childrenByParent.has(scopeKey)
    )
  }

  isChildrenScopeLoaded(scope: TreeParentScope): boolean {
    return this.loadedChildrenFor.has(this.scopeKey(scope))
  }

  prepareChildrenScopeRefresh(scope: TreeParentScope): void {
    const scopeKey = this.scopeKey(scope)
    const scopedIds = new Set(this.childrenByParent.get(scopeKey) ?? [])
    this.replaceNodes(
      this.nodes.filter(row => !scopedIds.has(row.id) || isProtectedLocal(row))
    )
  }

  beginRequest(requestKey: string): ModelPartialRequestGuard {
    const token = (this.requestTokens.get(requestKey) ?? 0) + 1
    this.requestTokens.set(requestKey, token)
    return { generation: this.generation, requestKey, token }
  }

  beginChildrenRequest(scope: TreeParentScope): ModelPartialRequestGuard {
    const scopeKey = this.scopeKey(scope)
    this.markChildrenScopeMutation(scopeKey)
    const request = this.beginRequest(this.childrenRequestKey(scopeKey))
    this.internalChildrenPages.delete(scopeKey)
    this.childrenPages.delete(scopeKey)
    this.loadedChildrenFor.delete(scopeKey)
    return request
  }

  isRequestCurrent(guard: ModelPartialRequestGuard): boolean {
    return (
      guard.generation === this.generation &&
      this.requestTokens.get(guard.requestKey) === guard.token
    )
  }

  childrenScopeMutationVersion(scope: TreeParentScope | string): number {
    const scopeKey = typeof scope === 'string' ? scope : this.scopeKey(scope)
    return this.childrenScopeMutationVersions.get(scopeKey) ?? 0
  }

  markChildrenScopeMutation(scope: TreeParentScope | string): number {
    const scopeKey = typeof scope === 'string' ? scope : this.scopeKey(scope)
    const next = this.childrenScopeMutationVersion(scopeKey) + 1
    this.childrenScopeMutationVersions.set(scopeKey, next)
    return next
  }

  reset(): void {
    this.generation += 1
    this.nodes = []
    this.links = []
    this.nodeById.clear()
    this.linkById.clear()
    this.childrenByParent.clear()
    this.childrenPages.clear()
    this.loadedChildrenFor.clear()
    this.remoteDeletedNodeIds.clear()
    this.remoteDeletedLinkIds.clear()
    this.staleLinkIds.clear()
    this.remoteCascadeConflictLinkIds.clear()
    this.requestTokens.clear()
    this.childrenScopeMutationVersions.clear()
    this.internalChildrenPages.clear()
    this.treeScopeKeyByNodeId.clear()
    this.rootParentNodeId = undefined
  }

  mergeNodes(
    remoteRows: readonly EditorNode[],
    mode: EntityMergeMode,
    guard?: ModelPartialRequestGuard
  ): boolean {
    if (!this.accepts(mode, guard)) return false
    const rows = remoteRows.filter(row => !this.remoteDeletedNodeIds.has(row.id))
    if (mode.kind === 'childrenPage' && mode.scope.kind === 'root') {
      const parentIds = new Set(rows.map(row => row.parentNodeId ?? null))
      if (parentIds.size === 1) this.rootParentNodeId = parentIds.values().next().value
    }

    if (mode.kind === 'full') {
      const merged = mergeEntityListFromRemote(this.nodes, rows, row => row)
      this.resetChildrenScopeState()
      this.treeScopeKeyByNodeId.clear()
      this.replaceNodes(merged.items)
      this.materializeAuthoritativeEmptyScopes(rows)
      return true
    }

    if (mode.kind === 'childrenScope') {
      const scopeKey = this.scopeKey(mode.scope)
      if (!this.loadedChildrenFor.has(scopeKey)) return false
      const localIds = new Set(this.childrenByParent.get(scopeKey) ?? [])
      const remoteIds = new Set(rows.map(row => row.id))
      const protectedOutsideIds = new Set(
        this.nodes
          .filter(row => !localIds.has(row.id) && remoteIds.has(row.id) && isProtectedLocal(row))
          .map(row => row.id)
      )
      const localRows = this.nodes.filter(
        row => localIds.has(row.id) || protectedOutsideIds.has(row.id)
      )
      const merged = mergeEntityListFromRemote(localRows, rows, row => row)
      const scopedIds = new Set(merged.items.map(row => row.id))
      const retainedOutsideScope = this.nodes.filter(
        row => !localIds.has(row.id) && !scopedIds.has(row.id)
      )
      for (const id of localIds) {
        if (!scopedIds.has(id)) this.treeScopeKeyByNodeId.delete(id)
      }
      for (const row of merged.items) {
        if (!protectedOutsideIds.has(row.id)) {
          this.treeScopeKeyByNodeId.set(row.id, scopeKey)
        }
      }
      this.replaceNodes([...retainedOutsideScope, ...merged.items])
      this.materializeAuthoritativeEmptyScopes(rows)
      return true
    }

    const acceptedRemoteIds = this.upsertPartialNodes(rows)
    if (mode.kind === 'childrenPage') {
      const scopeKey = this.scopeKey(mode.scope)
      for (const row of rows) {
        if (acceptedRemoteIds.has(row.id)) {
          this.treeScopeKeyByNodeId.set(row.id, scopeKey)
        }
      }
      this.rebuildNodeIndexes()
      this.recordChildrenPage(
        scopeKey,
        mode,
        rows.map(row => row.id)
      )
    }
    this.materializeAuthoritativeEmptyScopes(rows)
    return true
  }

  mergeLinks(
    remoteRows: readonly EditorLink[],
    mode: Extract<EntityMergeMode, { kind: 'partial' | 'full' }>,
    guard?: ModelPartialRequestGuard
  ): boolean {
    if (!this.accepts(mode, guard)) return false
    const rows = remoteRows.filter(row => !this.remoteDeletedLinkIds.has(row.id))
    if (mode.kind === 'full') {
      const merged = mergeEntityListFromRemote(this.links, rows, row => row)
      this.replaceLinks(merged.items)
      return true
    }

    const next = [...this.links]
    const positions = new Map(next.map((row, index) => [row.id, index]))
    for (const row of rows) {
      const index = positions.get(row.id)
      if (index === undefined) {
        positions.set(row.id, next.length)
        next.push(row)
      } else if (!isProtectedLocal(next[index])) {
        next[index] = row
      }
    }
    this.replaceLinks(next)
    return true
  }

  deleteRemoteNode(nodeId: string): void {
    this.remoteDeletedNodeIds.add(nodeId)
    const local = this.nodeById.get(nodeId)
    if (isProtectedLocal(local)) return
    this.treeScopeKeyByNodeId.delete(nodeId)
    this.replaceNodes(this.nodes.filter(row => row.id !== nodeId))
  }

  deleteRemoteLink(linkId: string, options?: { force?: boolean }): void {
    this.remoteDeletedLinkIds.add(linkId)
    const local = this.linkById.get(linkId)
    if (local?._isDirty || local?._isNew) {
      if (options?.force === true) this.remoteCascadeConflictLinkIds.add(linkId)
      return
    }
    if (isProtectedLocal(local)) return
    this.replaceLinks(this.links.filter(row => row.id !== linkId))
  }

  deleteRemoteIncidentLinks(nodeId: string): string[] {
    const incidentIds = this.links
      .filter(link => link.sourceId === nodeId || link.targetId === nodeId)
      .map(link => link.id)
    for (const linkId of incidentIds) {
      this.deleteRemoteLink(linkId, { force: true })
    }
    return incidentIds
  }

  discardRemoteCascadeConflictLinks(): void {
    const conflictedIds = new Set(this.remoteCascadeConflictLinkIds)
    this.replaceLinks(this.links.filter(row => !conflictedIds.has(row.id)))
    this.remoteCascadeConflictLinkIds.clear()
  }

  clearRemoteNodeTombstone(nodeId: string): void {
    this.remoteDeletedNodeIds.delete(nodeId)
  }

  clearRemoteLinkTombstone(linkId: string): void {
    this.remoteDeletedLinkIds.delete(linkId)
    this.remoteCascadeConflictLinkIds.delete(linkId)
  }

  markLinkStale(linkId: string): void {
    if (this.linkById.has(linkId)) this.staleLinkIds.add(linkId)
  }

  clearLinkStale(linkId: string): void {
    this.staleLinkIds.delete(linkId)
  }

  replaceMaterializedRows(nodes: readonly EditorNode[], links: readonly EditorLink[]): void {
    this.replaceNodes([...nodes])
    this.replaceLinks([...links])
  }

  reconcileMaterializedRows(
    nodes: readonly EditorNode[],
    links: readonly EditorLink[],
    affectedScopes: readonly TreeParentScope[] | 'all' = 'all'
  ): void {
    const previouslyComplete = new Set(this.loadedChildrenFor)
    const trackedScopes = new Set([
      ...this.childrenPages.keys(),
      ...this.internalChildrenPages.keys(),
      ...previouslyComplete,
    ])
    const affectedScopeKeys =
      affectedScopes === 'all'
        ? trackedScopes
        : new Set(affectedScopes.map(scope => this.scopeKey(scope)))
    this.treeScopeKeyByNodeId.clear()
    this.replaceMaterializedRows(nodes, links)
    for (const linkId of this.remoteCascadeConflictLinkIds) {
      const link = this.linkById.get(linkId)
      if (!link || (!link._isDirty && !link._isNew)) {
        this.remoteCascadeConflictLinkIds.delete(linkId)
      }
    }
    for (const scopeKey of affectedScopeKeys) {
      this.invalidateChildrenScope(scopeKey)
    }
    for (const scopeKey of affectedScopeKeys) {
      if (previouslyComplete.has(scopeKey)) this.rebuildCompleteChildrenScope(scopeKey)
    }
    this.materializeAuthoritativeEmptyScopes(this.nodes)
  }

  private accepts(mode: EntityMergeMode, guard?: ModelPartialRequestGuard): boolean {
    if (guard && !this.isRequestCurrent(guard)) return false
    if (mode.kind === 'childrenPage' || mode.kind === 'childrenScope') {
      const requestKey = this.childrenRequestKey(this.scopeKey(mode.scope))
      if (this.requestTokens.get(requestKey) !== mode.token) return false
      if (guard && guard.token !== mode.token) return false
    }
    return true
  }

  private childrenRequestKey(scopeKey: string): string {
    return `children:${scopeKey}`
  }

  private resetChildrenScopeState(): void {
    this.childrenPages.clear()
    this.internalChildrenPages.clear()
    this.loadedChildrenFor.clear()
    for (const requestKey of this.requestTokens.keys()) {
      if (requestKey.startsWith('children:')) {
        this.requestTokens.delete(requestKey)
      }
    }
  }

  invalidateChildrenScope(scope: TreeParentScope | string): void {
    const scopeKey = typeof scope === 'string' ? scope : this.scopeKey(scope)
    this.markChildrenScopeMutation(scopeKey)
    this.childrenPages.delete(scopeKey)
    this.internalChildrenPages.delete(scopeKey)
    this.loadedChildrenFor.delete(scopeKey)
    const requestKey = this.childrenRequestKey(scopeKey)
    this.requestTokens.set(requestKey, (this.requestTokens.get(requestKey) ?? 0) + 1)
  }

  private rebuildCompleteChildrenScope(scopeKey: string): void {
    const rowIds = [...(this.childrenByParent.get(scopeKey) ?? [])]
    if (!this.childrenByParent.has(scopeKey)) this.childrenByParent.set(scopeKey, [])
    const token = this.requestTokens.get(this.childrenRequestKey(scopeKey)) ?? 0
    this.internalChildrenPages.set(scopeKey, {
      token,
      loadedPages: new Set([0]),
      nextPage: null,
      totalElements: rowIds.length,
      lastPage: 0,
      pageIds: new Map([[0, rowIds]]),
    })
    this.childrenPages.set(scopeKey, {
      loadedPages: new Set([0]),
      nextPage: null,
      totalElements: rowIds.length,
    })
    this.loadedChildrenFor.add(scopeKey)
  }

  private materializeAuthoritativeEmptyScopes(rows: readonly EditorNode[]): void {
    for (const row of rows) {
      if (row.hasChildren === false) this.rebuildCompleteChildrenScope(`node:${row.id}`)
    }
  }

  private defaultScopeKey(row: EditorNode): string {
    return row.parentNodeId == null || row.parentNodeId === this.rootParentNodeId
      ? this.scopeKey({ kind: 'root' })
      : `node:${row.parentNodeId}`
  }

  private upsertPartialNodes(rows: readonly EditorNode[]): Set<string> {
    const next = [...this.nodes]
    const positions = new Map(next.map((row, index) => [row.id, index]))
    const acceptedRemoteIds = new Set<string>()
    for (const row of rows) {
      const index = positions.get(row.id)
      if (index === undefined) {
        positions.set(row.id, next.length)
        next.push(row)
        acceptedRemoteIds.add(row.id)
        this.treeScopeKeyByNodeId.set(row.id, this.defaultScopeKey(row))
      } else if (!isProtectedLocal(next[index])) {
        const previous = next[index]
        next[index] = row
        acceptedRemoteIds.add(row.id)
        if (
          !previous ||
          previous.parentNodeId !== row.parentNodeId ||
          !this.treeScopeKeyByNodeId.has(row.id)
        ) {
          this.treeScopeKeyByNodeId.set(row.id, this.defaultScopeKey(row))
        }
      }
    }
    this.replaceNodes(next)
    return acceptedRemoteIds
  }

  private recordChildrenPage(
    scopeKey: string,
    mode: Extract<EntityMergeMode, { kind: 'childrenPage' }>,
    rowIds: string[]
  ): void {
    let state = this.internalChildrenPages.get(scopeKey)
    if (!state || state.token !== mode.token) {
      state = {
        token: mode.token,
        loadedPages: new Set(),
        nextPage: 0,
        totalElements: mode.total,
        lastPage: null,
        pageIds: new Map(),
      }
      this.internalChildrenPages.set(scopeKey, state)
    }
    state.loadedPages.add(mode.page)
    state.pageIds.set(mode.page, rowIds)
    state.totalElements = mode.total
    if (mode.last) state.lastPage = mode.page

    const hasAllPages =
      state.lastPage !== null &&
      Array.from({ length: state.lastPage + 1 }, (_, page) => page).every(page =>
        state?.loadedPages.has(page)
      )
    const uniqueLoadedIds = new Set([...state.pageIds.values()].flat())
    const complete = hasAllPages && uniqueLoadedIds.size >= state.totalElements
    state.nextPage = complete ? null : Math.max(...state.loadedPages) + 1
    if (complete) {
      this.loadedChildrenFor.add(scopeKey)
    } else {
      this.loadedChildrenFor.delete(scopeKey)
    }
    this.childrenPages.set(scopeKey, {
      loadedPages: new Set(state.loadedPages),
      nextPage: state.nextPage,
      totalElements: state.totalElements,
    })
  }

  private replaceNodes(rows: EditorNode[]): void {
    this.nodes = uniqueRowsById(rows)
    const ids = new Set(this.nodes.map(row => row.id))
    for (const row of this.nodes) {
      if (!this.treeScopeKeyByNodeId.has(row.id)) {
        this.treeScopeKeyByNodeId.set(row.id, this.defaultScopeKey(row))
      }
    }
    for (const id of this.treeScopeKeyByNodeId.keys()) {
      if (!ids.has(id)) this.treeScopeKeyByNodeId.delete(id)
    }
    this.rebuildNodeIndexes()
  }

  private rebuildNodeIndexes(): void {
    this.nodeById.clear()
    this.childrenByParent.clear()
    for (const row of this.nodes) {
      this.nodeById.set(row.id, row)
      const parentKey = this.treeScopeKeyByNodeId.get(row.id) ?? this.defaultScopeKey(row)
      const children = this.childrenByParent.get(parentKey)
      if (children) {
        children.push(row.id)
      } else {
        this.childrenByParent.set(parentKey, [row.id])
      }
    }
  }

  private replaceLinks(rows: EditorLink[]): void {
    this.links = uniqueRowsById(rows)
    this.linkById.clear()
    for (const row of this.links) {
      this.linkById.set(row.id, row)
    }
  }
}
