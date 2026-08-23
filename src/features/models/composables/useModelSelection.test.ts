import { effectScope, nextTick, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NodeResponse } from '@/types/api'
import { createEmptyModelEditorState } from '../types'
import { resolveModelNodes } from './modelScopedApi'
import { useModelSelection } from './useModelSelection'

vi.mock('./modelScopedApi', () => ({
  resolveModelNodes: vi.fn(),
}))

const resolveModelNodesMock = vi.mocked(resolveModelNodes)
const node = (id: string): NodeResponse => ({
  id,
  name: id,
  modelId: 'model-1',
  ownerId: 'owner-1',
  nodeTypeId: 'type-1',
  parentNodeId: null,
})

describe('useModelSelection lazy materialization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('point-resolves exactly one selected, non-materialized canvas node', async () => {
    resolveModelNodesMock.mockResolvedValue({
      success: true,
      data: { nodes: [node('node-1')], missingIds: [] },
    })
    const state = ref({ ...createEmptyModelEditorState(), modelId: 'model-1' })
    const guard = { generation: 2, requestKey: 'selection', token: 4 }
    const mergeNodes = vi.fn(() => true)
    const scope = effectScope()
    const selection = scope.run(() =>
      useModelSelection({
        state,
        mergeNodes,
        beginRequest: () => guard,
        isRequestCurrent: request => request === guard,
      })
    )!

    selection.selectedModelNodeIds.value = ['node-1']
    await nextTick()
    await Promise.resolve()

    expect(resolveModelNodesMock).toHaveBeenCalledWith(
      'model-1',
      ['node-1'],
      expect.any(AbortSignal)
    )
    expect(mergeNodes).toHaveBeenCalledWith([expect.objectContaining({ id: 'node-1' })], guard)
    scope.stop()
  })

  it('does not resolve zero, multiple, deleted, or already materialized selections', async () => {
    const materialized = {
      ...node('known'),
      parsedAttrs: {
        treeOrder: 0,
        notationComponents: {},
        componentProperties: {},
        typeProperties: {},
      },
    }
    const state = ref({
      ...createEmptyModelEditorState(),
      modelId: 'model-1',
      nodes: [materialized],
    })
    const scope = effectScope()
    const selection = scope.run(() =>
      useModelSelection({
        state,
        mergeNodes: vi.fn(() => true),
        beginRequest: () => ({ generation: 1, requestKey: 'selection', token: 1 }),
        isRequestCurrent: () => true,
      })
    )!

    selection.selectedModelNodeIds.value = ['a', 'b']
    await nextTick()
    selection.selectedModelNodeIds.value = ['known']
    await nextTick()
    selection.selectedModelNodeIds.value = []
    await nextTick()

    expect(resolveModelNodesMock).not.toHaveBeenCalled()
    scope.stop()
  })

  it('shows local loading/error and retries the selected node', async () => {
    let finish!: (value: Awaited<ReturnType<typeof resolveModelNodes>>) => void
    resolveModelNodesMock
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            finish = resolve
          })
      )
      .mockResolvedValueOnce({
        success: true,
        data: { nodes: [node('node-1')], missingIds: [] },
      })
    const state = ref({ ...createEmptyModelEditorState(), modelId: 'model-1' })
    const mergeNodes = vi.fn(() => true)
    const scope = effectScope()
    const selection = scope.run(() =>
      useModelSelection({
        state,
        mergeNodes,
        beginRequest: () => ({ generation: 1, requestKey: 'selection', token: 1 }),
        isRequestCurrent: () => true,
      })
    )!

    selection.selectedModelNodeIds.value = ['node-1']
    await nextTick()
    expect(selection.selectedNodeLoading.value).toBe(true)

    finish({ success: false, error: { status: 503, message: 'node failed' } })
    await Promise.resolve()
    await Promise.resolve()
    expect(selection.selectedNodeLoading.value).toBe(false)
    expect(selection.selectedNodeError.value).toBe('node failed')

    await selection.retrySelectedNode()
    expect(selection.selectedNodeError.value).toBeNull()
    expect(mergeNodes).toHaveBeenCalled()
    scope.stop()
  })

  it('ignores a cancelled stale selection request', async () => {
    let finishFirst!: (value: Awaited<ReturnType<typeof resolveModelNodes>>) => void
    resolveModelNodesMock
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            finishFirst = resolve
          })
      )
      .mockResolvedValueOnce({
        success: true,
        data: { nodes: [node('node-2')], missingIds: [] },
      })
    const state = ref({ ...createEmptyModelEditorState(), modelId: 'model-1' })
    const mergeNodes = vi.fn(() => true)
    const scope = effectScope()
    const selection = scope.run(() =>
      useModelSelection({
        state,
        mergeNodes,
        beginRequest: () => ({ generation: 1, requestKey: 'selection', token: 1 }),
        isRequestCurrent: () => true,
      })
    )!

    selection.selectedModelNodeIds.value = ['node-1']
    await nextTick()
    selection.selectedModelNodeIds.value = ['node-2']
    await nextTick()
    await Promise.resolve()
    finishFirst({ success: true, data: { nodes: [node('node-1')], missingIds: [] } })
    await Promise.resolve()

    expect(mergeNodes).toHaveBeenCalledTimes(1)
    expect(mergeNodes).toHaveBeenCalledWith(
      [expect.objectContaining({ id: 'node-2' })],
      expect.anything()
    )
    expect(selection.selectedNodeError.value).toBeNull()
    scope.stop()
  })
})
