import { nextTick, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import {
  focusRouteDiagramTree,
  useModelEditorRouteNavigation,
} from './useModelEditorRouteNavigation'

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

  it('does not block diagram selection or post-load work on asynchronous tree focus', async () => {
    const modelId = ref('source-model')
    const diagramId = ref('source-diagram')
    const events: string[] = []
    let finishTreeFocus!: () => void
    const focusRouteDiagramInTree = vi.fn(
      () =>
        new Promise<void>(resolve => {
          events.push('tree-start')
          finishTreeFocus = () => {
            events.push('tree-finish')
            resolve()
          }
        })
    )

    useModelEditorRouteNavigation({
      modelId,
      diagramId,
      loadModel: async () => {
        events.push('load')
      },
      applyRouteDiagramSelection: () => {
        events.push('select-slim-diagram')
      },
      focusRouteDiagramInTree,
      afterModelLoad: () => {
        events.push('after-load')
      },
    })

    modelId.value = 'target-model'
    diagramId.value = 'target-diagram'
    await nextTick()
    await Promise.resolve()

    expect(events).toEqual(['load', 'select-slim-diagram', 'tree-start', 'after-load'])
    finishTreeFocus()
    await Promise.resolve()
    expect(events.at(-1)).toBe('tree-finish')
  })

  it('ignores an older model route after its controlled load resolves', async () => {
    const modelId = ref('source-model')
    const diagramId = ref('source-diagram')
    const loadResolvers = new Map<string, () => void>()
    const selected: string[] = []

    useModelEditorRouteNavigation({
      modelId,
      diagramId,
      loadModel: requestedModelId =>
        new Promise<void>(resolve => loadResolvers.set(requestedModelId, resolve)),
      applyRouteDiagramSelection: requestedDiagramId => selected.push(requestedDiagramId),
    })

    modelId.value = 'model-a'
    diagramId.value = 'diagram-a'
    await nextTick()
    modelId.value = 'model-b'
    diagramId.value = 'diagram-b'
    await nextTick()

    loadResolvers.get('model-a')?.()
    await Promise.resolve()
    expect(selected).toEqual([])

    loadResolvers.get('model-b')?.()
    await Promise.resolve()
    expect(selected).toEqual(['diagram-b'])
  })

  it('keeps model loading current while diagram intent changes from A to B', async () => {
    const modelId = ref('source-model')
    const diagramId = ref('source-diagram')
    let finishLoad!: () => void
    const loadModel = vi.fn(
      () =>
        new Promise<void>(resolve => {
          finishLoad = resolve
        })
    )
    const selected: string[] = []
    const afterModelLoad = vi.fn()

    useModelEditorRouteNavigation({
      modelId,
      diagramId,
      loadModel,
      applyRouteDiagramSelection: requestedDiagramId => selected.push(requestedDiagramId),
      afterModelLoad,
    })

    modelId.value = 'target-model'
    diagramId.value = 'diagram-a'
    await nextTick()
    diagramId.value = 'diagram-b'
    await nextTick()

    expect(loadModel).toHaveBeenCalledTimes(1)
    expect(selected).toEqual([])

    finishLoad()
    await Promise.resolve()

    expect(selected).toEqual(['diagram-b'])
    expect(afterModelLoad).toHaveBeenCalledTimes(1)
  })

  it('passes a generation guard that invalidates stale diagram tree focus', async () => {
    const modelId = ref('model-1')
    const diagramId = ref('diagram-1')
    const focusResolvers = new Map<string, () => void>()
    const focused: string[] = []

    useModelEditorRouteNavigation({
      modelId,
      diagramId,
      loadModel: vi.fn(),
      applyRouteDiagramSelection: vi.fn(),
      focusRouteDiagramInTree: async (requestedDiagramId, isCurrent) => {
        await new Promise<void>(resolve => focusResolvers.set(requestedDiagramId, resolve))
        if (isCurrent()) focused.push(requestedDiagramId)
      },
    })

    diagramId.value = 'diagram-2'
    await nextTick()
    diagramId.value = 'diagram-3'
    await nextTick()
    focusResolvers.get('diagram-2')?.()
    await Promise.resolve()

    expect(focused).not.toContain('diagram-2')
  })

  it('retries only the current diagram tree focus without reloading or selecting', () => {
    const loadModel = vi.fn()
    const applyRouteDiagramSelection = vi.fn()
    const focusRouteDiagramInTree = vi.fn()
    const navigation = useModelEditorRouteNavigation({
      modelId: ref('model-1'),
      diagramId: ref('diagram-1'),
      loadModel,
      applyRouteDiagramSelection,
      focusRouteDiagramInTree,
    })

    navigation.retryCurrentDiagramTreeFocus()

    expect(focusRouteDiagramInTree).toHaveBeenCalledWith('diagram-1', expect.any(Function))
    expect(loadModel).not.toHaveBeenCalled()
    expect(applyRouteDiagramSelection).not.toHaveBeenCalled()
  })

  it('focuses a node in the tree without opening a diagram when only nodeId is present', async () => {
    const applyRouteDiagramSelection = vi.fn()
    const applyRouteNodeSelection = vi.fn()
    const focusRouteNodeInTree = vi.fn()
    const nodeId = ref('')

    useModelEditorRouteNavigation({
      modelId: ref('model-1'),
      diagramId: ref(''),
      nodeId,
      linkId: ref(''),
      loadModel: vi.fn(),
      applyRouteDiagramSelection,
      applyRouteNodeSelection,
      focusRouteNodeInTree,
    })

    nodeId.value = 'node-1'
    await nextTick()

    expect(focusRouteNodeInTree).toHaveBeenCalledWith('node-1', expect.any(Function))
    expect(applyRouteNodeSelection).toHaveBeenCalledWith('node-1')
    expect(applyRouteDiagramSelection).not.toHaveBeenCalled()
  })

  it('opens the diagram and then selects the node when diagramId and nodeId are present', async () => {
    const events: string[] = []
    const applyRouteDiagramSelection = vi.fn((requestedDiagramId: string) => {
      events.push(`diagram:${requestedDiagramId}`)
    })
    const applyRouteNodeSelection = vi.fn((requestedNodeId: string) => {
      events.push(`node:${requestedNodeId}`)
    })
    const focusRouteNodeInTree = vi.fn((requestedNodeId: string) => {
      events.push(`focus-node:${requestedNodeId}`)
    })
    const diagramId = ref('')
    const nodeId = ref('')

    useModelEditorRouteNavigation({
      modelId: ref('model-1'),
      diagramId,
      nodeId,
      linkId: ref(''),
      loadModel: vi.fn(),
      applyRouteDiagramSelection,
      applyRouteNodeSelection,
      focusRouteNodeInTree,
    })

    diagramId.value = 'diagram-1'
    nodeId.value = 'node-1'
    await nextTick()

    expect(applyRouteDiagramSelection).toHaveBeenCalledWith('diagram-1')
    expect(applyRouteNodeSelection).toHaveBeenCalledWith('node-1')
    expect(focusRouteNodeInTree).toHaveBeenCalledWith('node-1', expect.any(Function))
    expect(events[0]).toBe('diagram:diagram-1')
    expect(events).toContain('node:node-1')
    expect(events).toContain('focus-node:node-1')
  })

  it('opens the diagram and then selects the link when diagramId and linkId are present', async () => {
    const events: string[] = []
    const applyRouteDiagramSelection = vi.fn((requestedDiagramId: string) => {
      events.push(`diagram:${requestedDiagramId}`)
    })
    const applyRouteLinkSelection = vi.fn((requestedLinkId: string) => {
      events.push(`link:${requestedLinkId}`)
    })
    const diagramId = ref('')
    const linkId = ref('')

    useModelEditorRouteNavigation({
      modelId: ref('model-1'),
      diagramId,
      nodeId: ref(''),
      linkId,
      loadModel: vi.fn(),
      applyRouteDiagramSelection,
      applyRouteLinkSelection,
    })

    diagramId.value = 'diagram-1'
    linkId.value = 'link-1'
    await nextTick()

    expect(applyRouteDiagramSelection).toHaveBeenCalledWith('diagram-1')
    expect(applyRouteLinkSelection).toHaveBeenCalledWith('link-1')
    expect(events).toEqual(['diagram:diagram-1', 'link:link-1'])
  })
})

