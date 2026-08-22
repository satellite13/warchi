export type TypePropertyDiffRow = {
  key: string
  keepValue: unknown
  dropValue: unknown
  same: boolean
  choice: 'keep' | 'drop'
}

const DOCUMENT_FILE_ID = 'documentFileId'

function valuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function buildTypePropertyDiff(
  keep: Record<string, unknown>,
  drop: Record<string, unknown>
): TypePropertyDiffRow[] {
  const keys = [...new Set([...Object.keys(keep), ...Object.keys(drop)])]
    .filter(key => key !== DOCUMENT_FILE_ID)
    .sort((a, b) => a.localeCompare(b))

  return keys.map(key => {
    const keepValue = keep[key]
    const dropValue = drop[key]
    return {
      key,
      keepValue,
      dropValue,
      same: valuesEqual(keepValue, dropValue),
      choice: 'keep',
    }
  })
}

export function collectTypeProperties(rows: TypePropertyDiffRow[]): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const row of rows) {
    if (row.key === DOCUMENT_FILE_ID) continue
    const value = row.same || row.choice === 'keep' ? row.keepValue : row.dropValue
    if (value !== undefined) {
      result[row.key] = value
    }
  }
  return result
}
