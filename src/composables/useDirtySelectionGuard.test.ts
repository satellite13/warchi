import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useDirtySelectionGuard } from './useDirtySelectionGuard'

describe('useDirtySelectionGuard', () => {
  it('applies select immediately when clean', () => {
    const isDirty = ref(false)
    const guard = useDirtySelectionGuard({ isDirty })
    const apply = vi.fn()

    guard.requestSelect('a', apply)
    expect(apply).toHaveBeenCalledWith('a')
    expect(guard.showUnsavedDialog.value).toBe(false)
  })

  it('defers select and add until discard', () => {
    const isDirty = ref(true)
    const guard = useDirtySelectionGuard({ isDirty })
    const onSelect = vi.fn()
    const onAdd = vi.fn()

    guard.requestSelect('b', onSelect)
    expect(onSelect).not.toHaveBeenCalled()
    expect(guard.showUnsavedDialog.value).toBe(true)

    guard.discardAndContinue({ onSelect, onAdd })
    expect(onSelect).toHaveBeenCalledWith('b')
    expect(guard.showUnsavedDialog.value).toBe(false)

    guard.requestAdd('__add_node', () => onAdd('__add_node'))
    expect(guard.showUnsavedDialog.value).toBe(true)
    guard.discardAndContinue({ onSelect, onAdd })
    expect(onAdd).toHaveBeenCalledWith('__add_node')
  })
})
