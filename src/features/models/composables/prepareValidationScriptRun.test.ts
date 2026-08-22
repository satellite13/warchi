import { describe, expect, it, vi } from 'vitest'
import { createEmptyModelEditorState } from '../types'
import { parseNodeAttrs } from '../modelAttrs'
import { prepareValidationScriptRun } from './prepareValidationScriptRun'

describe('prepareValidationScriptRun', () => {
  it('does not start a script when the detached load is cancelled', async () => {
    const loader = {
      loadOverlayed: vi.fn(async () => ({ ok: false as const, cancelled: true, error: null })),
      cancel: vi.fn(),
    }

    const result = await prepareValidationScriptRun({
      loader,
      state: createEmptyModelEditorState(),
      modelName: 'Model',
      modelVersion: '1.0.0',
      openDiagramId: 'diagram-1',
    })

    expect(result).toEqual({ ok: false, cancelled: true, error: null })
  })

  it('builds a payload from the scripts loader without touching a save loader', async () => {
    const saveLoader = {
      loadOverlayed: vi.fn(),
      cancel: vi.fn(),
    }
    const scriptsLoader = {
      loadOverlayed: vi.fn(async () => ({
        ok: true as const,
        snapshot: {
          nodes: [
            {
              id: 'n-1',
              name: 'N',
              modelId: 'model-1',
              ownerId: 'owner-1',
              nodeTypeId: 'type-1',
              parentNodeId: null,
              parsedAttrs: parseNodeAttrs(null),
            },
          ],
          links: [],
        },
      })),
      cancel: vi.fn(),
    }

    const result = await prepareValidationScriptRun({
      loader: scriptsLoader,
      state: createEmptyModelEditorState(),
      modelName: 'Model',
      modelVersion: '1.0.0',
      openDiagramId: null,
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.payload.snapshot.model.nodes.map(node => node.id)).toEqual(['n-1'])
    }
    expect(scriptsLoader.loadOverlayed).toHaveBeenCalledTimes(1)
    expect(saveLoader.loadOverlayed).not.toHaveBeenCalled()
    expect(saveLoader.cancel).not.toHaveBeenCalled()
  })
})
