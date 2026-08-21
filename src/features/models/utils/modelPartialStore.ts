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

  private readonly requestTokens = new Map<string, number>()
  private readonly internalChildrenPages = new Map<string, InternalChildrenPageState>()
  private readonly treeParentKeyByNodeId = new Map<string, string>()

  scopeKey(scope: TreeParentScope): string {
    return scope.kind === 'root' ? 'root' : `node:${scope.nodeId}`
  }

  beginRequest(requestKey: string): ModelPartialRequestGuard {
    const token = (this.requestTokens.get(requestKey) ?? 0) + 1
    this.requestTokens.set(requestKey, token)
    return { generation: this.generation, requestKey, token }
  }

  beginChildrenRequest(scope: TreeParentScope): ModelPartialRequestGuard {
    const scopeKey = this.scopeKey(scope)
    const request = this.beginRequest(this.childrenRequestKey(scopeKey))
    this.internalChildrenPages.delete(scopeKey)
    this.childrenPages.delete(scopeKey)
    this.loadedChildrenFor.delete(scopeKey)
    return request
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
    this.requestTokens.clear()
    this.internalChildrenPages.clear()
    this.treeParentKeyByNodeId.clear()
  }

  mergeNodes(
    remoteRows: readonly EditorNode[],
    mode: EntityMergeMode,
    guard?: ModelPartialRequestGuard
  ): boolean {
    if (!this.accepts(mode, guard)) return false
    const rows = remoteRows.filter(row => !this.remoteDeletedNodeIds.has(row.id))

    if (mode.kind === 'full') {
      const merged = mergeEntityListFromRemote(this.nodes, rows, row => row)
      this.treeParentKeyByNodeId.clear()
      this.replaceNodes(merged.items)
      return true
    }

    if (mode.kind === 'childrenScope') {
      const scopeKey = this.scopeKey(mode.scope)
      if (!this.loadedChildrenFor.has(scopeKey)) return false
      const localIds = new Set(this.childrenByParent.get(scopeKey) ?? [])
      const localRows = this.nodes.filter(row => localIds.has(row.id))
      const merged = mergeEntityListFromRemote(localRows, rows, row => row)
      const scopedIds = new Set(merged.items.map(row => row.id))
      const retainedOutsideScope = this.nodes.filter(row => !localIds.has(row.id))
      for (const id of localIds) {
        if (!scopedIds.has(id)) this.treeParentKeyByNodeId.delete(id)
      }
      for (const row of merged.items) {
        this.treeParentKeyByNodeId.set(row.id, scopeKey)
      }
      this.replaceNodes([...retainedOutsideScope, ...merged.items])
      return true
    }

    this.upsertPartialNodes(rows)
    if (mode.kind === 'childrenPage') {
      const scopeKey = this.scopeKey(mode.scope)
      for (const row of rows) {
        this.treeParentKeyByNodeId.set(row.id, scopeKey)
      }
      this.rebuildNodeIndexes()
      this.recordChildrenPage(
        scopeKey,
        mode,
        rows.map(row => row.id)
      )
    }
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
    this.treeParentKeyByNodeId.delete(nodeId)
    this.replaceNodes(this.nodes.filter(row => row.id !== nodeId))
  }

  deleteRemoteLink(linkId: string): void {
    this.remoteDeletedLinkIds.add(linkId)
    const local = this.linkById.get(linkId)
    if (isProtectedLocal(local)) return
    this.replaceLinks(this.links.filter(row => row.id !== linkId))
  }

  clearRemoteNodeTombstone(nodeId: string): void {
    this.remoteDeletedNodeIds.delete(nodeId)
  }

  clearRemoteLinkTombstone(linkId: string): void {
    this.remoteDeletedLinkIds.delete(linkId)
  }

  private accepts(mode: EntityMergeMode, guard?: ModelPartialRequestGuard): boolean {
    if (guard) {
      if (guard.generation !== this.generation) return false
      if (this.requestTokens.get(guard.requestKey) !== guard.token) return false
    }
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

  private inferredParentKey(row: EditorNode): string {
    return row.parentNodeId == null ? this.scopeKey({ kind: 'root' }) : `node:${row.parentNodeId}`
  }

  private upsertPartialNodes(rows: readonly EditorNode[]): void {
    const next = [...this.nodes]
    const positions = new Map(next.map((row, index) => [row.id, index]))
    for (const row of rows) {
      const index = positions.get(row.id)
      if (index === undefined) {
        positions.set(row.id, next.length)
        next.push(row)
        this.treeParentKeyByNodeId.set(row.id, this.inferredParentKey(row))
      } else if (!isProtectedLocal(next[index])) {
        next[index] = row
        this.treeParentKeyByNodeId.set(row.id, this.inferredParentKey(row))
      }
    }
    this.replaceNodes(next)
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
    this.nodes = rows
    const ids = new Set(rows.map(row => row.id))
    for (const id of this.treeParentKeyByNodeId.keys()) {
      if (!ids.has(id)) this.treeParentKeyByNodeId.delete(id)
    }
    this.rebuildNodeIndexes()
  }

  private rebuildNodeIndexes(): void {
    this.nodeById.clear()
    this.childrenByParent.clear()
    for (const row of this.nodes) {
      this.nodeById.set(row.id, row)
      const parentKey = this.treeParentKeyByNodeId.get(row.id) ?? this.inferredParentKey(row)
      const children = this.childrenByParent.get(parentKey)
      if (children) {
        children.push(row.id)
      } else {
        this.childrenByParent.set(parentKey, [row.id])
      }
    }
  }

  private replaceLinks(rows: EditorLink[]): void {
    this.links = rows
    this.linkById.clear()
    for (const row of rows) {
      this.linkById.set(row.id, row)
    }
  }
}
