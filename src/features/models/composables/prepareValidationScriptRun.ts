import { buildValidationSnapshot } from '@/features/validation-scripts/sandbox/buildValidationSnapshot'
import type { ModelEditorState } from '../types'
import type { useDetachedModelSnapshot } from './useDetachedModelSnapshot'

export type PrepareValidationScriptRunResult =
  | { ok: true; payload: ReturnType<typeof buildValidationSnapshot> }
  | { ok: false; cancelled: boolean; error: string | null }

export async function prepareValidationScriptRun(options: {
  loader: Pick<ReturnType<typeof useDetachedModelSnapshot>, 'loadOverlayed'>
  state: ModelEditorState
  modelName: string
  modelVersion: string
  openDiagramId: string | null
}): Promise<PrepareValidationScriptRunResult> {
  const overlay = await options.loader.loadOverlayed(options.state)
  if (!overlay.ok) {
    return { ok: false, cancelled: overlay.cancelled, error: overlay.error }
  }
  return {
    ok: true,
    payload: buildValidationSnapshot({
      state: {
        ...options.state,
        nodes: overlay.snapshot.nodes,
        links: overlay.snapshot.links,
      },
      modelName: options.modelName,
      modelVersion: options.modelVersion,
      openDiagramId: options.openDiagramId,
    }),
  }
}
