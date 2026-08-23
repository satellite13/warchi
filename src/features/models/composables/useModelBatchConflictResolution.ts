import type { Ref } from 'vue'
import { apiGet } from '@/composables/useApi'
import i18n from '@/i18n'
import type { DiagramResponse } from '@/types/api'
import { clonePlainDeep } from '@/utils/clonePlainDeep'
import { parseDiagramAttrs, type DiagramAttrs } from '../modelAttrs'
import type { EditorDiagram, ModelEditorState } from '../types'
import { mergeDiagramAttrsAfterBatchConflictReload } from '../utils/mergeLocalCustomPropsAfterReload'
import type { BatchConflictItem } from './useModelBatchSave'

type UseModelBatchConflictResolutionOptions = {
  state: Ref<ModelEditorState>
  batchSaveConflict: Ref<BatchConflictItem[] | null>
  /** Fullscreen overlay; conflict failures must leave this empty. */
  errorMessage?: Ref<string | null>
  saveError: Ref<string | null>
  scheduleSaveErrorClear?: () => void
  pendingForceBatch: Ref<boolean>
  loadModel: () => Promise<boolean>
  saveChanges: () => Promise<boolean>
  t?: (key: string) => string
}

export function useModelBatchConflictResolution(options: UseModelBatchConflictResolutionOptions): {
  resolveBatchSaveReload: () => Promise<void>
  resolveBatchSaveOverwrite: () => Promise<boolean>
  dismissBatchSaveConflict: () => void
} {
  const t = options.t ?? ((key: string) => String(i18n.global.t(key)))

  const reportRetryable = (key: string): void => {
    options.saveError.value = t(key)
    options.scheduleSaveErrorClear?.()
  }

  const resolveBatchSaveReload = async (): Promise<void> => {
    const conflicts = options.batchSaveConflict.value ? [...options.batchSaveConflict.value] : []
    if (conflicts.length === 0) return

    const diagramBeforeReload = new Map<
      string,
      { localAttrs: EditorDiagram['parsedAttrs']; serverAttrs: DiagramAttrs }
    >()

    const diagramConflicts = conflicts.filter(c => c.kind === 'diagram')
    await Promise.all(
      diagramConflicts.map(async c => {
        const d = options.state.value.diagrams.find(item => item.id === c.id)
        if (!d) return
        const enc = encodeURIComponent(c.id)
        const r = await apiGet<DiagramResponse>(`/diagrams/${enc}`)
        if (!r.success) return
        diagramBeforeReload.set(c.id, {
          localAttrs: clonePlainDeep(d.parsedAttrs),
          serverAttrs: parseDiagramAttrs(r.data.attrs ?? null),
        })
      })
    )

    const reloadOk = await options.loadModel()
    if (reloadOk === false) {
      reportRetryable('models.batchSaveConflictReloadFailed')
      return
    }

    for (const c of conflicts) {
      if (c.kind !== 'diagram') continue
      const snap = diagramBeforeReload.get(c.id)
      const d = options.state.value.diagrams.find(item => item.id === c.id)
      if (!snap || !d) continue
      if (d._attrsPending) {
        const enc = encodeURIComponent(c.id)
        const reloaded = await apiGet<DiagramResponse>(`/diagrams/${enc}`)
        if (!reloaded.success) {
          d.parsedAttrs = snap.localAttrs
          d._attrsPending = false
          reportRetryable('models.batchSaveConflictHydrateFailed')
          return
        }
        d.parsedAttrs = parseDiagramAttrs(reloaded.data.attrs ?? null)
        d._attrsPending = false
      }
      d.parsedAttrs = mergeDiagramAttrsAfterBatchConflictReload(
        snap.localAttrs,
        snap.serverAttrs,
        d.parsedAttrs
      )
      d._isDirty = true
    }
    options.batchSaveConflict.value = null
  }

  const resolveBatchSaveOverwrite = async (): Promise<boolean> => {
    options.batchSaveConflict.value = null
    options.pendingForceBatch.value = true
    return options.saveChanges()
  }

  const dismissBatchSaveConflict = (): void => {
    options.batchSaveConflict.value = null
  }

  return {
    resolveBatchSaveReload,
    resolveBatchSaveOverwrite,
    dismissBatchSaveConflict,
  }
}
