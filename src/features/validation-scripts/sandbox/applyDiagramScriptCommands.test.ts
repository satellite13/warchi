import { describe, expect, it } from 'vitest'
import { applyDiagramScriptCommands } from './applyDiagramScriptCommands'
import type { DiagramHistoryCommand } from '@/features/models/composables/useDiagramHistoryBatcher'
import type { EditorDiagram } from '@/features/models/types'

function diagramWith(n1 = true): EditorDiagram {
  return {
    id: 'd1',
    name: 'D',
    version: '1.0.0',
    notationId: 'not1',
    modelId: 'm1',
    ownerId: 'u1',
    createdAt: null,
    updatedAt: null,
    parsedAttrs: {
      instances: {
        nodes: n1
          ? [{ id: 'ia', modelNodeId: 'n1', x: 0, y: 0, width: 10, height: 10 }]
          : [],
        edges: [],
      },
    },
  } as EditorDiagram
}

describe('applyDiagramScriptCommands', () => {
  it('pushes instances and edges in one history command', () => {
    const diagram = diagramWith()
    const history: DiagramHistoryCommand[] = []
    applyDiagramScriptCommands({
      diagram,
      commands: [
        { type: 'addInstance', nodeId: 'n2', x: 1, y: 2 },
        { type: 'addEdge', linkId: 'l1' },
      ],
      linkEndpoints: { l1: { sourceId: 'n1', targetId: 'n2' } },
      executeHistory: (cmd) => history.push(cmd),
      createId: (() => {
        let i = 0
        return () => `new-${++i}`
      })(),
    })
    expect(history).toHaveLength(1)
    history[0]!.execute()
    expect(diagram.parsedAttrs.instances.nodes.some((n) => n.modelNodeId === 'n2')).toBe(true)
    expect(diagram.parsedAttrs.instances.edges.some((e) => e.modelLinkId === 'l1')).toBe(true)
    history[0]!.undo()
    expect(diagram.parsedAttrs.instances.nodes.some((n) => n.modelNodeId === 'n2')).toBe(false)
    expect(diagram.parsedAttrs.instances.edges).toEqual([])
  })

  it('removes an instance and its incident edges together', () => {
    const diagram = diagramWith()
    diagram.parsedAttrs.instances.nodes.push({
      id: 'ib',
      modelNodeId: 'n2',
      x: 20,
      y: 0,
      width: 10,
      height: 10,
    })
    diagram.parsedAttrs.instances.edges.push({
      id: 'e1',
      modelLinkId: 'l1',
      sourceInstanceId: 'ia',
      targetInstanceId: 'ib',
    })
    const history: DiagramHistoryCommand[] = []
    applyDiagramScriptCommands({
      diagram,
      commands: [{ type: 'removeInstance', instanceId: 'ib' }],
      linkEndpoints: {},
      executeHistory: (cmd) => history.push(cmd),
    })
    history[0]!.execute()
    expect(diagram.parsedAttrs.instances.nodes.map((n) => n.id)).toEqual(['ia'])
    expect(diagram.parsedAttrs.instances.edges).toEqual([])
    history[0]!.undo()
    expect(diagram.parsedAttrs.instances.nodes.some((n) => n.id === 'ib')).toBe(true)
    expect(diagram.parsedAttrs.instances.edges).toHaveLength(1)
  })
})
