import { apiGet } from '@/composables/useApi'
import type { DiagramResponse } from '@/types/api'
import type { EditorDiagram, ModelEditorState } from '../types'
import { toEditorDiagram } from './modelEditorMappers'

type StateSource = ModelEditorState | (() => ModelEditorState)
export type EnsureDiagramAttrsOptions = {
  expectedModelId?: string
  shouldApply?: () => boolean
}

function resolveState(source: StateSource): ModelEditorState {
  return typeof source === 'function' ? source() : source
}

const inFlightById = new Map<string, Promise<EditorDiagram | null>>()
let writeTail: Promise<unknown> = Promise.resolve()

function enqueueWrite<T>(task: () => T): Promise<T> {
  const run = writeTail.then(() => task(), () => task())
  writeTail = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

/** Load full diagram attrs on demand after list fetch with includeAttrs=false. */
export async function ensureDiagramAttrsLoaded(
  stateSource: StateSource,
  diagramId: string,
  options: EnsureDiagramAttrsOptions = {}
): Promise<EditorDiagram | null> {
  const initialState = resolveState(stateSource)
  const index = initialState.diagrams.findIndex(item => item.id === diagramId)
  if (index < 0) return null
  const current = initialState.diagrams[index]!
  const expectedModelId = options.expectedModelId ?? (initialState.modelId || current.modelId)
  const guarded = options.expectedModelId !== undefined || options.shouldApply !== undefined
  const requestKey = `${expectedModelId}:${diagramId}`
  const existing = guarded ? undefined : inFlightById.get(requestKey)
  if (existing) return existing

  if (current.modelId !== expectedModelId) return null
  if (!current._attrsPending) return current

  const promise = (async () => {
    const result = await apiGet<DiagramResponse>(`/diagrams/${diagramId}`)
    if (!result.success) {
      throw new Error(result.error.message)
    }

    const hydrated = toEditorDiagram(result.data, { attrsPending: false })
    return enqueueWrite(() => {
      const latest = resolveState(stateSource)
      if (
        (!!latest.modelId && latest.modelId !== expectedModelId) ||
        result.data.modelId !== expectedModelId ||
        options.shouldApply?.() === false
      ) {
        return null
      }
      const writeIndex = latest.diagrams.findIndex(
        item => item.id === diagramId && item.modelId === expectedModelId
      )
      if (writeIndex < 0) return null
      const previous = latest.diagrams[writeIndex]!
      const next: EditorDiagram = {
        ...hydrated,
        _isNew: previous._isNew,
        _isDirty: previous._isDirty,
        _isDeleted: previous._isDeleted,
      }
      // Tree move / rename can happen while GET is in flight — keep local placement.
      if (previous._isDirty || previous._isNew) {
        next.nodeId = previous.nodeId
        next.name = previous.name
        next.version = previous.version
        next.notationId = previous.notationId
      }
      const diagrams = [...latest.diagrams]
      diagrams[writeIndex] = next
      latest.diagrams = diagrams
      return next
    })
  })().finally(() => {
    if (!guarded) inFlightById.delete(requestKey)
  })

  if (!guarded) inFlightById.set(requestKey, promise)
  return promise
}

/** Hydrate attrs for every non-deleted diagram still pending (OEF label reuse matching). */
export async function ensureAllDiagramAttrsLoaded(stateSource: StateSource): Promise<void> {
  const state = resolveState(stateSource)
  const pendingIds = state.diagrams
    .filter(diagram => !diagram._isDeleted && diagram._attrsPending)
    .map(diagram => diagram.id)
  for (const id of pendingIds) {
    await ensureDiagramAttrsLoaded(stateSource, id)
  }
}

/**
 * Dirty persisted diagrams are listed without canvas JSON. Hydrate before save
 * so a folder move does not overwrite the server canvas with empty instances.
 */
export async function ensureDirtyPendingDiagramAttrsLoaded(
  stateSource: StateSource
): Promise<void> {
  const state = resolveState(stateSource)
  const pendingIds = state.diagrams
    .filter(
      diagram =>
        !diagram._isDeleted && !diagram._isNew && diagram._isDirty && diagram._attrsPending
    )
    .map(diagram => diagram.id)
  for (const id of pendingIds) {
    await ensureDiagramAttrsLoaded(stateSource, id)
  }
}
