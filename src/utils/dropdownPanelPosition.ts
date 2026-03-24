/** Padding от краёв окна (px). */
const VIEWPORT_MARGIN = 8

/** Зазор между якорем и панелью (px). */
const GAP = 4

/** Высота блока поиска в SearchableSelect: поле + границы (px). */
export const DROPDOWN_SEARCH_BLOCK_PX = 44

export type DropdownPanelPlacement = {
  left: number
  width: number
  /** Задано при открытии вниз */
  top?: number
  /** Задано при открытии вверх (position: fixed) */
  bottom?: number
  maxPanelHeight: number
  maxListHeight: number
  openUpward: boolean
}

/**
 * Позиция фиксированной панели относительно getBoundingClientRect якоря.
 * Ниже середины экрана — панель открывается вверх; выше — вниз.
 * Горизонталь поджимается к viewport.
 */
export function computeDropdownPanelPlacement(
  anchorRect: DOMRect,
  options?: {
    /** Высота «шапки» панели над списком (поиск и т.п.), вычитается из max list */
    headerBlockPx?: number
    /** Желаемая max-высота списка, если позволяет место */
    preferredMaxListHeight?: number
  }
): DropdownPanelPlacement {
  const headerBlockPx = options?.headerBlockPx ?? DROPDOWN_SEARCH_BLOCK_PX
  const preferredMaxList = options?.preferredMaxListHeight ?? 180

  const vw = window.innerWidth
  const vh = window.innerHeight

  const anchorMidY = anchorRect.top + anchorRect.height / 2
  const openUpward = anchorMidY > vh / 2

  let left = anchorRect.left
  const width = Math.min(anchorRect.width, vw - VIEWPORT_MARGIN * 2)
  left = Math.min(Math.max(VIEWPORT_MARGIN, left), vw - width - VIEWPORT_MARGIN)

  let maxPanelHeight: number
  let top: number | undefined
  let bottom: number | undefined

  if (openUpward) {
    const spaceAbove = anchorRect.top - VIEWPORT_MARGIN - GAP
    maxPanelHeight = Math.max(80, spaceAbove)
    bottom = vh - anchorRect.top + GAP
  } else {
    const spaceBelow = vh - anchorRect.bottom - VIEWPORT_MARGIN - GAP
    maxPanelHeight = Math.max(80, spaceBelow)
    top = anchorRect.bottom + GAP
  }

  const maxListHeight = Math.max(
    48,
    Math.min(preferredMaxList, Math.max(0, maxPanelHeight - headerBlockPx))
  )

  return { top, left, width, bottom, maxPanelHeight, maxListHeight, openUpward }
}
