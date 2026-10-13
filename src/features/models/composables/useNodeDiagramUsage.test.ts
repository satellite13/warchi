import { describe, expect, it } from 'vitest'
import { collectNodeDiagramUsage, countNodeUsage } from './useNodeDiagramUsage'
import type { EditorDiagram } from '../types'

const diag = (id: string, modelNodeIds: string[], deleted = false): EditorDiagram =>
  ({
    id,
    _isDeleted: deleted,
    parsedAttrs: {
      instances: {
        nodes: modelNodeIds.map(modelNodeId => ({ id: `inst-${modelNodeId}`, modelNodeId })),
        links: [],
      },
    },
  }) as unknown as EditorDiagram

describe('useNodeDiagramUsage', () => {
  const diagrams = [
    diag('d1', ['n1', 'n2']),
    diag('d2', ['n1']),
    diag('d3', ['n1'], true), // удалённая — не считается
  ]

  it('collects diagram ids per node, excluding deleted diagrams', () => {
    const usage = collectNodeDiagramUsage(diagrams, ['n1', 'n2', 'n3'])
    expect(usage.get('n1')).toEqual(['d1', 'd2'])
    expect(usage.get('n2')).toEqual(['d1'])
    expect(usage.get('n3')).toEqual([])
  })

  it('counts usage', () => {
    expect(countNodeUsage(diagrams, 'n1')).toBe(2)
    expect(countNodeUsage(diagrams, 'n2')).toBe(1) // usedOn === 1 — порог предупреждения
    expect(countNodeUsage(diagrams, 'n3')).toBe(0)
  })
})
