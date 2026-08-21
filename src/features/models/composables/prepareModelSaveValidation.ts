import i18n from '@/i18n'
import type { DiagramAttrs } from '../modelAttrs'
import type { ModelEditorState } from '../types'
import { validateRequiredCustomProperties } from '../utils/requiredCustomPropertiesValidation'
import type { useDetachedModelSnapshot } from './useDetachedModelSnapshot'

export type PrepareModelSaveValidationResult =
  | { ok: true }
  | { ok: false; cancelled: boolean; error: string | null }

type TranslateFn = (key: string, params?: Record<string, unknown>) => string

export async function prepareModelSaveValidation(options: {
  loader: ReturnType<typeof useDetachedModelSnapshot>
  state: ModelEditorState
  activeDiagram: DiagramAttrs | null | undefined
  t?: TranslateFn
}): Promise<PrepareModelSaveValidationResult> {
  const translate: TranslateFn =
    options.t ?? ((key, params) => String(i18n.global.t(key, params ?? {})))
  try {
    const overlay = await options.loader.loadOverlayed(options.state)
    if (!overlay.ok) {
      return overlay
    }
    const issue = validateRequiredCustomProperties({
      state: {
        ...options.state,
        nodes: overlay.snapshot.nodes,
        links: overlay.snapshot.links,
      },
      activeDiagram: options.activeDiagram,
    })
    if (issue) {
      return {
        ok: false,
        cancelled: false,
        error: translate(issue.key, issue.params),
      }
    }
    return { ok: true }
  } finally {
    options.loader.release()
  }
}
