import { describe, expect, it } from 'vitest'
import { runValidationScript } from './runValidationScript'
import type { ValidationSnapshot } from './types'

function snapshot(): ValidationSnapshot {
  return {
    model: {
      id: 'm1',
      name: 'M',
      version: '1.0.0',
      nodes: [{ id: 'n1', name: 'A', parentId: null, nodeTypeId: 'nt', attrs: null }],
      links: [],
      folders: [],
      diagrams: [
        {
          id: 'd1',
          name: 'D',
          version: '1.0.0',
          notationId: 'not1',
          nodeIds: ['n1'],
          linkIds: [],
          instances: [{ id: 'ia', modelNodeId: 'n1', x: 0, y: 0 }],
          edges: [],
        },
      ],
    },
    notations: [],
    types: { nodeTypes: [], linkTypes: [] },
  }
}

describe('runValidationScript', () => {
  it('returns issues and an empty command queue for a report-only script', async () => {
    const result = await runValidationScript({
      source: `report.info('x')`,
      snapshot: snapshot(),
      openDiagramId: 'd1',
      inProcess: true,
    })
    expect(result.issues).toEqual([{ level: 'info', message: 'x' }])
    expect(result.commands).toEqual([])
    expect(result.error).toBeUndefined()
  })

  it('returns queued apply commands from an in-process query', async () => {
    const result = await runValidationScript({
      source: `
const n = await neighbors(ctx.diagram.instances[0].modelNodeId, { direction: 'outgoing' })
apply.addInstance({ nodeId: n.items[0].node.id, x: 10, y: 10 })
`,
      snapshot: snapshot(),
      openDiagramId: 'd1',
      inProcess: true,
      query: async () => ({ items: [{ node: { id: 'n2' }, link: { id: 'l1' } }], last: true }),
    })
    expect(result.error).toBeUndefined()
    expect(result.commands).toEqual([{ type: 'addInstance', nodeId: 'n2', x: 10, y: 10 }])
  })
})