describe('focusRouteDiagramTree', () => {
  it('does not expand or focus when a node path resolves for a stale route', async () => {
    let resolvePath!: (path: string[]) => void
    let current = true
    const expandPath = vi.fn()
    const focusDiagram = vi.fn()
    const focusing = focusRouteDiagramTree({
      diagramId: 'diagram-node',
      nodeId: 'folder',
      treeRootNodeId: 'hidden-root',
      selectHit: () => new Promise(resolve => (resolvePath = resolve)),
      waitForRender: () => Promise.resolve(),
      expandPath,
      focusDiagram,
      isCurrent: () => current,
    })

    current = false
    resolvePath(['folder'])
    await focusing

    expect(expandPath).not.toHaveBeenCalled()
    expect(focusDiagram).not.toHaveBeenCalled()
  })

  it('rechecks generation after render before expanding a resolved node path', async () => {
    let finishRender!: () => void
    let current = true
    const expandPath = vi.fn()
    const focusDiagram = vi.fn()
    const focusing = focusRouteDiagramTree({
      diagramId: 'diagram-node',
      nodeId: 'folder',
      treeRootNodeId: 'hidden-root',
      selectHit: async () => ['folder'],
      waitForRender: () => new Promise<void>(resolve => (finishRender = resolve)),
      expandPath,
      focusDiagram,
      isCurrent: () => current,
    })
    await Promise.resolve()

    current = false
    finishRender()
    await focusing

    expect(expandPath).not.toHaveBeenCalled()
    expect(focusDiagram).not.toHaveBeenCalled()
  })

  it('does not focus a stale root diagram after its render wait', async () => {
    let finishRender!: () => void
    let current = true
    const focusDiagram = vi.fn()
    const focusing = focusRouteDiagramTree({
      diagramId: 'root-diagram',
      nodeId: 'hidden-root',
      treeRootNodeId: 'hidden-root',
      selectHit: vi.fn(),
      waitForRender: () => new Promise<void>(resolve => (finishRender = resolve)),
      expandPath: vi.fn(),
      focusDiagram,
      isCurrent: () => current,
    })

    current = false
    finishRender()
    await focusing

    expect(focusDiagram).not.toHaveBeenCalled()
  })
})
