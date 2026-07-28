import {
  type BuildRelationMatrixInput,
  type RelationMatrixCell,
  type RelationMatrixEntityOption,
  type RelationMatrixLinkItem,
  type RelationMatrixMode,
  type RelationMatrixResult,
  type RelationMatrixRuleInput,
} from '../types'
import { isPairAllowedByNotationRules } from './isPairAllowedByNotationRules'

const toCellKey = (rowId: string, columnId: string): string => `${rowId}:::${columnId}`

const sortOptions = (items: RelationMatrixEntityOption[]): RelationMatrixEntityOption[] =>
  [...items].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))

function resolveMode(notationId: string | null): RelationMatrixMode {
  return notationId ? 'notation' : 'types'
}

function buildRowAndColumnOptions(input: BuildRelationMatrixInput): RelationMatrixEntityOption[] {
  return sortOptions(
    input.nodeTypes.map<RelationMatrixEntityOption>(nodeType => ({
      id: nodeType.id,
      name: nodeType.name,
      kind: 'row',
    }))
  )
}

function buildRelationOptions(
  input: BuildRelationMatrixInput,
  mode: RelationMatrixMode
): RelationMatrixEntityOption[] {
  if (mode === 'notation') {
    const notationId = input.filters.notationId!
    const linkTypeIds = new Set(
      input.relations.filter(relation => relation.notationId === notationId).map(relation => relation.linkTypeId)
    )
    return sortOptions(
      input.linkTypes
        .filter(linkType => linkTypeIds.has(linkType.id))
        .map<RelationMatrixEntityOption>(linkType => ({
          id: linkType.id,
          name: linkType.name,
          kind: 'relation',
        }))
    )
  }

  return sortOptions(
    input.linkTypes.map<RelationMatrixEntityOption>(linkType => ({
      id: linkType.id,
      name: linkType.name,
      kind: 'relation',
    }))
  )
}

function notationLinkTypeIds(input: BuildRelationMatrixInput, notationId: string): Set<string> {
  return new Set(
    input.relations.filter(relation => relation.notationId === notationId).map(relation => relation.linkTypeId)
  )
}

function activeRelationRules(rules: RelationMatrixRuleInput[]): RelationMatrixRuleInput[] {
  return rules.filter(rule => !rule._isDeleted)
}

function optionNameById(options: RelationMatrixEntityOption[]): Map<string, string> {
  return new Map(options.map(option => [option.id, option.name]))
}

function toColumnOptions(rows: RelationMatrixEntityOption[]): RelationMatrixEntityOption[] {
  return rows.map(item => ({ ...item, kind: 'column' }))
}

function pushCellItem(
  cell: RelationMatrixCell,
  item: RelationMatrixLinkItem,
  allowedByNotationRules: boolean
): void {
  cell.total += item.relationCount
  cell.items.push(item)
  cell.relationCounts[item.relationId] = (cell.relationCounts[item.relationId] ?? 0) + item.relationCount
  cell.allowedByNotationRules = cell.allowedByNotationRules || allowedByNotationRules
  if (!cell.relationIds.includes(item.relationId)) {
    cell.relationIds.push(item.relationId)
  }
}

