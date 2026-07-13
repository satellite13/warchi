import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseNodeAttrs } from '../modelAttrs'
import type { EditorNode } from '../types'
import type { ModelData } from '@/types/entities'
import { apiPost, apiPut } from '@/composables/useApi'
import { saveModelMetadata, saveNodes } from './modelEditorSavePipeline'

vi.mock('@/composables/useApi', () => ({
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
}))

vi.mock('@/i18n', () => ({
  default: {
    global: {
      t: (key: string, params?: Record<string, unknown>) => {
        if (!params) return key
        return Object.entries(params).reduce(
          (message, [name, value]) => message.replaceAll(`{${name}}`, String(value)),
          key
        )
      },
    },
  },
}))

const ok = <T>(data: T) => ({ success: true as const, data })
const fail = (status: number, message: string) => ({
  success: false as const,
  error: { status, message },
})

function createNode(overrides: Partial<EditorNode> = {}): EditorNode {
  return {
    id: 'node-1',
    name: 'Node',
    modelId: 'model-1',
    ownerId: 'owner-1',
    nodeTypeId: 'node-type-1',
    parentNodeId: null,
    parsedAttrs: parseNodeAttrs(null),
    ...overrides,
  }
}

describe('modelEditorSavePipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('saveNodes', () => {
    it('creates pending parents before their children and clears _isNew', async () => {
      const child = createNode({
        id: 'tmp-child',
        name: 'Child',
        parentNodeId: 'tmp-parent',
        _isNew: true,
      })
      const parent = createNode({
        id: 'tmp-parent',
        name: 'Parent',
        _isNew: true,
      })
      vi.mocked(apiPost)
        .mockResolvedValueOnce(ok({ ...parent, id: 'real-parent', parentNodeId: null }))
        .mockResolvedValueOnce(ok({ ...child, id: 'real-child', parentNodeId: 'real-parent' }))

      const idMap = await saveNodes([child, parent], 'model-1', 'owner-1', vi.fn())

      expect(apiPost).toHaveBeenNthCalledWith(
        1,
        '/nodes',
        expect.objectContaining({ name: 'Parent', parentNodeId: null })
      )
      expect(apiPost).toHaveBeenNthCalledWith(
        2,
        '/nodes',
        expect.objectContaining({ name: 'Child', parentNodeId: 'real-parent' })
      )
      expect(idMap).toEqual(
        new Map([
          ['tmp-parent', 'real-parent'],
          ['tmp-child', 'real-child'],
        ])
      )
      expect(parent).toMatchObject({ id: 'real-parent', _isNew: false })
      expect(child).toMatchObject({ id: 'real-child', parentNodeId: 'real-parent', _isNew: false })
    })

    it('throws when pending node hierarchy contains a cycle', async () => {
      const first = createNode({ id: 'tmp-1', parentNodeId: 'tmp-2', _isNew: true })
      const second = createNode({ id: 'tmp-2', parentNodeId: 'tmp-1', _isNew: true })

      await expect(saveNodes([first, second], 'model-1', 'owner-1', vi.fn())).rejects.toThrow(
        'models.saveNodesHierarchyError'
      )
      expect(apiPost).not.toHaveBeenCalled()
    })
  })

  describe('saveModelMetadata', () => {
    it('uses the model conflict message key for 409 failures', async () => {
      const model: ModelData = {
        id: 'model-1',
        name: 'Model',
        version: '1.0.0',
        ownerId: 'owner-1',
      }
      vi.mocked(apiPut).mockResolvedValue(fail(409, 'Conflict'))

      await expect(saveModelMetadata(model, [])).rejects.toThrow('models.saveConflictNameVersion')
    })
  })
})
