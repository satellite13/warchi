import { describe, expect, it } from 'vitest'
import type { DiagramAttrs, ModelLinkAttrs, ModelNodeAttrs } from '../modelAttrs'
import {
  getDiagramScopedLinkMap,
  getDiagramScopedNodeValues,
  setDiagramScopedLinkValue,
  setDiagramScopedNodeValue,
} from './diagramScopedProperties'

function makeDiagram(): DiagramAttrs {
  return {
    instances: {
      nodes: [
        {
          id: 'inst-node-1',
          modelNodeId: 'node-1',
          x: 10,
          y: 20,
        },
      ],
      edges: [
        {
          id: 'inst-edge-1',
          modelLinkId: 'link-1',
          sourceInstanceId: 'inst-node-1',
          targetInstanceId: 'inst-node-1',
        },
      ],
    },
  }
}

describe('diagramScopedProperties', () => {
  it('reads node values from legacy fallback when snapshot is absent', () => {
    const diagram = makeDiagram()
    const nodeAttrs: ModelNodeAttrs = {
      treeOrder: 0,
      notationComponents: {},
      componentProperties: {
        n1: {
          c1: {
            name: 'legacy-value',
          },
        },
      },
      typeProperties: {},
    }

    const values = getDiagramScopedNodeValues({
      diagram,
      modelNodeId: 'node-1',
      notationId: 'n1',
      componentId: 'c1',
      nodeAttrsFallback: nodeAttrs,
    })

    expect(values.name).toBe('legacy-value')
  })

  it('materializes node snapshot on write without mutating legacy attrs', () => {
    const diagram = makeDiagram()
    const nodeAttrs: ModelNodeAttrs = {
      treeOrder: 0,
      notationComponents: {},
      componentProperties: {
        n1: {
          c1: {
            name: 'legacy-value',
          },
        },
      },
      typeProperties: {},
    }

    const changed = setDiagramScopedNodeValue({
      diagram,
      modelNodeId: 'node-1',
      notationId: 'n1',
      componentId: 'c1',
      key: 'name',
      value: 'diagram-only',
      nodeAttrsFallback: nodeAttrs,
    })

    expect(changed).toBe(true)
    expect(nodeAttrs.componentProperties.n1?.c1?.name).toBe('legacy-value')
    expect(
      diagram.instances.nodes[0]?.attrs?.componentProperties?.n1?.c1?.name
    ).toBe('diagram-only')
  })

  it('merges link snapshot over legacy values for compare reads', () => {
    const diagram = makeDiagram()
    const linkAttrs: ModelLinkAttrs = {
      notationRelations: {},
      relationProperties: {
        n1: {
          r1: {
            status: 'legacy',
            untouched: 'keep',
          },
        },
      },
    }

    setDiagramScopedLinkValue({
      diagram,
      modelLinkId: 'link-1',
      notationId: 'n1',
      relationId: 'r1',
      key: 'status',
      value: 'snapshot',
      linkAttrsFallback: linkAttrs,
      edgeInstanceId: 'inst-edge-1',
    })

    const merged = getDiagramScopedLinkMap({
      diagram,
      modelLinkId: 'link-1',
      linkAttrsFallback: linkAttrs,
      edgeInstanceId: 'inst-edge-1',
    })

    expect(merged.n1?.r1?.status).toBe('snapshot')
    expect(merged.n1?.r1?.untouched).toBe('keep')
  })
})

