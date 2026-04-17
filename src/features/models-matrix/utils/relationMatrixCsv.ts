import type { RelationMatrixCsvFormat, RelationMatrixResult } from "../types"
import { relationMatrixCellKey } from "./buildRelationMatrix"

type CsvContext = {
  notationId: string | null
  notationName: string
}

const CSV_DELIMITER = ","

const escapeCsv = (value: string | number | boolean | null | undefined): string => {
  const text = value == null ? "" : String(value)
  if (text.includes(CSV_DELIMITER) || text.includes('"') || text.includes("\n")) {
    return `"${text.replaceAll('"', '""')}"`
  }
  return text
}

function triggerDownload(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function buildLongCsv(matrix: RelationMatrixResult, context: CsvContext): string {
  const header = [
    "mode",
    "notationId",
    "notationName",
    "rowId",
    "rowName",
    "colId",
    "colName",
    "relationId",
    "relationName",
    "relationCount",
    "cellTotal",
    "isUnmapped",
  ]

  const lines: string[] = [header.join(CSV_DELIMITER)]
  const rowNameById = new Map(matrix.rows.map(row => [row.id, row.name]))
  const colNameById = new Map(matrix.columns.map(col => [col.id, col.name]))
  const relNameById = new Map(matrix.relationOptions.map(rel => [rel.id, rel.name]))

  for (const row of matrix.rows) {
    for (const column of matrix.columns) {
      const cell = matrix.cells[relationMatrixCellKey(row.id, column.id)]
      if (!cell) continue
      const relationIds = cell.relationIds.length > 0 ? cell.relationIds : [""]
      for (const relationId of relationIds) {
        const relationCount = relationId ? (cell.relationCounts[relationId] ?? cell.total) : cell.total
        const relationName = relationId ? (relNameById.get(relationId) ?? relationId) : ""
        lines.push(
          [
            matrix.mode,
            context.notationId ?? "",
            context.notationName,
            row.id,
            rowNameById.get(row.id) ?? row.id,
            column.id,
            colNameById.get(column.id) ?? column.id,
            relationId,
            relationName,
            relationCount,
            cell.total,
            cell.hasUnmapped,
          ]
            .map(escapeCsv)
            .join(CSV_DELIMITER)
        )
      }
    }
  }

  return lines.join("\n")
}

function buildWideCsv(matrix: RelationMatrixResult): string {
  const header = ["row\\col", ...matrix.columns.map(col => col.name)].map(escapeCsv).join(CSV_DELIMITER)
  const lines: string[] = [header]

  for (const row of matrix.rows) {
    const values: Array<string | number> = [row.name]
    for (const column of matrix.columns) {
      const cell = matrix.cells[relationMatrixCellKey(row.id, column.id)]
      values.push(cell?.total ?? 0)
    }
    lines.push(values.map(escapeCsv).join(CSV_DELIMITER))
  }

  return lines.join("\n")
}

export function downloadRelationMatrixCsv(params: {
  matrix: RelationMatrixResult
  format: RelationMatrixCsvFormat
  filenameBase: string
  notationId: string | null
  notationName: string
}): void {
  const csv =
    params.format === "long"
      ? buildLongCsv(params.matrix, { notationId: params.notationId, notationName: params.notationName })
      : buildWideCsv(params.matrix)

  triggerDownload(`${params.filenameBase}-${params.format}.csv`, csv)
}

