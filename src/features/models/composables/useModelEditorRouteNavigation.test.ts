import { nextTick, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { useModelEditorRouteNavigation } from './useModelEditorRouteNavigation'

describe('useModelEditorRouteNavigation', () => {
  it('reloads the model and applies the requested diagram after a model route change', async () => {
    const modelId = ref('source-model')
    const diagramId = ref('source-diagram')
    const events: string[] = []
    const loadModel = vi.fn(async () => {
      events.push('load')
      await Promise.resolve()
    })
    const applyRouteDiagramSelection = vi.fn(() => {
      events.push('select')
    })

    useModelEditorRouteNavigation({
      modelId,
      diagramId,
      loadModel,
      applyRouteDiagramSelection,
    })

    modelId.value = 'target-model'
    diagramId.value = 'target-diagram'
    await nextTick()
    await Promise.resolve()

    expect(loadModel).toHaveBeenCalledTimes(1)
    expect(applyRouteDiagramSelection).toHaveBeenCalledTimes(1)
    expect(events).toEqual(['load', 'select'])
  })

  it('applies a new diagram query without reloading the current model', async () => {
    const modelId = ref('model-1')
    const diagramId = ref('diagram-1')
    const loadModel = vi.fn()
    const applyRouteDiagramSelection = vi.fn()

    useModelEditorRouteNavigation({
      modelId,
      diagramId,
      loadModel,
      applyRouteDiagramSelection,
    })

    diagramId.value = 'diagram-2'
    await nextTick()

    expect(loadModel).not.toHaveBeenCalled()
    expect(applyRouteDiagramSelection).toHaveBeenCalledTimes(1)
  })
})
