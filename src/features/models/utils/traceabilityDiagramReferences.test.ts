import { describe, expect, it } from 'vitest'
import type { DiagramReferenceResponse } from '@/types/api'
import { parseDiagramAttrs } from '../modelAttrs'
import type { EditorDiagram } from '../types'
import { resolveTraceabilityDiagramReferences } from './traceabilityDiagramReferences'

const reference = (id: string): DiagramReferenceResponse => ({
  id,
  name: `Remote ${id}`,
  version: '1.0.0',
  notationId: 'notation-1',
  nodeId: null,
})

const localDiagram = (
  id: string,
  nodeIds: string[],
  flags: Pick<EditorDiagram, '_isNew' | '_isDirty' | '_isDeleted'>
): EditorDiagram => {
  const parsedAttrs = parseDiagramAttrs(null)
  parsedAttrs.instances.nodes = nodeIds.map((modelNodeId, index) => ({
    id: `${id}-instance-${index}`,
    modelNodeId,
    x: 0,
    y: 0,
  }))
  return {
    id,
    name: `Local ${id}`,
    version: '2.0.0',
    ownerId: 'owner-1',
    modelId: 'model-1',
    notationId: 'notation-local',
    nodeId: 'folder-1',
    parsedAttrs,
    ...flags,
  }
}

describe('resolveTraceabilityDiagramReferences', () => {
  it('overlays only local changed diagrams and filters locally removed references', () => {
    const result = resolveTraceabilityDiagramReferences(
      [
        reference('remote-clean'),
        reference('dirty-removed'),
        reference('dirty-kept'),
        reference('deleted'),
      ],
      [
        localDiagram('dirty-removed', ['other'], { _isDirty: true }),
        localDiagram('dirty-kept', ['selected'], { _isDirty: true }),
        localDiagram('deleted', ['selected'], { _isDeleted: true }),
        localDiagram('local-new-b', ['selected'], { _isNew: true }),
        localDiagram('local-new-a', ['selected'], { _isNew: true }),
        localDiagram('local-other', ['other'], { _isNew: true }),
        localDiagram('clean-unloaded', ['selected'], {}),
      ],
      'selected'
    )

    expect(result.map(row => row.id)).toEqual([
      'remote-clean',
      'dirty-kept',
      'local-new-a',
      'local-new-b',
    ])
    expect(result[1]).toEqual({
      id: 'dirty-kept',
      name: 'Local dirty-kept',
      version: '2.0.0',
      notationId: 'notation-local',
      nodeId: 'folder-1',
    })
  })
})
