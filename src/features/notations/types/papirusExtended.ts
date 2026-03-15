/**
 * Extended interfaces for Papirus runtime properties not exposed
 * in the library's public TypeScript definitions.
 * Use these via type assertions instead of `as any`.
 */
import type { InsetInput } from '../utils/styleHelpers'

/** Extra runtime-accessible properties on Node, used via `node as unknown as ExtendedNodeProps`. */
export interface ExtendedNodeProps {
  contentInset?: InsetInput
  cornerRadius?: number
  anchorPoints?: { top?: number; right?: number; bottom?: number; left?: number }
  icon?:
    | {
        options?: {
          source?: string
          placement?: string
          width?: number
          height?: number
          fit?: string
          inset?: number
          offsetX?: number
          offsetY?: number
          strokeColor?: string
          fillColor?: string
        }
      }
    | undefined
  shapeType?: string
  typeName?: string
}

/** Edge style with opacity fields. */
export interface ExtendedEdgeStyle {
  strokeColor?: string
  strokeOpacity?: number
  strokeWidth?: number
  fillOpacity?: number
}

/** Extra runtime-accessible properties on Edge. */
export interface ExtendedEdgeProps {
  labelBackground?: {
    color?: string
    opacity?: number
    padding?: number
    borderRadius?: number
  }
}

/** Extended text style with fields not in public types. */
export interface ExtendedTextStyle {
  color?: string
  fontSize?: number
  opacity?: number
  align?: string
  verticalAlign?: 'top' | 'middle' | 'bottom'
}

/** Node style with opacity fields. */
export interface ExtendedNodeStyle {
  fillColor?: string
  fillOpacity?: number
  strokeColor?: string
  strokeOpacity?: number
  strokeWidth?: number
  opacity?: number
  lineDash?: number[]
}
