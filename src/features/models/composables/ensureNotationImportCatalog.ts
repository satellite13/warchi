import { isRef, unref, type MaybeRef } from 'vue'
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

export function addLoadedNotationCatalogIds(notationIds: string[]): void {
  for (const notationId of notationIds) {
    loadedCatalogNotationIds.add(notationId)
  }
}

function mergeById<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
  const byId = new Map(existing.map(item => [item.id, item]))
  for (const item of incoming) {
    byId.set(item.id, item)
  }
  return [...byId.values()]
}

function assignCatalog(
  state: MaybeRef<ModelEditorState>,
  patch: Pick<ModelEditorState, 'components' | 'nodeTypes' | 'linkTypes'>
): void {
  if (isRef(state)) {
    state.value = { ...state.value, ...patch }
    return
  }
  state.components = patch.components
  state.nodeTypes = patch.nodeTypes
  state.linkTypes = patch.linkTypes
}

/**
 * Loads components / node-types / link-types for a notation into model-editor state,
 * and ensures relations (+ rules) are loaded. Used when opening/creating a diagram whose
 * notation was not part of the initial model catalog (e.g. first diagram with that notation).
 */
export async function ensureNotationImportCatalog(params: {
  modelId: string
  notationId: string
  state: MaybeRef<ModelEditorState>
  ensureNotationRelationsAndRules: (
    notationId: string,
    options?: { force?: boolean }
  ) => Promise<void>
  force?: boolean
}): Promise<void> {
  const { modelId, notationId, force = false } = params
  if (!modelId || !notationId) return

  const currentAtStart = unref(params.state)
  const alreadyHasComponents = currentAtStart.components.some(item => item.notationId === notationId)
  if (!force && loadedCatalogNotationIds.has(notationId) && alreadyHasComponents) {
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

  const current = unref(params.state)
  assignCatalog(params.state, {
    components: mergeById(current.components, components),
    nodeTypes: nodeTypesResult.success
      ? mergeById(current.nodeTypes, nodeTypesResult.data.content ?? [])
      : current.nodeTypes,
    linkTypes: linkTypesResult.success
      ? mergeById(current.linkTypes, linkTypesResult.data.content ?? [])
      : current.linkTypes,
  })

  loadedCatalogNotationIds.add(notationId)
}
