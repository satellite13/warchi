import { describe, expect, it } from 'vitest'
import { parseDiagramAttrs, parseLinkAttrs, parseNodeAttrs } from '../modelAttrs'
import type { EditorDiagram, EditorLink, EditorNode } from '../types'
import {
  applyDiagramNotationMigration,
  buildComponentIdRemap,
  buildRelationIdRemap,
} from './migrateDiagramNotation'

describe('migrateDiagramNotation', () => {
  it('maps components by unique name', () => {
    const { remap, unmapped } = buildComponentIdRemap(
      [
        { id: 'old-a', name: 'App', nodeTypeId: 'nt1' } as never,
        { id: 'old-b', name: 'Missing', nodeTypeId: 'nt1' } as never,
      ],
      [{ id: 'new-a', name: 'App', nodeTypeId: 'nt1' } as never]
    )
    expect(remap.get('old-a')).toBe('new-a')
    expect(remap.has('old-b')).toBe(false)
    expect(unmapped).toEqual(['Missing'])
  })

  it('disambiguates same-name components by nodeTypeId', () => {
    const { remap } = buildComponentIdRemap(
      [{ id: 'old-1', name: 'Dup', nodeTypeId: 'nt-a' } as never],
      [
        { id: 'new-x', name: 'Dup', nodeTypeId: 'nt-b' } as never,
        { id: 'new-1', name: 'Dup', nodeTypeId: 'nt-a' } as never,
      ]
    )
    expect(remap.get('old-1')).toBe('new-1')
  })

  it('maps relations by unique name', () => {
    const { remap } = buildRelationIdRemap(
      [{ id: 'old-r', name: 'Serving', linkTypeId: 'lt1' } as never],
      [{ id: 'new-r', name: 'Serving', linkTypeId: 'lt1' } as never]
    )
    expect(remap.get('old-r')).toBe('new-r')
  })

  it('migrates diagram bindings and keeps old notation keys', () => {
    const diagram: EditorDiagram = {
      id: 'd1',
      name: 'D',
      version: '1.0.0',
      notationId: 'not-old',
      modelId: 'm1',
      ownerId: 'o1',
      nodeId: null,
      parsedAttrs: {
        ...parseDiagramAttrs(null),
        instances: {
          nodes: [
            {
              id: 'inst-1',
              modelNodeId: 'node-1',
              x: 0,
              y: 0,
              attrs: {
                componentProperties: {
                  'not-old': { 'cmp-old': { status: 'draft' } },
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
            },
          ],
        },
      },
    }
    const nodes: EditorNode[] = [
      {
        id: 'node-1',
        name: 'N1',
        modelId: 'm1',
        ownerId: 'o1',
        nodeTypeId: 'nt1',
        parentNodeId: null,
        parsedAttrs: {
          ...parseNodeAttrs(null),
          notationComponents: { 'not-old': { componentId: 'cmp-old' } },
          componentProperties: {
            'not-old': { 'cmp-old': { status: 'draft' } },
          },
        },
      },
    ]
    const links: EditorLink[] = [
      {
        id: 'link-1',
        sourceId: 'node-1',
        targetId: 'node-1',
        modelId: 'm1',
        ownerId: 'o1',
        linkTypeId: 'lt1',
        parsedAttrs: {
          ...parseLinkAttrs(null),
          notationRelations: { 'not-old': { relationId: 'rel-old' } },
          relationProperties: {
            'not-old': { 'rel-old': { confidence: 'high' } },
          },
        },
      },
    ]

    const result = applyDiagramNotationMigration({
      diagram,
      nodes,
      links,
      oldNotationId: 'not-old',
      newNotationId: 'not-new',
      componentRemap: new Map([['cmp-old', 'cmp-new']]),
      relationRemap: new Map([['rel-old', 'rel-new']]),
    })

    expect(diagram.notationId).toBe('not-new')
    expect(result.remappedNodes).toBe(1)
    expect(result.remappedLinks).toBe(1)
    expect(nodes[0]!.parsedAttrs.notationComponents['not-old']?.componentId).toBe('cmp-old')
    expect(nodes[0]!.parsedAttrs.notationComponents['not-new']?.componentId).toBe('cmp-new')
    expect(nodes[0]!.parsedAttrs.componentProperties['not-new']?.['cmp-new']?.status).toBe('draft')
    expect(links[0]!.parsedAttrs.notationRelations['not-new']?.relationId).toBe('rel-new')
    expect(
      diagram.parsedAttrs.instances.nodes[0]?.attrs?.componentProperties?.['not-new']?.['cmp-new']
        ?.status
    ).toBe('draft')
  })
})
