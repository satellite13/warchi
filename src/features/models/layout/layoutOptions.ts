import type { DiagramLayoutMode } from './runDiagramLayout'
import type { ElkLayoutOptions } from './diagramLayoutGraph'

export type LayoutDirectionChoice = 'AUTO' | 'RIGHT' | 'DOWN' | 'LEFT' | 'UP'
export type LayoutEdgeRouting = 'ORTHOGONAL' | 'POLYLINE'
export type CrossingStrategy = 'LAYER_SWEEP' | 'INTERACTIVE'

export type LayoutUiOptions = {
  direction: LayoutDirectionChoice
  nodeNodeSpacing: number
  layerSpacing: number
  edgeRouting: LayoutEdgeRouting
  padding: string
  crossingStrategy: CrossingStrategy | ''
  edgeNodeSpacing: number | null
  sporeCompaction: boolean
}

export function defaultLayoutUiOptions(_mode: DiagramLayoutMode): LayoutUiOptions {
  return {
    direction: 'AUTO',
    nodeNodeSpacing: 40,
    layerSpacing: 48,
    edgeRouting: 'ORTHOGONAL',
    padding: '',
    crossingStrategy: '',
    edgeNodeSpacing: null,
    sporeCompaction: false,
  }
}

export function toElkLayoutOptions(
  mode: DiagramLayoutMode,
  ui: LayoutUiOptions,
  resolvedDirection?: 'RIGHT' | 'DOWN' | 'LEFT' | 'UP'
): ElkLayoutOptions {
  const edgeRouting = ui.edgeRouting
  if (mode === 'overlap') {
    const opts: ElkLayoutOptions = {
      'elk.algorithm': ui.sporeCompaction
        ? 'org.eclipse.elk.sporeCompaction'
        : 'sporeOverlap',
      'elk.edgeRouting': edgeRouting,
      'elk.spacing.nodeNode': String(ui.nodeNodeSpacing),
    }
    return opts
  }

  const direction =
    ui.direction === 'AUTO' ? (resolvedDirection ?? 'RIGHT') : ui.direction
  const opts: ElkLayoutOptions = {
    'elk.algorithm': 'layered',
    'elk.direction': direction,
    'elk.edgeRouting': edgeRouting,
    'elk.spacing.nodeNode': String(ui.nodeNodeSpacing),
    'elk.layered.spacing.nodeNodeBetweenLayers': String(ui.layerSpacing),
  }
  if (ui.padding.trim()) opts['elk.padding'] = ui.padding.trim()
  if (ui.crossingStrategy) {
    opts['elk.layered.crossingMinimization.strategy'] = ui.crossingStrategy
  }
  if (ui.edgeNodeSpacing != null) {
    opts['elk.spacing.edgeNode'] = String(ui.edgeNodeSpacing)
  }
  return opts
}
