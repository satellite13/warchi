export const DIFF_COLORS = {
  added: { strokeColor: '#1ea355', fillColor: 'rgba(30, 163, 85, 0.15)' },
  removed: { strokeColor: '#dc3545', fillColor: 'rgba(220, 53, 69, 0.15)' },
  modified: { strokeColor: '#e67e22', fillColor: 'rgba(230, 126, 34, 0.12)' },
} as const

export function applyDiffOverlayToNodeStyle(
  style: Record<string, unknown>,
  state: 'added' | 'removed' | 'modified'
): void {
  const c = DIFF_COLORS[state]
  style.strokeColor = c.strokeColor
  style.strokeWidth = 2
  style.fillColor = c.fillColor
}

export function applyDiffOverlayToEdgeStyle(
  style: Record<string, unknown> & { strokeColor?: string; strokeWidth?: number },
  state: 'added' | 'removed' | 'modified'
): void {
  const c = DIFF_COLORS[state]
  ;(style as Record<string, unknown>).strokeColor = c.strokeColor
  ;(style as Record<string, unknown>).strokeWidth = Math.max(
    Number(style.strokeWidth) || 2,
    2
  )
}

