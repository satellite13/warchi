import { describe, expect, it } from 'vitest'
import { summarizeCommands } from './summarizeCommands'
import type { DiagramScriptCommand } from './diagramScriptCommands'

describe('summarizeCommands', () => {
  it('counts add, remove and layout commands', () => {
    const commands: DiagramScriptCommand[] = [
      { type: 'addInstance', nodeId: 'n1' },
      { type: 'addInstance', nodeId: 'n2' },
      { type: 'addEdge', linkId: 'l1' },
      { type: 'removeInstance', instanceId: 'ia' },
      { type: 'removeEdge', edgeInstanceId: 'e1' },
      { type: 'setBounds', instanceId: 'ia', x: 1, y: 2 },
      { type: 'align', instanceIds: ['ia'], mode: 'left' },
      { type: 'distribute', instanceIds: ['ia', 'ib'], axis: 'horizontal' },
      { type: 'stack', instanceIds: ['ia', 'ib'], mode: 'vertical' },
      { type: 'setEdgeStyle', linkId: 'l1', strokeColor: '#dc3545' },
    ]
    expect(summarizeCommands(commands)).toEqual({
      addNodes: 2,
      addEdges: 1,
      remove: 2,
      layout: 4,
      style: 1,
    })
  })
})
