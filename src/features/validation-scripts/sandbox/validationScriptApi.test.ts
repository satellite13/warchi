import { describe, expect, it } from 'vitest'
import {
  createValidationScriptApi,
  executeValidationScript,
  resolveReportArgs,
} from './validationScriptApi'
import type { ValidationIssue, ValidationSnapshot } from './types'
import { getValidationScriptTopLevelNames } from '../validationScriptApiCatalog'

function sampleSnapshot(): ValidationSnapshot {
  return {
    model: {
      id: 'm1',
      name: 'M',
      version: '1.0.0',
      nodes: [
        { id: 'n1', name: 'App1', parentId: null, nodeTypeId: 'nt-app', attrs: null },
        { id: 'n2', name: 'App2', parentId: null, nodeTypeId: 'nt-app', attrs: null },
        { id: 'n3', name: 'Db', parentId: null, nodeTypeId: 'nt-db', attrs: null },
      ],
      links: [
        {
          id: 'l1',
          name: 'a',
          sourceId: 'n1',
          targetId: 'n2',
          linkTypeId: 'lt-flow',
          attrs: null,
        },
        {
          id: 'l2',
          name: 'b',
          sourceId: 'n2',
          targetId: 'n1',
          linkTypeId: 'lt-flow',
          attrs: null,
        },
        {
          id: 'l3',
          name: 'c',
          sourceId: 'n1',
          targetId: 'n3',
          linkTypeId: 'lt-flow',
          attrs: null,
        },
        {
          id: 'l4',
          name: 'd',
          sourceId: 'n1',
          targetId: 'n2',
          linkTypeId: 'lt-flow',
          attrs: null,
        },
      ],
      folders: [],
      diagrams: [
        {
          id: 'd1',
          name: 'Deployment',
          version: '1.0.0',
          notationId: 'not1',
          nodeIds: ['n1', 'n2'],
          linkIds: ['l1'],
        },
      ],
    },
    notations: [
      {
        id: 'not1',
        name: 'N',
        version: '1.0.0',
        components: [
          { id: 'c-app', name: 'Application', notationId: 'not1', nodeTypeId: 'nt-app' },
        ],
        relations: [{ id: 'r1', name: 'Flow', notationId: 'not1', linkTypeId: 'lt-flow' }],
        relationRules: [
          {
            id: 'rr1',
            relationId: 'r1',
            fromComponentId: 'c-app',
            toComponentId: 'c-app',
          },
        ],
      },
    ],
    types: {
      nodeTypes: [
        { id: 'nt-app', name: 'Application', attrs: null },
        { id: 'nt-db', name: 'Database', attrs: null },
      ],
      linkTypes: [{ id: 'lt-flow', name: 'Flow', attrs: null }],
    },
  }
}

