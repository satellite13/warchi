import type { DiagramScriptCommand } from './diagramScriptCommands'

export type DiagramScriptCommandSummary = {
  addNodes: number
  addEdges: number
  remove: number
  layout: number
  style: number
}

const LAYOUT_TYPES = new Set(['setBounds', 'align', 'distribute', 'stack'])

export function summarizeCommands(commands: DiagramScriptCommand[]): DiagramScriptCommandSummary {
  const summary: DiagramScriptCommandSummary = {
    addNodes: 0,
    addEdges: 0,
    remove: 0,
    layout: 0,
    style: 0,
  }
  for (const command of commands) {
    switch (command.type) {
      case 'addInstance':
        summary.addNodes += 1
        break
      case 'addEdge':
        summary.addEdges += 1
        break
      case 'removeInstance':
      case 'removeEdge':
        summary.remove += 1
        break
      case 'setEdgeStyle':
        summary.style += 1
        break
      default:
        if (LAYOUT_TYPES.has(command.type)) summary.layout += 1
    }
  }
  return summary
}
