import { describe, expect, it } from 'vitest'
import {
  mergeDiagramAttrsAfterBatchConflictReload,
  mergeDiagramAttrsKeepLocalInstanceCustom,
  mergeScopedValuesLocalWins,
} from './mergeLocalCustomPropsAfterReload'
import type { DiagramAttrs } from '../modelAttrs'

describe('mergeScopedValuesLocalWins', () => {
  it('overlays local property keys onto server', () => {
    const server = {
      n1: { c1: { a: 1, b: 2 } },
    }
    const local = {
      n1: { c1: { b: 9, c: 3 } },
    }
    const out = mergeScopedValuesLocalWins(server, local)
    expect(out.n1?.c1).toEqual({ a: 1, b: 9, c: 3 })
  })

  it('adds local notation/component branches missing on server', () => {
    const server = {}
    const local = { n2: { c2: { x: 'keep' } } }
    const out = mergeScopedValuesLocalWins(server, local)
    expect(out).toEqual(local)
  })
})

describe('mergeDiagramAttrsKeepLocalInstanceCustom', () => {
  it('merges instance componentProperties by modelNodeId', () => {
    const server: DiagramAttrs = {
      instances: {
        nodes: [
          {
            id: 'i1',
            modelNodeId: 'node-a',
            x: 0,
            y: 0,
            attrs: { componentProperties: { n: { c: { p: 'srv' } } } },
          },
        ],
        edges: [],
      },
    }
    const local: DiagramAttrs = {
      instances: {
        nodes: [
          {
            id: 'old',
            modelNodeId: 'node-a',
            x: 99,
            y: 99,
            attrs: { componentProperties: { n: { c: { p: 'local' } } } },
          },
        ],
        edges: [],
      },
    }
    const out = mergeDiagramAttrsKeepLocalInstanceCustom(server, local)
    expect(out.instances.nodes[0]?.x).toBe(0)
    expect(out.instances.nodes[0]?.attrs?.componentProperties?.n?.c).toEqual({ p: 'local' })
  })
})

describe('mergeDiagramAttrsAfterBatchConflictReload', () => {
  it('keeps local instances when they differed from server before reload', () => {
    const localBefore: DiagramAttrs = {
      instances: {
        nodes: [{ id: 'i1', modelNodeId: 'n1', x: 10, y: 20, width: 100, height: 50 }],
        edges: [],
      },
    }
    const serverBefore: DiagramAttrs = {
      instances: {
        nodes: [{ id: 'i1', modelNodeId: 'n1', x: 0, y: 0, width: 100, height: 50 }],
        edges: [],
      },
    }
    const afterReload: DiagramAttrs = {
      instances: {
        nodes: [{ id: 'i1', modelNodeId: 'n1', x: 99, y: 99, width: 100, height: 50 }],
        edges: [],
      },
      documentFileId: 'file-new',
    }
    const out = mergeDiagramAttrsAfterBatchConflictReload(localBefore, serverBefore, afterReload)
    expect(out.instances.nodes[0]?.x).toBe(10)
    expect(out.instances.nodes[0]?.y).toBe(20)
    expect(out.documentFileId).toBe('file-new')
  })

  it('takes server instances when they matched server before reload', () => {
    const inst: DiagramAttrs['instances'] = {
      nodes: [{ id: 'i1', modelNodeId: 'n1', x: 1, y: 2, width: 10, height: 10 }],
      edges: [],
    }
    const localBefore: DiagramAttrs = { instances: inst }
    const serverBefore: DiagramAttrs = { instances: inst }
    const afterReload: DiagramAttrs = {
      instances: {
        nodes: [{ id: 'i1', modelNodeId: 'n1', x: 50, y: 60, width: 10, height: 10 }],
        edges: [],
      },
    }
    const out = mergeDiagramAttrsAfterBatchConflictReload(localBefore, serverBefore, afterReload)
    expect(out.instances.nodes[0]?.x).toBe(50)
    expect(out.instances.nodes[0]?.y).toBe(60)
  })
})
