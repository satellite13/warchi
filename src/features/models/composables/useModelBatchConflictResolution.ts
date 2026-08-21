import type { Ref } from 'vue'
import { apiGet } from '@/composables/useApi'
import type { DiagramResponse } from '@/types/api'
import { clonePlainDeep } from '@/utils/clonePlainDeep'
import { parseDiagramAttrs, type DiagramAttrs } from '../modelAttrs'
import type { EditorDiagram, ModelEditorState } from '../types'
import { mergeDiagramAttrsAfterBatchConflictReload } from '../utils/mergeLocalCustomPropsAfterReload'
import type { BatchConflictItem } from './useModelBatchSave'

type UseModelBatchConflictResolutionOptions = {
  state: Ref<ModelEditorState>
  batchSaveConflict: Ref<BatchConflictItem[] | null>
  errorMessage: Ref<string | null>
  pendingForceBatch: Ref<boolean>
  loadModel: () => Promise<void>
  saveChanges: () => Promise<boolean>
}

export function useModelBatchConflictResolution(options: UseModelBatchConflictResolutionOptions): {
  resolveBatchSaveReload: () => Promise<void>
  resolveBatchSaveOverwrite: () => Promise<boolean>
  dismissBatchSaveConflict: () => void
} {
  const resolveBatchSaveReload = async (): Promise<void> => {
    const conflicts = options.batchSaveConflict.value ? [...options.batchSaveConflict.value] : []
    options.batchSaveConflict.value = null

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

    await options.loadModel()

    if (options.errorMessage.value || conflicts.length === 0) return

    for (const c of conflicts) {
      if (c.kind !== 'diagram') continue
      const snap = diagramBeforeReload.get(c.id)
      const d = options.state.value.diagrams.find(item => item.id === c.id)
      if (!snap || !d) continue
      if (d._attrsPending) {
        const enc = encodeURIComponent(c.id)
        const reloaded = await apiGet<DiagramResponse>(`/diagrams/${enc}`)
        if (reloaded.success) {
          d.parsedAttrs = parseDiagramAttrs(reloaded.data.attrs ?? null)
          d._attrsPending = false
        }
      }
      d.parsedAttrs = mergeDiagramAttrsAfterBatchConflictReload(
        snap.localAttrs,
        snap.serverAttrs,
        d.parsedAttrs
      )
      d._isDirty = true
    }
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
