import { effectScope, nextTick, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DiagramCopyPreviewResponse } from './diagramCopyApi'
import { useDiagramCopyWizard } from './useDiagramCopyWizard'

const { commitDiagramCopyMock, previewDiagramCopyMock } = vi.hoisted(() => ({
  commitDiagramCopyMock: vi.fn(),
  previewDiagramCopyMock: vi.fn(),
}))

vi.mock('./diagramCopyApi', () => ({
  buildResolutionsFromPreview: vi.fn(() => []),
  commitDiagramCopy: commitDiagramCopyMock,
  previewDiagramCopy: previewDiagramCopyMock,
}))

function createPreview(
  overrides: Partial<DiagramCopyPreviewResponse> = {}
): DiagramCopyPreviewResponse {
  return {
    sourceDiagramId: 'source-diagram',
    sourceDiagramName: 'Source diagram',
    sourceDiagramVersion: '1.0.0',
    suggestedName: 'Copied diagram',
    suggestedVersion: '1.0.0',
    nodes: [],
    links: [],
    blockers: [],
    notationRemap: {
      mappedComponents: 0,
      unmappedComponents: [],
      mappedRelations: 0,
      unmappedRelations: [],
    },
    warnings: [],
    canCommit: true,
    ...overrides,
  }
}

async function flushWatcher(): Promise<void> {
  await nextTick()
  await Promise.resolve()
}

describe('useDiagramCopyWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    previewDiagramCopyMock.mockResolvedValue({ success: true, data: createPreview() })
  })

  it('disables finish when preview.canCommit is false', async () => {
    const scope = effectScope()
    const wizard = scope.run(() =>
      useDiagramCopyWizard({ sourceModelId: ref('source-model') })
    )!

    wizard.targetModelId.value = 'target-model'
    wizard.targetNotationId.value = 'target-notation'
    await wizard.open('source-diagram')
    await flushWatcher()

    previewDiagramCopyMock.mockResolvedValueOnce({
      success: true,
      data: createPreview({ canCommit: false }),
    })
    await wizard.refreshPreview()

    expect(wizard.canFinish.value).toBe(false)
    scope.stop()
  })

  it('resets resolutions when target model changes', async () => {
    const scope = effectScope()
    const wizard = scope.run(() =>
      useDiagramCopyWizard({ sourceModelId: ref('source-model') })
    )!

    wizard.targetModelId.value = 'target-model-1'
    wizard.targetNotationId.value = 'target-notation'
    await wizard.open('source-diagram')
    await flushWatcher()
    wizard.setResolution('node-1', { sourceId: 'node-1', action: 'CREATE', kind: 'NODE' })

    wizard.targetModelId.value = 'target-model-2'
    await flushWatcher()

    expect(wizard.resolutions.value).toEqual(new Map())
    expect(previewDiagramCopyMock).toHaveBeenLastCalledWith(
      'target-model-2',
      expect.objectContaining({ sourceDiagramId: 'source-diagram' })
    )
    scope.stop()
  })

  it('maps commit success to navigation target', async () => {
    const scope = effectScope()
    const wizard = scope.run(() =>
      useDiagramCopyWizard({ sourceModelId: ref('source-model') })
    )!
    wizard.targetModelId.value = 'target-model'
    wizard.targetNotationId.value = 'target-notation'
    wizard.diagramName.value = 'Copied diagram'
    wizard.diagramVersion.value = '1.0.0'
    await wizard.open('source-diagram')
    await flushWatcher()
    commitDiagramCopyMock.mockResolvedValue({
      success: true,
      data: { diagram: { id: 'copied-diagram' } },
    })

    await expect(wizard.commit()).resolves.toEqual({
      targetModelId: 'target-model',
      diagramId: 'copied-diagram',
    })
    scope.stop()
  })
})
