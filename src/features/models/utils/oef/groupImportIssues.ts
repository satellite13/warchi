import type { ImportIssue, ImportIssueCode, ImportIssueLevel } from './types'

export type GroupedImportIssue = {
  code: ImportIssueCode
  level: ImportIssueLevel
  count: number
  sampleMessage: string
  entityIds: string[]
}

const MAX_ENTITY_IDS = 30

/** Collapse repeated validation issues (e.g. many rel→rel warnings) into one row per code. */
export function groupImportIssues(issues: ImportIssue[]): GroupedImportIssue[] {
  const groups = new Map<string, GroupedImportIssue>()

  for (const issue of issues) {
    const key = `${issue.level}:${issue.code}`
    const existing = groups.get(key)
    if (existing) {
      existing.count += 1
      if (issue.entityId && existing.entityIds.length < MAX_ENTITY_IDS) {
        existing.entityIds.push(issue.entityId)
      }
      continue
    }
    groups.set(key, {
      code: issue.code,
      level: issue.level,
      count: 1,
      sampleMessage: issue.message,
      entityIds: issue.entityId ? [issue.entityId] : [],
    })
  }

  return [...groups.values()].sort((a, b) => {
    if (a.level !== b.level) return a.level === 'error' ? -1 : 1
    return a.code.localeCompare(b.code)
  })
}
