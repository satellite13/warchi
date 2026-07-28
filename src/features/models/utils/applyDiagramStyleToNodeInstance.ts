import type { DiagramStyle } from '@/domain/attrs/notationAttrs'

const DEFAULT_INSTANCE_WIDTH = 160
const DEFAULT_INSTANCE_HEIGHT = 56

export type SizedNodeInstance = {
  width?: number
  height?: number
  attrs?: Record<string, unknown>
}

function resolveInstanceWidth(instance: SizedNodeInstance): number {
  return typeof instance.width === 'number' ? instance.width : DEFAULT_INSTANCE_WIDTH
}

function resolveInstanceHeight(instance: SizedNodeInstance): number {
  return typeof instance.height === 'number' ? instance.height : DEFAULT_INSTANCE_HEIGHT
}

/**
 * Apply style-panel diagramStyle onto a diagram node instance without
 * resetting canvas size when the user only changed non-size fields.
 *
 * Canvas resize updates instance.width/height but not always diagramStyle.
 * Style panels always emit width/height from their refs; if those still match
 * the previous style snapshot (or there was no override yet), keep the
 * instance size and stamp it into the saved style.
 */
export function applyDiagramStyleToNodeInstance(
  instance: SizedNodeInstance,
  style: DiagramStyle
): void {
  const prev =
    instance.attrs?.diagramStyle && typeof instance.attrs.diagramStyle === 'object'
      ? (instance.attrs.diagramStyle as DiagramStyle)
      : undefined

  const next = JSON.parse(JSON.stringify(style)) as DiagramStyle
  const hasPrev = Boolean(prev)
  const widthChanged = hasPrev && typeof style.width === 'number' && style.width !== prev?.width
  const heightChanged =
    hasPrev && typeof style.height === 'number' && style.height !== prev?.height

  if (widthChanged && typeof style.width === 'number') {
    instance.width = style.width
  } else {
    next.width = resolveInstanceWidth(instance)
  }

  if (heightChanged && typeof style.height === 'number') {
    instance.height = style.height
  } else {
    next.height = resolveInstanceHeight(instance)
  }

  if (!instance.attrs) instance.attrs = {}
  instance.attrs.diagramStyle = next
}

/** Prefer live instance size over style defaults for Style panel display. */
export function withInstanceDimensions(
  style: DiagramStyle | undefined,
  instance: { width?: number; height?: number }
): DiagramStyle {
  return {
    ...(style ?? {}),
    width: resolveInstanceWidth(instance),
    height: resolveInstanceHeight(instance),
  }
}
