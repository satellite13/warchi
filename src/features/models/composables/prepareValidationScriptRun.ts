import { buildDiagramScriptSnapshot } from '@/features/validation-scripts/sandbox/buildDiagramScriptSnapshot'
import type { ModelEditorState } from '../types'

export type PrepareValidationScriptRunResult =
  | { ok: true; payload: ReturnType<typeof buildDiagramScriptSnapshot> }
  | { ok: false; cancelled: boolean; error: string | null }

export function prepareValidationScriptRun(options: {
  state: ModelEditorState
  modelName: string
  modelVersion: string
  openDiagramId: string | null
}): PrepareValidationScriptRunResult {
  if (!options.openDiagramId) {
    return { ok: false, cancelled: false, error: null }
  }
  const payload = buildDiagramScriptSnapshot({
    state: options.state,
    modelName: options.modelName,
    modelVersion: options.modelVersion,
    openDiagramId: options.openDiagramId,
  })
  if (!payload.openDiagramId) {
    return { ok: false, cancelled: false, error: null }
  }
  return { ok: true, payload }
}
