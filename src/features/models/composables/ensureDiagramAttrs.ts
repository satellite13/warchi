import { apiGet } from '@/composables/useApi'
import type { DiagramResponse } from '@/types/api'
import type { EditorDiagram, ModelEditorState } from '../types'
import { toEditorDiagram } from './modelEditorMappers'

type StateSource = ModelEditorState | (() => ModelEditorState)

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
  diagramId: string
): Promise<EditorDiagram | null> {
  const existing = inFlightById.get(diagramId)
  if (existing) return existing

  const state = resolveState(stateSource)
  const index = state.diagrams.findIndex(item => item.id === diagramId)
  if (index < 0) return null
  const current = state.diagrams[index]!
  if (!current._attrsPending) return current

  const promise = (async () => {
    const result = await apiGet<DiagramResponse>(`/diagrams/${diagramId}`)
    if (!result.success) {
      throw new Error(result.error.message)
    }

    const hydrated = toEditorDiagram(result.data, { attrsPending: false })
    return enqueueWrite(() => {
      const latest = resolveState(stateSource)
      const writeIndex = latest.diagrams.findIndex(item => item.id === diagramId)
      if (writeIndex < 0) return null
      const previous = latest.diagrams[writeIndex]!
      const next: EditorDiagram = {
        ...hydrated,
        _isNew: previous._isNew,
        _isDirty: previous._isDirty,
        _isDeleted: previous._isDeleted,
      }
      const diagrams = [...latest.diagrams]
      diagrams[writeIndex] = next
      latest.diagrams = diagrams
      return next
    })
  })().finally(() => {
    inFlightById.delete(diagramId)
  })

  inFlightById.set(diagramId, promise)
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
