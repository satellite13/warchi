import type { EditorComponent, EditorRelation, EditorRelationRule } from '../types'

export type RelationRulesMatrixFilters = {
  selectedRowIds: string[]
  selectedColumnIds: string[]
  selectedRelationIds: string[]
  hideEmptyAxes: boolean
}

export type RelationRulesMatrixAxisOption = {
  id: string
  name: string
}

export type RelationRulesMatrixCell = {
  fromId: string
  toId: string
  total: number
  relationIds: string[]
  relationNames: string[]
}

export type RelationRulesMatrixResult = {
  rowOptions: RelationRulesMatrixAxisOption[]
  columnOptions: RelationRulesMatrixAxisOption[]
  relationOptions: RelationRulesMatrixAxisOption[]
  rows: RelationRulesMatrixAxisOption[]
  columns: RelationRulesMatrixAxisOption[]
  cells: Record<string, RelationRulesMatrixCell>
  maxCellTotal: number
}

export type BuildRelationRulesMatrixInput = {
  filters: RelationRulesMatrixFilters
  components: EditorComponent[]
  relations: EditorRelation[]
  relationRules: EditorRelationRule[]
  /** Node type ids considered untyped («diagram only») — components using them are excluded */
  untypedNodeTypeIds: Set<string>
  /** Link type ids considered untyped — relations using them are excluded */
  untypedLinkTypeIds: Set<string>
}

export function relationRulesMatrixCellKey(fromId: string, toId: string): string {
  return `${fromId}::${toId}`
}

export function buildRelationRulesMatrix(
  input: BuildRelationRulesMatrixInput,
): RelationRulesMatrixResult {
  const {
    filters,
    components,
    relations,
    relationRules,
    untypedNodeTypeIds,
    untypedLinkTypeIds,
  } = input

  const activeComponents = components
    .filter(c => !c._isDeleted && !untypedNodeTypeIds.has(c.nodeTypeId))
    .map(c => ({ id: c.id, name: c.name.trim() || c.id }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))

  const activeRelations = relations
    .filter(r => !r._isDeleted && !untypedLinkTypeIds.has(r.linkTypeId))
    .map(r => ({ id: r.id, name: r.name.trim() || r.id }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))

  const relationNameById = new Map(activeRelations.map(r => [r.id, r.name]))
  const activeRelationIdSet = new Set(activeRelations.map(r => r.id))
  const componentIdSet = new Set(activeComponents.map(c => c.id))

  const selectedRelationFilter =
    filters.selectedRelationIds.length > 0
      ? new Set(filters.selectedRelationIds.filter(id => activeRelationIdSet.has(id)))
      : null

  const cells: Record<string, RelationRulesMatrixCell> = {}
  let maxCellTotal = 0

  for (const rule of relationRules) {
    if (rule._isDeleted) continue
    if (!componentIdSet.has(rule.fromComponentId) || !componentIdSet.has(rule.toComponentId)) {
      continue
    }

    const allowed = rule.allowedRelationIds.filter(id => activeRelationIdSet.has(id))
    const displayed = selectedRelationFilter
      ? allowed.filter(id => selectedRelationFilter.has(id))
      : allowed

    const key = relationRulesMatrixCellKey(rule.fromComponentId, rule.toComponentId)
    const relationNames = displayed
      .map(id => relationNameById.get(id) ?? id)
      .filter(Boolean)

    cells[key] = {
      fromId: rule.fromComponentId,
      toId: rule.toComponentId,
      total: displayed.length,
      relationIds: displayed,
      relationNames,
    }
    if (displayed.length > maxCellTotal) maxCellTotal = displayed.length
  }

  const rowSelected =
    filters.selectedRowIds.length > 0
      ? activeComponents.filter(c => filters.selectedRowIds.includes(c.id))
      : activeComponents
  const columnSelected =
    filters.selectedColumnIds.length > 0
      ? activeComponents.filter(c => filters.selectedColumnIds.includes(c.id))
      : activeComponents

  let rows = rowSelected
  let columns = columnSelected

  if (filters.hideEmptyAxes) {
    const rowHasValue = (rowId: string): boolean =>
      columns.some(col => (cells[relationRulesMatrixCellKey(rowId, col.id)]?.total ?? 0) > 0)
    const colHasValue = (colId: string): boolean =>
      rows.some(row => (cells[relationRulesMatrixCellKey(row.id, colId)]?.total ?? 0) > 0)

    rows = rows.filter(r => rowHasValue(r.id))
    columns = columns.filter(c => colHasValue(c.id))
  }

  return {
    rowOptions: activeComponents,
    columnOptions: activeComponents,
    relationOptions: activeRelations,
    rows,
    columns,
    cells,
    maxCellTotal,
  }
}
