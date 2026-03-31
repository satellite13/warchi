import { ref, watch, onMounted, onBeforeUnmount, nextTick, type Ref } from 'vue'
import {
  computeDropdownPanelPlacement,
  type DropdownPanelPlacement,
} from '@/utils/dropdownPanelPosition'

export interface UseDropdownPanelOptions {
  /** CSS class used to identify the panel in click-outside checks */
  panelClass: string
  /** CSS class used to identify the root in click-outside checks (optional) */
  rootClass?: string
  /** Height of the header block above the list (search input etc.) */
  headerBlockPx: number
  /** Desired max list height */
  preferredMaxListHeight?: number
}

export function useDropdownPanel(
  controlRef: Ref<HTMLDivElement | null>,
  searchInputRef: Ref<HTMLInputElement | null>,
  options: UseDropdownPanelOptions,
) {
  const isOpen = ref(false)
  const searchQuery = ref('')
  const panelPlacement = ref<DropdownPanelPlacement | null>(null)

  function updatePanelPosition(): void {
    if (!controlRef.value) return
    const rect = controlRef.value.getBoundingClientRect()
    panelPlacement.value = computeDropdownPanelPlacement(rect, {
      headerBlockPx: options.headerBlockPx,
      preferredMaxListHeight: options.preferredMaxListHeight ?? 180,
    })
  }

  function open(): void {
    isOpen.value = true
    searchQuery.value = ''
    updatePanelPosition()
    nextTick(() => {
      updatePanelPosition()
      searchInputRef.value?.focus()
    })
  }

  function close(): void {
    isOpen.value = false
  }

  function toggle(disabled?: boolean): void {
    if (disabled) return
    if (isOpen.value) {
      close()
    } else {
      open()
    }
  }

  function handleClickOutside(e: MouseEvent): void {
    if (!isOpen.value) return
    const target = e.target as HTMLElement
    if (options.rootClass && target.closest(`.${options.rootClass}`)) return
    if (target.closest(`.${options.panelClass}`)) return
    close()
  }

  watch(isOpen, (opened) => {
    if (opened) {
      window.addEventListener('scroll', updatePanelPosition, true)
      window.addEventListener('resize', updatePanelPosition)
    } else {
      window.removeEventListener('scroll', updatePanelPosition, true)
      window.removeEventListener('resize', updatePanelPosition)
    }
  })

  onMounted(() => {
    document.addEventListener('click', handleClickOutside, true)
  })

  onBeforeUnmount(() => {
    document.removeEventListener('click', handleClickOutside, true)
    window.removeEventListener('scroll', updatePanelPosition, true)
    window.removeEventListener('resize', updatePanelPosition)
  })

  return {
    isOpen,
    searchQuery,
    panelPlacement,
    updatePanelPosition,
    open,
    close,
    toggle,
  }
}
