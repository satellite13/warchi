import { describe, expect, it } from 'vitest'
import {
  modelEditorDiagramHref,
  selectedDiagramQueryMatches,
  withSelectedDiagramQuery,
} from './modelEditorDiagramLink'

describe('modelEditorDiagramLink', () => {
  it('treats a missing query as no selected diagram', () => {
    expect(selectedDiagramQueryMatches({}, null)).toBe(true)
    expect(selectedDiagramQueryMatches({ diagramId: 'd1' }, null)).toBe(false)
    expect(selectedDiagramQueryMatches({ diagramId: 'd1' }, 'd1')).toBe(true)
  })

  it('writes and clears diagramId without dropping other query keys', () => {
    expect(withSelectedDiagramQuery({ nodeId: 'n1' }, 'd2')).toEqual({
      nodeId: 'n1',
      diagramId: 'd2',
    })
    expect(withSelectedDiagramQuery({ diagramId: 'd2', nodeId: 'n1' }, null)).toEqual({
      nodeId: 'n1',
    })
  })

  it('builds an absolute editor URL for the open diagram', () => {
    const href = modelEditorDiagramHref(
      () => ({ href: '/models/m1?diagramId=d1' }),
      'https://warchi.example',
      'm1',
      'd1'
    )
    expect(href).toBe('https://warchi.example/models/m1?diagramId=d1')
  })
})
