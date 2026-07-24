import { describe, expect, it } from 'vitest'
import type { EditorLink, EditorNode } from '@/features/models/types'
import type { ComponentResponse, LinkTypeResponse, RelationResponse } from '@/types/api'
import { buildRelationMatrix, relationMatrixCellKey } from './buildRelationMatrix'
import type { RelationMatrixFilters } from '../types'

const createNode = (id: string, name: string, nodeTypeId: string): EditorNode => ({
  id,
  name,
  modelId: 'm1',
  ownerId: 'u1',
  nodeTypeId,
  parsedAttrs: {
    treeOrder: 0,
    notationComponents: {},
    componentProperties: {},
    typeProperties: {},
  },
})

const createLink = (id: string, sourceId: string, targetId: string, linkTypeId: string): EditorLink => ({
  id,
  sourceId,
  targetId,
  modelId: 'm1',
  ownerId: 'u1',
  linkTypeId,
  parsedAttrs: {
    notationRelations: {},
    relationProperties: {},
  },
})

const nodeTypes = [
  { id: 'service', name: 'Service' },
  { id: 'db', name: 'Database' },
]

const linkTypes: LinkTypeResponse[] = [
  { id: 'sync', name: 'Sync', ownerId: 'u1' },
  { id: 'async', name: 'Async', ownerId: 'u1' },
  { id: 'other', name: 'Other', ownerId: 'u1' },
]

const components: ComponentResponse[] = [
  { id: 'c-service', notationId: 'n1', nodeTypeId: 'service', name: 'AppComponent', version: '1.0.0', ownerId: 'u1' },
  { id: 'c-db', notationId: 'n1', nodeTypeId: 'db', name: 'DbComponent', version: '1.0.0', ownerId: 'u1' },
]

const relations: RelationResponse[] = [
  { id: 'r-sync', notationId: 'n1', linkTypeId: 'sync', name: 'SyncRelation', version: '1.0.0', ownerId: 'u1' },
  { id: 'r-async', notationId: 'n1', linkTypeId: 'async', name: 'AsyncRelation', version: '1.0.0', ownerId: 'u1' },
]

const baseFilters: RelationMatrixFilters = {
  notationId: null,
  selectedRowIds: [],
  selectedColumnIds: [],
  selectedRelationIds: ['sync', 'async'],
  allowedOnly: false,
  heatmapEnabled: true,
  hideEmptyAxes: false,
}

describe('buildRelationMatrix', () => {
  it('aggregates links by node/link types when notation is not selected', () => {
    const matrix = buildRelationMatrix({
      filters: baseFilters,
      nodes: [
        createNode('n-service-1', 'Service A', 'service'),
        createNode('n-db-1', 'Db A', 'db'),
      ],
      links: [
        createLink('l1', 'n-service-1', 'n-db-1', 'sync'),
        createLink('l2', 'n-service-1', 'n-db-1', 'sync'),
      ],
      nodeTypes,
      linkTypes,
      components,
      relations,
      relationRules: [],
      notations: [],
    })

    const cell = matrix.cells[relationMatrixCellKey('service', 'db')]
    expect(matrix.mode).toBe('types')
    expect(cell?.total).toBe(2)
    expect(cell?.relationCounts.sync).toBe(2)
    expect(cell?.allowedByNotationRules).toBe(false)
    expect(matrix.maxCellTotal).toBe(2)
  })

  it('notation mode groups by node type and link type without bindings', () => {
    const matrix = buildRelationMatrix({
      filters: {
        ...baseFilters,
        notationId: 'n1',
        selectedRelationIds: ['sync'],
        allowedOnly: false,
      },
      nodes: [
        createNode('n1', 'A', 'service'),
        createNode('n2', 'B', 'db'),
      ],
      links: [createLink('l1', 'n1', 'n2', 'sync')],
      nodeTypes,
      linkTypes,
      components,
      relations,
      relationRules: [{ relationId: 'r-sync', fromComponentId: 'c-service', toComponentId: 'c-db' }],
      notations: [],
    })

    expect(matrix.mode).toBe('notation')
    expect(matrix.relationOptions.map(relation => relation.id)).toEqual(['async', 'sync'])
    expect(matrix.rowOptions.map(row => row.id)).toEqual(['db', 'service'])

    const cell = matrix.cells[relationMatrixCellKey('service', 'db')]
    expect(cell?.total).toBe(1)
    expect(cell?.allowedByNotationRules).toBe(true)
  })

  it('excludes links whose link type is not used by notation relations', () => {
    const matrix = buildRelationMatrix({
      filters: {
        ...baseFilters,
        notationId: 'n1',
        selectedRelationIds: ['other', 'sync'],
        allowedOnly: false,
      },
      nodes: [
        createNode('n1', 'A', 'service'),
        createNode('n2', 'B', 'db'),
      ],
      links: [
        createLink('l1', 'n1', 'n2', 'sync'),
        createLink('l2', 'n1', 'n2', 'other'),
      ],
      nodeTypes,
      linkTypes,
      components,
      relations,
      relationRules: [],
      notations: [],
    })

    const cell = matrix.cells[relationMatrixCellKey('service', 'db')]
    expect(cell?.total).toBe(1)
    expect(cell?.relationCounts.sync).toBe(1)
    expect(cell?.relationCounts.other).toBeUndefined()
    expect(matrix.relationOptions.map(relation => relation.id)).toEqual(['async', 'sync'])
  })

  it('allowedOnly drops cells that are not allowed by rules', () => {
    const nodes = [
      createNode('n1', 'A', 'service'),
      createNode('n2', 'B', 'db'),
    ]
    const links = [createLink('l1', 'n1', 'n2', 'sync')]
    const filters = {
      ...baseFilters,
      notationId: 'n1',
      selectedRelationIds: ['sync'],
      allowedOnly: true,
    }
    const input = {
      filters,
      nodes,
      links,
      nodeTypes,
      linkTypes,
      components,
      relations,
      notations: [],
    }

    const withoutRule = buildRelationMatrix({ ...input, relationRules: [] })
    expect(withoutRule.cells[relationMatrixCellKey('service', 'db')]).toBeUndefined()

    const withRule = buildRelationMatrix({
      ...input,
      relationRules: [{ relationId: 'r-sync', fromComponentId: 'c-service', toComponentId: 'c-db' }],
    })
    expect(withRule.cells[relationMatrixCellKey('service', 'db')]?.total).toBe(1)
  })

  it('hides empty rows and columns when hideEmptyAxes is enabled', () => {
    const matrix = buildRelationMatrix({
      filters: {
        ...baseFilters,
        hideEmptyAxes: true,
        selectedRowIds: ['service', 'db'],
        selectedColumnIds: ['service', 'db'],
      },
      nodes: [
        createNode('n-service-1', 'Service A', 'service'),
        createNode('n-db-1', 'Db A', 'db'),
      ],
      links: [createLink('l1', 'n-service-1', 'n-db-1', 'sync')],
      nodeTypes,
      linkTypes,
      components,
      relations,
      relationRules: [],
      notations: [],
    })

    expect(matrix.rows.map(item => item.id)).toEqual(['service'])
    expect(matrix.columns.map(item => item.id)).toEqual(['db'])
  })
})
