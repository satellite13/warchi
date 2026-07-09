/* eslint-disable @typescript-eslint/no-explicit-any -- mock open function accepts any type */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref, nextTick } from 'vue'
import type { Ref } from 'vue'
import type { VersionedEntity } from '../types/entities'
import type { EntityListConfig } from '../composables/useEntityList'

// --- Mocks ---
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
    locale: { value: 'ru' },
  }),
}))

const mockApiPut = vi.hoisted(() => vi.fn())
vi.mock('@/composables/useApi', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: (...args: unknown[]) => mockApiPut(...args),
  apiDelete: vi.fn(),
}))

const { ref: createMockRef } = await import('vue')

vi.mock('./useModalState', () => {
  return {
    useModalState: () => {
      const show = createMockRef(false)
      const modalItem = createMockRef(null)
      const isProcessing = createMockRef(false)
      const error = createMockRef(null)
      const open = (value: any) => {
        modalItem.value = value
        error.value = null
        show.value = true
      }
      const close = () => {
        show.value = false
        modalItem.value = null
        error.value = null
        isProcessing.value = false
      }
      const resetError = () => {
        error.value = null
      }
      return { show, item: modalItem, isProcessing, error, open, close, resetError }
    },
  }
})

import { useEntityIconModal } from './useEntityIconModal'

interface TestEntity extends VersionedEntity {
  attrs?: string | null
}

