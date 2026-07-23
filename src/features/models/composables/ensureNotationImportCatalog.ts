import { apiGet } from '@/composables/useApi'
import { listParams } from '@/api/queryHelpers'
import type { LinkTypeResponse, NodeTypeResponse } from '@/types/api'
import type { PaginatedResponse } from '@/types/entities'
import type { ModelEditorState } from '../types'
import { fetchAllComponentsByNotationId } from './modelNotationComponentsApi'

/** Notations whose components/types were already merged into editor state for this model load. */
const loadedCatalogNotationIds = new Set<string>()

export function resetLoadedNotationCatalogIds(notationIds: string[] = []): void {
  loadedCatalogNotationIds.clear()
  for (const notationId of notationIds) {
    loadedCatalogNotationIds.add(notationId)
  }
}

/**
 * Loads components / node-types / link-types for a notation into model-editor state,
 * and ensures relations (+ rules) are loaded. Used when opening/creating a diagram whose
 * notation was not part of the initial model catalog (e.g. first diagram with that notation).
 */
export async function ensureNotationImportCatalog(params: {
  modelId: string
  notationId: string
  state: ModelEditorState
  ensureNotationRelationsAndRules: (
    notationId: string,
    options?: { force?: boolean }
  ) => Promise<void>
  force?: boolean
}): Promise<void> {
  const { modelId, notationId, state, force = false } = params
  if (!modelId || !notationId) return

  if (!force && loadedCatalogNotationIds.has(notationId)) {
    await params.ensureNotationRelationsAndRules(notationId)
    return
  }

  const typesQuery = listParams()
  typesQuery.set('modelId', modelId)
  typesQuery.set('notationId', notationId)

  const [components, nodeTypesResult, linkTypesResult] = await Promise.all([
    fetchAllComponentsByNotationId(notationId, { modelId }),
    apiGet<PaginatedResponse<NodeTypeResponse>>(`/node-types?${typesQuery.toString()}`),
    apiGet<PaginatedResponse<LinkTypeResponse>>(`/link-types?${typesQuery.toString()}`),
  ])
  await params.ensureNotationRelationsAndRules(notationId)

  const componentById = new Map(state.components.map(item => [item.id, item]))
  for (const component of components) {
    componentById.set(component.id, component)
  }
  state.components = [...componentById.values()]

  if (nodeTypesResult.success) {
    const byId = new Map(state.nodeTypes.map(item => [item.id, item]))
    for (const item of nodeTypesResult.data.content ?? []) {
      byId.set(item.id, item)
    }
    state.nodeTypes = [...byId.values()]
  }

  if (linkTypesResult.success) {
    const byId = new Map(state.linkTypes.map(item => [item.id, item]))
    for (const item of linkTypesResult.data.content ?? []) {
      byId.set(item.id, item)
    }
    state.linkTypes = [...byId.values()]
  }

  loadedCatalogNotationIds.add(notationId)
}
