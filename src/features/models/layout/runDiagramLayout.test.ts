import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { DiagramAttrs } from '../modelAttrs'

const { layoutMock } = vi.hoisted(() => ({ layoutMock: vi.fn() }))

vi.mock('./elkLoader', () => ({
  getElk: async () => ({ layout: layoutMock }),
}))

import { defaultLayoutUiOptions } from './layoutOptions'
import {
  inferLayoutDirection,
  resolveLayoutScopeIds,
  runDiagramLayout,
} from './runDiagramLayout'

describe('inferLayoutDirection', () => {
  it('returns RIGHT when horizontal deltas dominate', () => {
    const nodes = [
      { id: 'a', x: 0, y: 0, width: 40, height: 40 },
      { id: 'b', x: 200, y: 10, width: 40, height: 40 },
    ]
    const edges = [{ sourceInstanceId: 'a', targetInstanceId: 'b' }]
    expect(inferLayoutDirection(nodes, edges, new Set(['a', 'b']))).toBe('RIGHT')
  })

  it('returns DOWN when vertical deltas dominate', () => {
    const nodes = [
      { id: 'a', x: 0, y: 0, width: 40, height: 40 },
      { id: 'b', x: 10, y: 200, width: 40, height: 40 },
    ]
    const edges = [{ sourceInstanceId: 'a', targetInstanceId: 'b' }]
    expect(inferLayoutDirection(nodes, edges, new Set(['a', 'b']))).toBe('DOWN')
  })

  it('returns RIGHT when there are no edges in scope', () => {
    const nodes = [
      { id: 'a', x: 0, y: 0, width: 40, height: 40 },
      { id: 'b', x: 100, y: 50, width: 40, height: 40 },
    ]
    expect(inferLayoutDirection(nodes, [], new Set(['a', 'b']))).toBe('RIGHT')
  })
})

describe('resolveLayoutScopeIds', () => {
  it('uses selection when non-empty', () => {
    expect(resolveLayoutScopeIds(['a', 'b'], ['a', 'b', 'c'])).toEqual(new Set(['a', 'b']))
  })
  it('falls back to all ids', () => {
    expect(resolveLayoutScopeIds([], ['a', 'b'])).toEqual(new Set(['a', 'b']))
  })
})

