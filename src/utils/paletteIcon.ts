import type { CompositeSerializedCComponent } from '@/domain/attrs/notationAttrs'
import { resolveCompositeBoundIconName } from '@/features/diagram-style/utils/compositeBindings'

export type PaletteIconAttrs = {
  diagramStyle?: {
    iconName?: string
    compositeContent?: CompositeSerializedCComponent
  }
  paletteMaterialIcon?: string
}

/**
 * Icon shown in palettes and lists.
 * An explicit palette override wins even when the component already has a figure icon.
 */
export function resolvePaletteIconName(
  attrs: PaletteIconAttrs | null | undefined,
  fallback = 'widgets',
): string {
  const override = attrs?.paletteMaterialIcon?.trim()
  if (override) return override
  const fromStyle = attrs?.diagramStyle?.iconName?.trim()
  if (fromStyle) return fromStyle
  const fromComposite = resolveCompositeBoundIconName(attrs?.diagramStyle?.compositeContent)
  if (fromComposite) return fromComposite
  return fallback
}
