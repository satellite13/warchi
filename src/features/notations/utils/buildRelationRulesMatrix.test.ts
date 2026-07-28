import { describe, it, expect } from 'vitest'
import type { EditorComponent, EditorRelation, EditorRelationRule } from '../types'
import {
  buildRelationRulesMatrix,
  relationRulesMatrixCellKey,
  type RelationRulesMatrixFilters,
} from './buildRelationRulesMatrix'

const emptyFilters = (): RelationRulesMatrixFilters => ({
  selectedRowIds: [],
  selectedColumnIds: [],
  selectedRelationIds: [],
  hideEmptyAxes: false,
})

const component = (id: string, name: string, nodeTypeId = 'typed'): EditorComponent =>
  ({
    id,
    name,
    nodeTypeId,
    notationId: 'n1',
    ownerId: 'o1',
    version: '1.0.0',
    createdAt: '',
    updatedAt: '',
    attrs: null,
    parsedAttrs: { tags: [], customProperties: [] },
  }) as EditorComponent

const relation = (id: string, name: string, linkTypeId = 'typed'): EditorRelation =>
  ({
    id,
    name,
    linkTypeId,
    notationId: 'n1',
    ownerId: 'o1',
    version: '1.0.0',
    createdAt: '',
    updatedAt: '',
    attrs: null,
    parsedAttrs: { tags: [], customProperties: [] },
  }) as EditorRelation

const rule = (
  from: string,
  to: string,
  allowedRelationIds: string[],
  extra?: Partial<EditorRelationRule>,
): EditorRelationRule => ({
  id: `${from}-${to}`,
  fromComponentId: from,
  toComponentId: to,
  allowedRelationIds,
  ...extra,
})

describe('buildRelationRulesMatrix', () => {
  const components = [component('A', 'Alpha'), component('B', 'Beta'), component('C', 'Gamma')]
  const relations = [relation('r1', 'Serves'), relation('r2', 'Uses'), relation('r3', 'Flows')]

  it('builds a full matrix with cell counts and names', () => {
    const result = buildRelationRulesMatrix({
      filters: emptyFilters(),
      components,
      relations,
      relationRules: [rule('A', 'B', ['r1', 'r2']), rule('B', 'C', ['r3'])],
      untypedNodeTypeIds: new Set(),
      untypedLinkTypeIds: new Set(),
    })

    expect(result.rows.map(r => r.id)).toEqual(['A', 'B', 'C'])
    expect(result.columns.map(c => c.id)).toEqual(['A', 'B', 'C'])
    expect(result.maxCellTotal).toBe(2)

    const ab = result.cells[relationRulesMatrixCellKey('A', 'B')]
    expect(ab).toMatchObject({
      total: 2,
      relationIds: ['r1', 'r2'],
      relationNames: ['Serves', 'Uses'],
    })
  })

  it('excludes deleted and untyped components/relations', () => {
    const result = buildRelationRulesMatrix({
      filters: emptyFilters(),
      components: [
        ...components,
        { ...component('D', 'Deleted'), _isDeleted: true },
        component('U', 'Untyped', 'untyped-node'),
      ],
      relations: [
        ...relations,
        { ...relation('rx', 'Gone'), _isDeleted: true },
        relation('ru', 'UntypedRel', 'untyped-link'),
      ],
      relationRules: [
        rule('A', 'B', ['r1', 'rx', 'ru']),
        rule('U', 'A', ['r1']),
        rule('A', 'U', ['r1']),
      ],
      untypedNodeTypeIds: new Set(['untyped-node']),
      untypedLinkTypeIds: new Set(['untyped-link']),
    })

    expect(result.rows.map(r => r.id)).toEqual(['A', 'B', 'C'])
    expect(result.relationOptions.map(r => r.name)).toEqual(['Flows', 'Serves', 'Uses'])
    expect(result.cells[relationRulesMatrixCellKey('A', 'B')]?.relationIds).toEqual(['r1'])
    expect(result.cells[relationRulesMatrixCellKey('U', 'A')]).toBeUndefined()
  })

  it('filters rows and columns by selection', () => {
    const result = buildRelationRulesMatrix({
      filters: {
        ...emptyFilters(),
        selectedRowIds: ['A'],
        selectedColumnIds: ['B', 'C'],
      },
      components,
      relations,
      relationRules: [rule('A', 'B', ['r1'])],
      untypedNodeTypeIds: new Set(),
      untypedLinkTypeIds: new Set(),
    })

    expect(result.rows.map(r => r.id)).toEqual(['A'])
    expect(result.columns.map(c => c.id)).toEqual(['B', 'C'])
  })

  it('applies relation filter to displayed counts only', () => {
    const result = buildRelationRulesMatrix({
      filters: {
        ...emptyFilters(),
        selectedRelationIds: ['r1'],
      },
      components,
      relations,
      relationRules: [rule('A', 'B', ['r1', 'r2'])],
      untypedNodeTypeIds: new Set(),
      untypedLinkTypeIds: new Set(),
    })

    const ab = result.cells[relationRulesMatrixCellKey('A', 'B')]
    expect(ab?.total).toBe(1)
    expect(ab?.relationIds).toEqual(['r1'])
    expect(result.maxCellTotal).toBe(1)
  })

  it('hides empty rows and columns when enabled', () => {
    const result = buildRelationRulesMatrix({
      filters: {
        ...emptyFilters(),
        hideEmptyAxes: true,
      },
      components,
      relations,
      relationRules: [rule('A', 'B', ['r1'])],
      untypedNodeTypeIds: new Set(),
      untypedLinkTypeIds: new Set(),
    })

    expect(result.rows.map(r => r.id)).toEqual(['A'])
    expect(result.columns.map(c => c.id)).toEqual(['B'])
  })

  it('ignores soft-deleted rules', () => {
    const result = buildRelationRulesMatrix({
      filters: emptyFilters(),
      components,
      relations,
      relationRules: [rule('A', 'B', ['r1'], { _isDeleted: true })],
      untypedNodeTypeIds: new Set(),
      untypedLinkTypeIds: new Set(),
    })

    expect(result.cells[relationRulesMatrixCellKey('A', 'B')]).toBeUndefined()
    expect(result.maxCellTotal).toBe(0)
  })

  it('returns empty axes for empty notation', () => {
    const result = buildRelationRulesMatrix({
      filters: emptyFilters(),
      components: [],
      relations: [],
      relationRules: [],
      untypedNodeTypeIds: new Set(),
      untypedLinkTypeIds: new Set(),
    })

    expect(result.rows).toEqual([])
    expect(result.columns).toEqual([])
    expect(result.relationOptions).toEqual([])
  })
})