describe('useEntityIconModal', () => {
  const config: EntityListConfig<TestEntity> = {
    endpoint: 'notations',
    entityName: 'Notation',
    entityNamePlural: 'Notations',
    conflictMessage: 'Conflict',
    notFoundMessage: 'Not found',
    buildUpdateAttrsRequest: (_item: TestEntity, nextAttrs: string | null) => ({
      attrs: nextAttrs,
    }),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns all expected properties', () => {
    const items = ref<TestEntity[]>([{ id: 'n1', name: 'N', version: '1.0.0', ownerId: 'u1' }])
    const result = useEntityIconModal(config, items as Ref<TestEntity[]>)
    expect(result).toHaveProperty('showIconModal')
    expect(result).toHaveProperty('itemToUpdateIcon')
    expect(result).toHaveProperty('iconPickerValue')
    expect(result).toHaveProperty('isUpdatingIcon')
    expect(result).toHaveProperty('iconUpdateError')
    expect(result).toHaveProperty('openIconModal')
    expect(result).toHaveProperty('closeIconModal')
    expect(result).toHaveProperty('submitIconChange')
  })

  it('openIconModal extracts icon from attrs JSON', () => {
    const items = ref<TestEntity[]>([
      {
        id: 'n1',
        name: 'N',
        version: '1.0.0',
        ownerId: 'u1',
        attrs: JSON.stringify({ icon: 'myIcon' }),
      },
    ])
    const { openIconModal, iconPickerValue, itemToUpdateIcon, showIconModal } = useEntityIconModal(
      config,
      items as Ref<TestEntity[]>
    )
    openIconModal(items.value[0])
    expect(iconPickerValue.value).toBe('myIcon')
    expect(itemToUpdateIcon.value?.id).toBe('n1')
    expect(showIconModal.value).toBe(true)
  })

  it('openIconModal handles null attrs gracefully', () => {
    const items = ref<TestEntity[]>([
      { id: 'n1', name: 'N', version: '1.0.0', ownerId: 'u1', attrs: null },
    ])
    const { openIconModal, iconPickerValue } = useEntityIconModal(
      config,
      items as Ref<TestEntity[]>
    )
    openIconModal(items.value[0])
    expect(iconPickerValue.value).toBe('')
  })

  it('openIconModal handles missing attrs property', () => {
    const items = ref<TestEntity[]>([{ id: 'n1', name: 'N', version: '1.0.0', ownerId: 'u1' }])
    const { openIconModal, iconPickerValue } = useEntityIconModal(
      config,
      items as Ref<TestEntity[]>
    )
    openIconModal(items.value[0])
    expect(iconPickerValue.value).toBe('')
  })

  it('openIconModal handles malformed JSON in attrs', () => {
    const items = ref<TestEntity[]>([
      { id: 'n1', name: 'N', version: '1.0.0', ownerId: 'u1', attrs: 'not valid json' },
    ])
    const { openIconModal, iconPickerValue } = useEntityIconModal(
      config,
      items as Ref<TestEntity[]>
    )
    openIconModal(items.value[0])
    expect(iconPickerValue.value).toBe('')
  })

  it('openIconModal handles non-string icon value', () => {
    const items = ref<TestEntity[]>([
      {
        id: 'n1',
        name: 'N',
        version: '1.0.0',
        ownerId: 'u1',
        attrs: JSON.stringify({ icon: 123 }),
      },
    ])
    const { openIconModal, iconPickerValue } = useEntityIconModal(
      config,
      items as Ref<TestEntity[]>
    )
    openIconModal(items.value[0])
    expect(iconPickerValue.value).toBe('')
  })

  it('closeIconModal resets state', () => {
    const items = ref<TestEntity[]>([
      {
        id: 'n1',
        name: 'N',
        version: '1.0.0',
        ownerId: 'u1',
        attrs: JSON.stringify({ icon: 'x' }),
      },
    ])
    const { openIconModal, closeIconModal, iconPickerValue, showIconModal, itemToUpdateIcon } =
      useEntityIconModal(config, items as Ref<TestEntity[]>)
    openIconModal(items.value[0])
    expect(showIconModal.value).toBe(true)
    closeIconModal()
    expect(showIconModal.value).toBe(false)
    expect(iconPickerValue.value).toBe('')
    expect(itemToUpdateIcon.value).toBeNull()
  })

  it('submitIconChange updates item via apiPut on success', async () => {
    const items = ref<TestEntity[]>([
      {
        id: 'n1',
        name: 'N',
        version: '1.0.0',
        ownerId: 'u1',
        attrs: JSON.stringify({ icon: 'old' }),
      },
    ])
    const updated = { ...items.value[0], attrs: JSON.stringify({ icon: 'newIcon' }) }
    mockApiPut.mockResolvedValue({ success: true, data: updated })

    const { openIconModal, iconPickerValue, submitIconChange } = useEntityIconModal(
      config,
      items as Ref<TestEntity[]>
    )
    openIconModal(items.value[0])
    iconPickerValue.value = 'newIcon'

    await submitIconChange()

    expect(mockApiPut).toHaveBeenCalledWith('/notations/n1', {
      attrs: JSON.stringify({ icon: 'newIcon' }),
    })
    expect(items.value[0].id).toBe(updated.id)
    expect(items.value[0].attrs).toBe(updated.attrs)
  })

  it('submitIconChange removes icon key when value is cleared', async () => {
    const items = ref<TestEntity[]>([
      {
        id: 'n1',
        name: 'N',
        version: '1.0.0',
        ownerId: 'u1',
        attrs: JSON.stringify({ icon: 'old', other: 42 }),
      },
    ])
    const updated = { ...items.value[0], attrs: JSON.stringify({ other: 42 }) }
    mockApiPut.mockResolvedValue({ success: true, data: updated })

    const { openIconModal, iconPickerValue, submitIconChange } = useEntityIconModal(
      config,
      items as Ref<TestEntity[]>
    )
    openIconModal(items.value[0])
    iconPickerValue.value = ''

    await submitIconChange()

    expect(mockApiPut).toHaveBeenCalledWith('/notations/n1', {
      attrs: JSON.stringify({ other: 42 }),
    })
  })

  it('submitIconChange sends null attrs when all keys removed', async () => {
    const items = ref<TestEntity[]>([
      {
        id: 'n1',
        name: 'N',
        version: '1.0.0',
        ownerId: 'u1',
        attrs: JSON.stringify({ icon: 'old' }),
      },
    ])
    const updated = { ...items.value[0], attrs: null }
    mockApiPut.mockResolvedValue({ success: true, data: updated })

    const { openIconModal, iconPickerValue, submitIconChange } = useEntityIconModal(
      config,
      items as Ref<TestEntity[]>
    )
    openIconModal(items.value[0])
    iconPickerValue.value = ''

    await submitIconChange()

    expect(mockApiPut).toHaveBeenCalledWith('/notations/n1', { attrs: null })
  })

  it('submitIconChange does nothing when config lacks buildUpdateAttrsRequest', async () => {
    const minimalConfig: EntityListConfig<TestEntity> = {
      endpoint: 'notations',
      entityName: 'N',
      entityNamePlural: 'Ns',
      conflictMessage: 'C',
      notFoundMessage: 'NF',
    }
    const items = ref<TestEntity[]>([{ id: 'n1', name: 'N', version: '1.0.0', ownerId: 'u1' }])
    const { openIconModal, submitIconChange } = useEntityIconModal(
      minimalConfig,
      items as Ref<TestEntity[]>
    )
    openIconModal(items.value[0])
    await submitIconChange()
    expect(mockApiPut).not.toHaveBeenCalled()
  })

  it('submitIconChange does nothing when no item is open', async () => {
    const items = ref<TestEntity[]>([{ id: 'n1', name: 'N', version: '1.0.0', ownerId: 'u1' }])
    const { submitIconChange } = useEntityIconModal(config, items as Ref<TestEntity[]>)
    await submitIconChange()
    expect(mockApiPut).not.toHaveBeenCalled()
  })

  it('submitIconChange sets error on API failure', async () => {
    mockApiPut.mockResolvedValue({
      success: false,
      error: { status: 400, message: 'Bad request' },
    })
    const items = ref<TestEntity[]>([
      {
        id: 'n1',
        name: 'N',
        version: '1.0.0',
        ownerId: 'u1',
        attrs: JSON.stringify({ icon: 'x' }),
      },
    ])
    const { openIconModal, iconPickerValue, submitIconChange, iconUpdateError, isUpdatingIcon } =
      useEntityIconModal(config, items as Ref<TestEntity[]>)
    openIconModal(items.value[0])
    iconPickerValue.value = 'newIcon'
    await submitIconChange()
    expect(iconUpdateError.value).toBe('Bad request')
    expect(isUpdatingIcon.value).toBe(false)
  })

  it('submitIconChange sets generic error on non-Error exception', async () => {
    mockApiPut.mockRejectedValue('plain string error')
    const items = ref<TestEntity[]>([
      {
        id: 'n1',
        name: 'N',
        version: '1.0.0',
        ownerId: 'u1',
        attrs: JSON.stringify({ icon: 'x' }),
      },
    ])
    const { openIconModal, iconPickerValue, submitIconChange, iconUpdateError } =
      useEntityIconModal(config, items as Ref<TestEntity[]>)
    openIconModal(items.value[0])
    iconPickerValue.value = 'newIcon'
    await submitIconChange()
    expect(iconUpdateError.value).toBe('common.errorSave')
  })

  it('submitIconChange sets isProcessing during request', async () => {
    let resolvePromise: (val: unknown) => void
    mockApiPut.mockImplementation(
      () =>
        new Promise((resolve: (val: unknown) => void) => {
          resolvePromise = resolve
        })
    )
    const items = ref<TestEntity[]>([
      {
        id: 'n1',
        name: 'N',
        version: '1.0.0',
        ownerId: 'u1',
        attrs: JSON.stringify({ icon: 'x' }),
      },
    ])
    const { openIconModal, iconPickerValue, submitIconChange, isUpdatingIcon } = useEntityIconModal(
      config,
      items as Ref<TestEntity[]>
    )
    openIconModal(items.value[0])
    iconPickerValue.value = 'newIcon'
    submitIconChange()

    expect(isUpdatingIcon.value).toBe(true)

    resolvePromise!({ success: true, data: items.value[0] })
    await nextTick()
    expect(isUpdatingIcon.value).toBe(false)
  })

  it('openIconModal handles attrs with other fields preserving only icon', () => {
    const items = ref<TestEntity[]>([
      {
        id: 'n1',
        name: 'N',
        version: '1.0.0',
        ownerId: 'u1',
        attrs: JSON.stringify({ icon: 'widget', color: 'red', count: 5 }),
      },
    ])
    const { openIconModal, iconPickerValue } = useEntityIconModal(
      config,
      items as Ref<TestEntity[]>
    )
    openIconModal(items.value[0])
    expect(iconPickerValue.value).toBe('widget')
  })

  it('submitIconChange preserves additional attrs fields alongside icon', async () => {
    const items = ref<TestEntity[]>([
      {
        id: 'n1',
        name: 'N',
        version: '1.0.0',
        ownerId: 'u1',
        attrs: JSON.stringify({ icon: 'old', description: 'test' }),
      },
    ])
    const updated = {
      ...items.value[0],
      attrs: JSON.stringify({ description: 'test', icon: 'newIcon' }),
    }
    mockApiPut.mockResolvedValue({ success: true, data: updated })

    const { openIconModal, iconPickerValue, submitIconChange } = useEntityIconModal(
      config,
      items as Ref<TestEntity[]>
    )
    openIconModal(items.value[0])
    iconPickerValue.value = 'newIcon'
    await submitIconChange()

    // Compare parsed JSON since key order may differ
    const callArgs = (mockApiPut as unknown as { mock: { calls: { attrs: string }[][] } }).mock
      .calls[0][1]
    const parsedAttrs = JSON.parse(callArgs.attrs)
    expect(parsedAttrs.description).toBe('test')
    expect(parsedAttrs.icon).toBe('newIcon')
  })
})
