import type { Node as DiagramNode } from '@ngroznykh/papirus'
import type { DiagramNodeInstance } from '../modelAttrs'

export interface MinDimensions {
  width: number
  height: number
}

/**
 * Override node.getContentMinSize so resize clamping can't shrink a node below
 * its component's minimum dimensions. The override forwards the availableWidth
 * argument to the original implementation so wrapped-text height is measured
 * at the prospective width.
 */
export function applyMinSizeConstraint(
  node: DiagramNode,
  instance: DiagramNodeInstance,
  resolveMinDimensions: (instance: DiagramNodeInstance) => MinDimensions
): void {
  const original = node.getContentMinSize.bind(node)
  node.getContentMinSize = (ctx: CanvasRenderingContext2D, availableWidth?: number) => {
    const contentMin = original(ctx, availableWidth)
    const compMin = resolveMinDimensions(instance)
    return {
      width: Math.max(contentMin.width, compMin.width),
      height: Math.max(contentMin.height, compMin.height),
    }
  }
}
