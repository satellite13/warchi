import { onBeforeUnmount, ref } from 'vue'
import { loadNumber, saveNumber } from '@/utils/localStorage'

const PROPS_PANEL_MIN_HEIGHT = 120
const PROPS_PANEL_MAX_HEIGHT = 600
const PROPS_PANEL_DEFAULT_HEIGHT = 220

export function useResizablePropsPanel(storageKey: string) {
  const propsPanelHeight = ref(
    Math.max(
      PROPS_PANEL_MIN_HEIGHT,
      Math.min(PROPS_PANEL_MAX_HEIGHT, loadNumber(storageKey, PROPS_PANEL_DEFAULT_HEIGHT)),
    ),
  )
  let propsPanelResizing = false
  let propsPanelStartY = 0
  let propsPanelStartHeight = 0

  function onPropsPanelResizeMove(e: MouseEvent): void {
    if (!propsPanelResizing) return
    const deltaY = propsPanelStartY - e.clientY
    propsPanelHeight.value = Math.max(
      PROPS_PANEL_MIN_HEIGHT,
      Math.min(PROPS_PANEL_MAX_HEIGHT, propsPanelStartHeight + deltaY),
    )
  }

  function stopPropsPanelResize(): void {
    if (!propsPanelResizing) return
    propsPanelResizing = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    window.removeEventListener('mousemove', onPropsPanelResizeMove)
    window.removeEventListener('mouseup', stopPropsPanelResize)
    saveNumber(storageKey, propsPanelHeight.value)
  }

  function startPropsPanelResize(e: MouseEvent): void {
    e.preventDefault()
    propsPanelResizing = true
    propsPanelStartY = e.clientY
    propsPanelStartHeight = propsPanelHeight.value
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', onPropsPanelResizeMove)
    window.addEventListener('mouseup', stopPropsPanelResize)
  }

  onBeforeUnmount(() => {
    stopPropsPanelResize()
  })

  return {
    propsPanelHeight,
    startPropsPanelResize,
  }
}
