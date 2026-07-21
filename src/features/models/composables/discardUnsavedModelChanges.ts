import { apiGet } from '@/composables/useApi'
import type { DiagramResponse, LinkResponse, NodeResponse } from '@/types/api'
import type { ModelData } from '@/types/entities'
import type { EditorDiagram, EditorLink, EditorNode, ModelEditorState } from '../types'
import { toEditorDiagram, toEditorLink, toEditorNode } from './modelEditorMappers'

const FETCH_CONCURRENCY = 8

async function mapPool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void> {
  if (items.length === 0) return
  let index = 0
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index]!
      index += 1
      await worker(current)
    }
  })
  await Promise.all(runners)
}

function stripEditorFlags<T extends { _isNew?: boolean; _isDirty?: boolean; _isDeleted?: boolean }>(
  row: T
): T {
  delete row._isNew
  delete row._isDirty
  delete row._isDeleted
  return row
}

/**
 * Drop local unsaved edits without reloading the whole model (important for large OEF imports).
 * - `_isNew` entities are removed
 * - `_isDeleted` (persisted) are restored locally
 * - `_isDirty` persisted entities are re-fetched from the API
 */
export async function discardUnsavedModelChanges(options: {
  state: ModelEditorState
  model: ModelData | null
  modelDirty: boolean
  onModelRestored?: (model: ModelData) => void
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { state } = options

  if (options.modelDirty && options.model?.id) {
    const modelResult = await apiGet<ModelData>(`/models/${encodeURIComponent(options.model.id)}`)
    if (!modelResult.success) {
      return { ok: false, error: modelResult.error.message }
    }
    options.onModelRestored?.(modelResult.data)
  }

  // Soft-deleted persisted rows: keep payload, clear delete flag.
  for (const node of state.nodes) {
    if (!node._isNew && node._isDeleted) {
      node._isDeleted = false
    }
  }
  for (const link of state.links) {
    if (!link._isNew && link._isDeleted) {
      link._isDeleted = false
    }
  }
  for (const diagram of state.diagrams) {
    if (!diagram._isNew && diagram._isDeleted) {
      diagram._isDeleted = false
    }
  }

  const nodesToFetch = state.nodes.filter(node => !node._isNew && node._isDirty).map(node => node.id)
  const linksToFetch = state.links.filter(link => !link._isNew && link._isDirty).map(link => link.id)
  const diagramsToFetch = state.diagrams
    .filter(diagram => !diagram._isNew && diagram._isDirty)
    .map(diagram => diagram.id)

  const restoredNodes = new Map<string, EditorNode>()
  const restoredLinks = new Map<string, EditorLink>()
  const restoredDiagrams = new Map<string, EditorDiagram>()
  const failures: string[] = []

  await mapPool(nodesToFetch, FETCH_CONCURRENCY, async id => {
    const result = await apiGet<NodeResponse>(`/nodes/${encodeURIComponent(id)}`)
    if (!result.success) {
      failures.push(`node ${id}: ${result.error.message}`)
      return
    }
    restoredNodes.set(id, stripEditorFlags(toEditorNode(result.data)))
  })
  await mapPool(linksToFetch, FETCH_CONCURRENCY, async id => {
    const result = await apiGet<LinkResponse>(`/links/${encodeURIComponent(id)}`)
    if (!result.success) {
      failures.push(`link ${id}: ${result.error.message}`)
      return
    }
    restoredLinks.set(id, stripEditorFlags(toEditorLink(result.data)))
  })
  await mapPool(diagramsToFetch, FETCH_CONCURRENCY, async id => {
    const result = await apiGet<DiagramResponse>(`/diagrams/${encodeURIComponent(id)}`)
    if (!result.success) {
      failures.push(`diagram ${id}: ${result.error.message}`)
      return
    }
    restoredDiagrams.set(id, stripEditorFlags(toEditorDiagram(result.data, { attrsPending: false })))
  })

  if (failures.length > 0) {
    return { ok: false, error: failures.slice(0, 3).join('; ') }
  }

  state.nodes = state.nodes
    .filter(node => !node._isNew)
    .map(node => restoredNodes.get(node.id) ?? stripEditorFlags(node))

  const nodeIdSet = new Set(state.nodes.map(node => node.id))

  state.links = state.links
    .filter(link => !link._isNew)
    .filter(link => nodeIdSet.has(link.sourceId) && nodeIdSet.has(link.targetId))
    .map(link => restoredLinks.get(link.id) ?? stripEditorFlags(link))

  state.diagrams = state.diagrams
    .filter(diagram => !diagram._isNew)
    .map(diagram => restoredDiagrams.get(diagram.id) ?? stripEditorFlags(diagram))

  return { ok: true }
}
