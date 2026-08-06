import { watch, type Ref } from 'vue'

type ModelEditorRouteNavigationOptions = {
  modelId: Ref<string>
  diagramId: Ref<string>
  loadModel: () => Promise<void>
  applyRouteDiagramSelection: () => void
  afterModelLoad?: () => void
}

/**
 * Keeps a reused ModelEditor synchronized with its route parameters.
 * A model change must finish loading before its requested diagram is selected.
 */
export function useModelEditorRouteNavigation(options: ModelEditorRouteNavigationOptions): void {
  watch(
    [options.modelId, options.diagramId],
    async ([modelId, diagramId], [previousModelId, previousDiagramId]) => {
      if (modelId !== previousModelId) {
        if (!modelId) return
        await options.loadModel()
        options.applyRouteDiagramSelection()
        options.afterModelLoad?.()
        return
      }

      if (diagramId !== previousDiagramId) {
        options.applyRouteDiagramSelection()
      }
    }
  )
}