export function buildRelationMatrix(input: BuildRelationMatrixInput): RelationMatrixResult {
  const unknownRelationLabel = input.labels?.unknownRelation ?? 'Unknown relation'
  const mode = resolveMode(input.filters.notationId)
  const rowOptions = buildRowAndColumnOptions(input)
  const columnOptions = toColumnOptions(rowOptions)
  const relationOptions = buildRelationOptions(input, mode)

  const rowNameById = optionNameById(rowOptions)
  const relationNameById = optionNameById(relationOptions)
  const nodeById = new Map(input.nodes.map(node => [node.id, node]))

  const allowedRowIds = input.filters.selectedRowIds.length
    ? new Set(input.filters.selectedRowIds)
    : new Set(rowOptions.map(item => item.id))
  const allowedColumnIds = input.filters.selectedColumnIds.length
    ? new Set(input.filters.selectedColumnIds)
    : new Set(columnOptions.map(item => item.id))
  const allowedRelationIds = new Set(input.filters.selectedRelationIds)

  const notationId = input.filters.notationId
  const notationVocabulary =
    mode === 'notation' && notationId ? notationLinkTypeIds(input, notationId) : null
  const rules = activeRelationRules(input.relationRules)

  const cells = new Map<string, RelationMatrixCell>()
  let maxCellTotal = 0

  for (const link of input.links) {
    const sourceNode = nodeById.get(link.sourceId)
    const targetNode = nodeById.get(link.targetId)
    if (!sourceNode || !targetNode) continue

    if (mode === 'notation' && notationVocabulary && !notationVocabulary.has(link.linkTypeId)) {
      continue
    }

    const rowId = sourceNode.nodeTypeId
    const columnId = targetNode.nodeTypeId
    const relationId = link.linkTypeId

    let allowedByNotationRules = false
    if (mode === 'notation' && notationId) {
      allowedByNotationRules = isPairAllowedByNotationRules({
        notationId,
        fromNodeTypeId: sourceNode.nodeTypeId,
        toNodeTypeId: targetNode.nodeTypeId,
        linkTypeId: link.linkTypeId,
        components: input.components,
        relations: input.relations,
        relationRules: rules,
      })
      if (input.filters.allowedOnly && !allowedByNotationRules) continue
    }

    if (!allowedRowIds.has(rowId) || !allowedColumnIds.has(columnId)) continue
    if (!allowedRelationIds.has(relationId)) continue

    const key = toCellKey(rowId, columnId)
    const current = cells.get(key) ?? {
      rowId,
      columnId,
      total: 0,
      relationCounts: {},
      relationIds: [],
      items: [],
      allowedByNotationRules: false,
    }

    pushCellItem(
      current,
      {
        linkId: link.id,
        sourceNodeId: sourceNode.id,
        sourceNodeName: sourceNode.name,
        targetNodeId: targetNode.id,
        targetNodeName: targetNode.name,
        sourceCustomProperties: {},
        targetCustomProperties: {},
        relationId,
        relationName: relationNameById.get(relationId) ?? unknownRelationLabel,
        relationCount: 1,
      },
      allowedByNotationRules
    )

    cells.set(key, current)
    maxCellTotal = Math.max(maxCellTotal, current.total)
  }

  const rows = rowOptions.filter(option => allowedRowIds.has(option.id))
  const columns = columnOptions.filter(option => allowedColumnIds.has(option.id))
  const nonEmptyRowIds = new Set<string>()
  const nonEmptyColumnIds = new Set<string>()

  const outputCells: Record<string, RelationMatrixCell> = {}
  for (const [cellKey, cell] of cells.entries()) {
    nonEmptyRowIds.add(cell.rowId)
    nonEmptyColumnIds.add(cell.columnId)
    outputCells[cellKey] = {
      ...cell,
      relationIds: [...cell.relationIds].sort((a, b) => {
        const aName = relationNameById.get(a) ?? a
        const bName = relationNameById.get(b) ?? b
        return aName.localeCompare(bName, undefined, { sensitivity: 'base' })
      }),
      items: [...cell.items].sort((a, b) => {
        const sourceCmp = a.sourceNodeName.localeCompare(b.sourceNodeName, undefined, { sensitivity: 'base' })
        if (sourceCmp !== 0) return sourceCmp
        const targetCmp = a.targetNodeName.localeCompare(b.targetNodeName, undefined, { sensitivity: 'base' })
        if (targetCmp !== 0) return targetCmp
        const relationCmp = a.relationName.localeCompare(b.relationName, undefined, { sensitivity: 'base' })
        if (relationCmp !== 0) return relationCmp
        return a.linkId.localeCompare(b.linkId)
      }),
    }
  }

  const visibleRows = input.filters.hideEmptyAxes
    ? rows.filter(option => nonEmptyRowIds.has(option.id))
    : rows
  const visibleColumns = input.filters.hideEmptyAxes
    ? columns.filter(option => nonEmptyColumnIds.has(option.id))
    : columns

  return {
    mode,
    rowOptions: rowOptions.map(option => ({
      ...option,
      name: rowNameById.get(option.id) ?? option.name,
    })),
    columnOptions,
    relationOptions,
    rows: visibleRows,
    columns: visibleColumns,
    cells: outputCells,
    maxCellTotal,
  }
}

export function relationMatrixCellKey(rowId: string, columnId: string): string {
  return toCellKey(rowId, columnId)
}
