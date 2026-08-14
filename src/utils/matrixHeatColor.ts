export function matrixHeatColor(
  total: number,
  maxCellTotal: number,
  heatmapEnabled = true,
): string {
  if (total <= 0) return 'transparent'
  if (!heatmapEnabled || maxCellTotal <= 0) return 'var(--primary-soft)'
  const ratio = total / maxCellTotal
  const alpha = 0.08 + ratio * 0.52
  return `rgba(124, 92, 252, ${alpha.toFixed(3)})`
}
