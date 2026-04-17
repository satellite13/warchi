import {
  type BuildRelationMatrixInput,
  type RelationMatrixCell,
  type RelationMatrixEntityOption,
  type RelationMatrixLinkItem,
  type RelationMatrixMode,
  type RelationMatrixResult,
  UNMAPPED_ENTITY_ID,
} from "../types"

const toCellKey = (rowId: string, columnId: string): string => `${rowId}:::${columnId}`

const sortOptions = (items: RelationMatrixEntityOption[]): RelationMatrixEntityOption[] =>
  [...items].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))

function resolveMode(notationId: string | null): RelationMatrixMode {
  return notationId ? "notation" : "types"
}

function buildRowAndColumnOptions(input: BuildRelationMatrixInput, mode: RelationMatrixMode): RelationMatrixEntityOption[] {
  const unmappedLabel = input.labels?.unmapped ?? "Unmapped"
  if (mode === "notation") {
    const notationId = input.filters.notationId
    const options = input.components
      .filter(component => component.notationId === notationId)
      .map<RelationMatrixEntityOption>(component => ({
        id: component.id,
        name: component.name,
        kind: "row",
      }))
    return sortOptions([
      ...options,
      {
        id: UNMAPPED_ENTITY_ID,
        name: unmappedLabel,
        kind: "row",
        isUnmapped: true,
      },
    ])
  }

  const options = input.nodeTypes.map<RelationMatrixEntityOption>(nodeType => ({
    id: nodeType.id,
    name: nodeType.name,
    kind: "row",
  }))
  return sortOptions(options)
}

function buildRelationOptions(input: BuildRelationMatrixInput, mode: RelationMatrixMode): RelationMatrixEntityOption[] {
  const unmappedLabel = input.labels?.unmapped ?? "Unmapped"
  if (mode === "notation") {
    const notationId = input.filters.notationId
    const options = input.relations
      .filter(relation => relation.notationId === notationId)
      .map<RelationMatrixEntityOption>(relation => ({
        id: relation.id,
        name: relation.name,
        kind: "relation",
      }))
    return sortOptions([
      ...options,
      {
        id: UNMAPPED_ENTITY_ID,
        name: unmappedLabel,
        kind: "relation",
        isUnmapped: true,
      },
    ])
  }

  return sortOptions(
    input.linkTypes.map<RelationMatrixEntityOption>(linkType => ({
      id: linkType.id,
      name: linkType.name,
      kind: "relation",
    }))
  )
}

function optionNameById(options: RelationMatrixEntityOption[]): Map<string, string> {
  return new Map(options.map(option => [option.id, option.name]))
}

function toColumnOptions(rows: RelationMatrixEntityOption[]): RelationMatrixEntityOption[] {
  return rows.map(item => ({ ...item, kind: "column" }))
}

function resolveRowOrColumnId(
  mode: RelationMatrixMode,
  notationId: string | null,
  node: BuildRelationMatrixInput["nodes"][number]
): string {
  if (mode === "types") return node.nodeTypeId
  if (!notationId) return UNMAPPED_ENTITY_ID
  return node.parsedAttrs.notationComponents[notationId]?.componentId ?? UNMAPPED_ENTITY_ID
}

function resolveRelationId(
  mode: RelationMatrixMode,
  notationId: string | null,
  link: BuildRelationMatrixInput["links"][number]
): string {
  if (mode === "types") return link.linkTypeId
  if (!notationId) return UNMAPPED_ENTITY_ID
  return link.parsedAttrs.notationRelations[notationId]?.relationId ?? UNMAPPED_ENTITY_ID
}

function pushCellItem(cell: RelationMatrixCell, item: RelationMatrixLinkItem): void {
  cell.total += item.relationCount
  cell.items.push(item)
  cell.relationCounts[item.relationId] = (cell.relationCounts[item.relationId] ?? 0) + item.relationCount
  cell.hasUnmapped = cell.hasUnmapped || item.isUnmapped
  if (!cell.relationIds.includes(item.relationId)) {
    cell.relationIds.push(item.relationId)
  }
}

export function buildRelationMatrix(input: BuildRelationMatrixInput): RelationMatrixResult {
  const unknownRelationLabel = input.labels?.unknownRelation ?? "Unknown relation"
  const mode = resolveMode(input.filters.notationId)
  const rowOptions = buildRowAndColumnOptions(input, mode)
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

  const cells = new Map<string, RelationMatrixCell>()
  let maxCellTotal = 0

  for (const link of input.links) {
    const sourceNode = nodeById.get(link.sourceId)
    const targetNode = nodeById.get(link.targetId)
    if (!sourceNode || !targetNode) continue

    const rowId = resolveRowOrColumnId(mode, input.filters.notationId, sourceNode)
    const columnId = resolveRowOrColumnId(mode, input.filters.notationId, targetNode)
    const relationId = resolveRelationId(mode, input.filters.notationId, link)

    const isUnmapped =
      rowId === UNMAPPED_ENTITY_ID || columnId === UNMAPPED_ENTITY_ID || relationId === UNMAPPED_ENTITY_ID

    if (input.filters.mappedOnly && isUnmapped) continue
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
      hasUnmapped: false,
    }

    pushCellItem(current, {
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
      isUnmapped,
    })

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
        return aName.localeCompare(bName, undefined, { sensitivity: "base" })
      }),
      items: [...cell.items].sort((a, b) => {
        const sourceCmp = a.sourceNodeName.localeCompare(b.sourceNodeName, undefined, { sensitivity: "base" })
        if (sourceCmp !== 0) return sourceCmp
        const targetCmp = a.targetNodeName.localeCompare(b.targetNodeName, undefined, { sensitivity: "base" })
        if (targetCmp !== 0) return targetCmp
        const relationCmp = a.relationName.localeCompare(b.relationName, undefined, { sensitivity: "base" })
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