describe('runDiagramLayout', () => {
  beforeEach(() => {
    layoutMock.mockReset()
    layoutMock.mockResolvedValue({
      id: 'root',
      children: [
        { id: 'a', x: 0, y: 0, width: 80, height: 40 },
        { id: 'b', x: 160, y: 0, width: 80, height: 40 },
      ],
      edges: [],
    })
  })

  it('no-ops when fewer than 2 nodes in scope', async () => {
    const diagram: DiagramAttrs = {
      instances: {
        nodes: [{ id: 'a', modelNodeId: 'm', x: 0, y: 0 }],
        edges: [],
      },
    }
    const result = await runDiagramLayout({
      diagram,
      mode: 'layered',
      selectedInstanceIds: [],
    })
    expect(result).toEqual({ status: 'noop' })
    expect(layoutMock).not.toHaveBeenCalled()
  })

  it('passes layered algorithm and calls apply path', async () => {
    const diagram: DiagramAttrs = {
      instances: {
        nodes: [
          { id: 'a', modelNodeId: 'm1', x: 0, y: 0, width: 80, height: 40 },
          { id: 'b', modelNodeId: 'm2', x: 0, y: 80, width: 80, height: 40 },
        ],
        edges: [{ id: 'e1', modelLinkId: 'l1', sourceInstanceId: 'a', targetInstanceId: 'b' }],
      },
    }
    const result = await runDiagramLayout({
      diagram,
      mode: 'layered',
      selectedInstanceIds: [],
    })
    expect(result.status).toBe('ok')
    const graphArg = layoutMock.mock.calls[0]?.[0] as { layoutOptions?: Record<string, string> }
    expect(graphArg.layoutOptions?.['elk.algorithm']).toBe('layered')
    expect(graphArg.layoutOptions?.['elk.edgeRouting']).toBe('ORTHOGONAL')
  })

  it('uses sporeOverlap for tidy mode', async () => {
    const diagram: DiagramAttrs = {
      instances: {
        nodes: [
          { id: 'a', modelNodeId: 'm1', x: 0, y: 0, width: 80, height: 40 },
          { id: 'b', modelNodeId: 'm2', x: 10, y: 10, width: 80, height: 40 },
        ],
        edges: [],
      },
    }
    await runDiagramLayout({ diagram, mode: 'overlap', selectedInstanceIds: [] })
    const graphArg = layoutMock.mock.calls[0]?.[0] as { layoutOptions?: Record<string, string> }
    expect(graphArg.layoutOptions?.['elk.algorithm']).toBe('sporeOverlap')
  })

  it('returns error when layout fails and leaves diagram unchanged', async () => {
    layoutMock.mockRejectedValue(new Error('ELK layout failed'))

    const diagram: DiagramAttrs = {
      instances: {
        nodes: [
          { id: 'a', modelNodeId: 'm1', x: 0, y: 0, width: 80, height: 40 },
          { id: 'b', modelNodeId: 'm2', x: 120, y: 0, width: 80, height: 40 },
        ],
        edges: [],
      },
    }

    const result = await runDiagramLayout({
      diagram,
      mode: 'overlap',
    })

    expect(result).toEqual({ status: 'error', message: 'ELK layout failed' })
    expect(diagram.instances.nodes).toEqual([
      { id: 'a', modelNodeId: 'm1', x: 0, y: 0, width: 80, height: 40 },
      { id: 'b', modelNodeId: 'm2', x: 120, y: 0, width: 80, height: 40 },
    ])
  })

  it('ignores selectedInstanceIds and lays out all nodes', async () => {
    layoutMock.mockResolvedValue({
      id: 'root',
      children: [
        { id: 'a', x: 0, y: 0, width: 80, height: 40 },
        { id: 'b', x: 160, y: 0, width: 80, height: 40 },
        { id: 'c', x: 320, y: 0, width: 80, height: 40 },
      ],
      edges: [],
    })

    const diagram: DiagramAttrs = {
      instances: {
        nodes: [
          { id: 'a', modelNodeId: 'm1', x: 0, y: 0, width: 80, height: 40 },
          { id: 'b', modelNodeId: 'm2', x: 100, y: 0, width: 80, height: 40 },
          { id: 'c', modelNodeId: 'm3', x: 200, y: 0, width: 80, height: 40 },
        ],
        edges: [],
      },
    }

    await runDiagramLayout({
      diagram,
      mode: 'layered',
      selectedInstanceIds: ['a'],
    })

    const graphArg = layoutMock.mock.calls[0]?.[0] as { children?: { id: string }[] }
    const childIds = (graphArg.children ?? []).map(c => c.id).sort()
    expect(childIds).toEqual(['a', 'b', 'c'])
  })

  it('uses uiOptions mapping for layered', async () => {
    const diagram: DiagramAttrs = {
      instances: {
        nodes: [
          { id: 'a', modelNodeId: 'm1', x: 0, y: 0, width: 80, height: 40 },
          { id: 'b', modelNodeId: 'm2', x: 0, y: 80, width: 80, height: 40 },
        ],
        edges: [{ id: 'e1', modelLinkId: 'l1', sourceInstanceId: 'a', targetInstanceId: 'b' }],
      },
    }
    const ui = defaultLayoutUiOptions('layered')
    ui.direction = 'LEFT'
    ui.nodeNodeSpacing = 11

    await runDiagramLayout({ diagram, mode: 'layered', uiOptions: ui })

    const graphArg = layoutMock.mock.calls[0]?.[0] as { layoutOptions?: Record<string, string> }
    expect(graphArg.layoutOptions?.['elk.direction']).toBe('LEFT')
    expect(graphArg.layoutOptions?.['elk.spacing.nodeNode']).toBe('11')
  })

  it('AUTO direction still infers when ui.direction is AUTO', async () => {
    const diagram: DiagramAttrs = {
      instances: {
        nodes: [
          { id: 'a', modelNodeId: 'm1', x: 0, y: 0, width: 80, height: 40 },
          { id: 'b', modelNodeId: 'm2', x: 10, y: 200, width: 80, height: 40 },
        ],
        edges: [{ id: 'e1', modelLinkId: 'l1', sourceInstanceId: 'a', targetInstanceId: 'b' }],
      },
    }

    await runDiagramLayout({ diagram, mode: 'layered' })

    const graphArg = layoutMock.mock.calls[0]?.[0] as { layoutOptions?: Record<string, string> }
    expect(graphArg.layoutOptions?.['elk.direction']).toBe('DOWN')
  })
})
