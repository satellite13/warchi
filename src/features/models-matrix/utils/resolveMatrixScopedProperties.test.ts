import { describe, expect, it } from 'vitest'
import type { EditorDiagram, EditorLink, EditorNode } from '@/features/models/types'
import {
  resolveMatrixLinkRelationProperties,
  resolveMatrixNodeComponentProperties,
} from './resolveMatrixScopedProperties'

const createNode = (overrides?: Partial<EditorNode['parsedAttrs']>): EditorNode => ({
  id: 'node-1',
  name: 'Node',
  modelId: 'm1',
  ownerId: 'u1',
  nodeTypeId: 'nt1',
  parsedAttrs: {
    treeOrder: 0,
    notationComponents: { n1: { componentId: 'c1' } },
    componentProperties: {
      n1: {
        c1: {
          status: 'new',
          group: true,
        },
      },
    },
    typeProperties: {},
    ...overrides,
  },
})

const createDiagram = (params: {
  attrsPending?: boolean
  notationId?: string
  status?: string
}): EditorDiagram => ({
  id: 'd1',
  name: 'Diagram',
  version: '1.0.0',
  modelId: 'm1',
  notationId: params.notationId ?? 'n1',
  ownerId: 'u1',
  _attrsPending: params.attrsPending,
  parsedAttrs: {
    instances: {
      nodes: [
        {
          id: 'inst-1',
          modelNodeId: 'node-1',
          x: 0,
          y: 0,
          attrs:
            params.status === undefined
              ? undefined
              : {
                  componentProperties: {
                    n1: {
                      c1: {
                        status: params.status,
                        group: true,
                      },
                    },
                  },
                },
        },
      ],
      edges: [
        {
          id: 'edge-1',
          modelLinkId: 'link-1',
          sourceInstanceId: 'inst-1',
          targetInstanceId: 'inst-1',
          attrs: {
            relationProperties: {
              n1: {
                r1: {
                  weight: 10,
                },
              },
            },
          },
        },
      ],
    },
  },
})

const createLink = (): EditorLink => ({
  id: 'link-1',
  sourceId: 'node-1',
  targetId: 'node-1',
  modelId: 'm1',
  ownerId: 'u1',
  linkTypeId: 'lt1',
  parsedAttrs: {
    notationRelations: { n1: { relationId: 'r1' } },
    relationProperties: {
      n1: {
        r1: {
          weight: 1,
        },
      },
    },
  },
})

describe('resolveMatrixNodeComponentProperties', () => {
  it('prefers diagram instance snapshot over legacy node defaults', () => {
    const values = resolveMatrixNodeComponentProperties({
      node: createNode(),
      notationId: 'n1',
      componentId: 'c1',
      diagrams: [createDiagram({ status: 'active' })],
    })

    expect(values.status).toBe('active')
    expect(values.group).toBe(true)
  })

  it('falls back to legacy node properties when diagrams have no snapshot', () => {
    const values = resolveMatrixNodeComponentProperties({
      node: createNode(),
      notationId: 'n1',
      componentId: 'c1',
      diagrams: [createDiagram({})],
    })

    expect(values.status).toBe('new')
    expect(values.group).toBe(true)
  })

  it('ignores diagrams with pending attrs', () => {
    const values = resolveMatrixNodeComponentProperties({
      node: createNode(),
      notationId: 'n1',
      componentId: 'c1',
      diagrams: [createDiagram({ status: 'active', attrsPending: true })],
    })

    expect(values.status).toBe('new')
  })
})

describe('resolveMatrixLinkRelationProperties', () => {
  it('prefers diagram edge snapshot over legacy link properties', () => {
    const values = resolveMatrixLinkRelationProperties({
      link: createLink(),
      notationId: 'n1',
      relationId: 'r1',
      diagrams: [createDiagram({ status: 'active' })],
    })

    expect(values.weight).toBe(10)
  })
})
