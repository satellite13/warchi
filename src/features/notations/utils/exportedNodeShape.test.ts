import { describe, expect, it } from 'vitest'
import { stripShapeDocumentFileId } from './exportedNodeShape'

describe('stripShapeDocumentFileId', () => {
  it('removes documentFileId from attrs JSON, keeps other keys', () => {
    const shape = {
      id: 'shape-1',
      name: 'Custom',
      outline: '{}',
      attrs: JSON.stringify({ documentFileId: 'file-abc', foo: 'bar' }),
    }
    const result = stripShapeDocumentFileId(shape)
    expect(result).toEqual({
      id: 'shape-1',
      name: 'Custom',
      outline: '{}',
      attrs: JSON.stringify({ foo: 'bar' }),
    })
  })

  it('leaves null attrs alone', () => {
    const shape = {
      id: 'shape-2',
      name: 'Plain',
      outline: '{}',
      attrs: null,
    }
    expect(stripShapeDocumentFileId(shape)).toBe(shape)
  })
})
