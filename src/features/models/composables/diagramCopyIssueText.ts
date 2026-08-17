import type { DiagramCopyEdgeBlocker, DiagramCopyWarning } from './diagramCopyApi'

const BLOCKER_REASON_CODES: Record<string, string> = {
  'An edge endpoint or link is unresolved': 'UNRESOLVED_EDGE_ENDPOINT',
}

export function diagramCopyBlockerI18nKey(
  blocker: Pick<DiagramCopyEdgeBlocker, 'reason'> & { code?: string | null }
): string | null {
  const code = blocker.code?.trim() || BLOCKER_REASON_CODES[blocker.reason]
  return code ? `models.diagramCopy.blockers.${code}` : null
}

export function diagramCopyWarningI18nKey(warning: Pick<DiagramCopyWarning, 'code'>): string {
  return `models.diagramCopy.warnings.${warning.code}`
}