describe('validationScriptApi', () => {
  it('exposes every catalog top-level binding', () => {
    const issues: ValidationIssue[] = []
    const api = createValidationScriptApi(sampleSnapshot(), 'd1', issues)
    for (const name of getValidationScriptTopLevelNames()) {
      expect(api).toHaveProperty(name)
    }
  })

  it('finds directed duplicate links by endpoints+type', () => {
    const issues: ValidationIssue[] = []
    const api = createValidationScriptApi(sampleSnapshot(), null, issues)
    const dups = api.findDuplicateLinks({ by: 'endpoints+type' })
    expect(dups).toHaveLength(1)
    expect(dups[0]?.linkIds.sort()).toEqual(['l1', 'l4'])
    expect(dups[0]?.sourceId).toBe('n1')
    expect(dups[0]?.targetId).toBe('n2')
  })

  it('can find undirected duplicate links when directed is false', () => {
    const issues: ValidationIssue[] = []
    const api = createValidationScriptApi(sampleSnapshot(), null, issues)
    const dups = api.findDuplicateLinks({ by: 'endpoints+type', directed: false })
    expect(dups).toHaveLength(1)
    expect(dups[0]?.linkIds.sort()).toEqual(['l1', 'l2', 'l4'])
  })

  it('filters diagram nodes and nodesOfType by name', () => {
    const issues: ValidationIssue[] = []
    const api = createValidationScriptApi(sampleSnapshot(), 'd1', issues)
    expect(api.diagramNodes(api.ctx.diagram!).map((n) => n.id).sort()).toEqual(['n1', 'n2'])
    expect(api.nodesOfType('Application')).toHaveLength(2)
    expect(api.nodesOfType('nt-db')).toHaveLength(1)
  })

  it('runs diagram checklist golden script', async () => {
    const snapshot = sampleSnapshot()
    const issues: ValidationIssue[] = []
    const api = createValidationScriptApi(snapshot, 'd1', issues, {
      query: async (method, args) => {
        if (method !== 'linksBetween') return []
        const a = String(args.a)
        const b = String(args.b)
        return snapshot.model.links.filter((link) => {
          const pair =
            (link.sourceId === a && link.targetId === b) ||
            (link.sourceId === b && link.targetId === a)
          return pair && link.linkTypeId === 'lt-flow'
        })
      },
    })
    const source = `
if (!ctx.diagram) {
  report.error('Open a diagram before running this script')
} else {
  const onDiagram = new Set(diagramNodes(ctx.diagram).map((n) => n.id))
  const apps = nodesOfType('Application').filter((n) => onDiagram.has(n.id))
  if (apps.length < 2) {
    report.error('Need at least two Application components on diagram', {
      kind: 'diagram',
      id: ctx.diagram.id,
    })
  }
  const between = await linksBetween(apps[0], apps[1], { linkType: 'Flow' })
  if (between.length === 0) {
    report.warn('No Flow link between applications on diagram')
  } else {
    report.info('Flow link present')
  }
}
`
    const { error } = await executeValidationScript(source, api)
    expect(error).toBeUndefined()
    expect(issues.some((i) => i.level === 'info' && i.message.includes('Flow'))).toBe(true)
  })

  it('runs duplicate-links golden script', async () => {
    const issues: ValidationIssue[] = []
    const api = createValidationScriptApi(sampleSnapshot(), null, issues)
    const source = `
for (const dup of findDuplicateLinks({ by: 'endpoints+type' })) {
  report.warn('Duplicate link', { kind: 'link', id: dup.linkIds[0] })
}
`
    const { error } = await executeValidationScript(source, api)
    expect(error).toBeUndefined()
    expect(issues).toHaveLength(1)
    expect(issues[0]?.level).toBe('warn')
    expect(issues[0]?.target?.kind).toBe('link')
  })

  it('resolveReportArgs appends node name when a snapshot node is passed', () => {
    const resolved = resolveReportArgs('Node:', {
      id: 'n1',
      name: 'App1',
      parentId: null,
      nodeTypeId: 'nt-app',
      attrs: null,
    })
    expect(resolved.message).toBe('Node: App1')
    expect(resolved.target).toEqual({ kind: 'node', id: 'n1' })
  })

  it('report.info accepts a snapshot node as second argument', async () => {
    const issues: ValidationIssue[] = []
    const api = createValidationScriptApi(sampleSnapshot(), 'd1', issues)
    const { error } = await executeValidationScript(
      `
if (ctx.diagram) {
  diagramNodes(ctx.diagram).forEach((n) => report.info('Node:', n))
} else {
  report.warn('Diagram not opened')
}
`,
      api
    )
    expect(error).toBeUndefined()
    expect(issues.map((i) => i.message).sort()).toEqual(['Node: App1', 'Node: App2'])
    expect(issues.every((i) => i.target?.kind === 'node')).toBe(true)
  })

  it('captures runtime errors and keeps prior issues', async () => {
    const issues: ValidationIssue[] = []
    const api = createValidationScriptApi(sampleSnapshot(), null, issues)
    const { error } = await executeValidationScript(
      `report.info('before'); throw new Error('boom')`,
      api
    )
    expect(error).toContain('boom')
    expect(issues).toEqual([{ level: 'info', message: 'before' }])
  })

  it('supports await neighbors and queues apply without mutating the snapshot', async () => {
    const snapshot = sampleSnapshot()
    snapshot.model.diagrams[0] = {
      ...snapshot.model.diagrams[0]!,
      instances: [{ id: 'ia', modelNodeId: 'n1', x: 0, y: 0 }],
      edges: [],
    }
    const issues: ValidationIssue[] = []
    const commands: import('./diagramScriptCommands').DiagramScriptCommand[] = []
    const api = createValidationScriptApi(snapshot, 'd1', issues, {
      commands,
      query: async (method) => {
        expect(method).toBe('neighbors')
        return {
          items: [{ node: { id: 'n3' }, link: { id: 'l3' } }],
          last: true,
        }
      },
    })
    const source = `
const n = await neighbors(ctx.diagram.instances[0].modelNodeId, { direction: 'outgoing' })
apply.addInstance({ nodeId: n.items[0].node.id, x: 10, y: 10 })
`
    const { error } = await executeValidationScript(source, api)
    expect(error).toBeUndefined()
    expect(commands).toEqual([{ type: 'addInstance', nodeId: 'n3', x: 10, y: 10 }])
    expect(snapshot.model.nodes.map((n) => n.id)).toEqual(['n1', 'n2', 'n3'])
    expect(snapshot.model.diagrams[0]?.instances).toHaveLength(1)
  })

  it('queues setEdgeStyle without mutating the snapshot', async () => {
    const snapshot = sampleSnapshot()
    snapshot.model.diagrams[0] = {
      ...snapshot.model.diagrams[0]!,
      edges: [{ id: 'e1', modelLinkId: 'l1', sourceInstanceId: 'ia', targetInstanceId: 'ib' }],
    }
    const issues: ValidationIssue[] = []
    const commands: import('./diagramScriptCommands').DiagramScriptCommand[] = []
    const api = createValidationScriptApi(snapshot, 'd1', issues, { commands })
    const { error } = await executeValidationScript(
      `apply.setEdgeStyle({ linkId: 'l1', strokeColor: '#dc3545' })`,
      api
    )
    expect(error).toBeUndefined()
    expect(commands).toEqual([{ type: 'setEdgeStyle', linkId: 'l1', strokeColor: '#dc3545' }])
    expect(snapshot.model.diagrams[0]?.edges?.[0]).toEqual({
      id: 'e1',
      modelLinkId: 'l1',
      sourceInstanceId: 'ia',
      targetInstanceId: 'ib',
    })
  })

  it('still runs a sync report-only script', async () => {
    const issues: ValidationIssue[] = []
    const api = createValidationScriptApi(sampleSnapshot(), 'd1', issues)
    const { error } = await executeValidationScript(`report.info('x')`, api)
    expect(error).toBeUndefined()
    expect(issues).toEqual([{ level: 'info', message: 'x' }])
  })
})
