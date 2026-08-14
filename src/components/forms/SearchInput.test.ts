import { mount } from '@vue/test-utils'
import { describe, it, expect, vi } from 'vitest'
import SearchInput from './SearchInput.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key, locale: { value: 'ru' } }),
}))

describe('SearchInput', () => {
  it('renders search icon', () => {
    const wrapper = mount(SearchInput)
    const icon = wrapper.find('[data-icon="search"]')
    expect(icon.exists()).toBe(true)
  })

  it('input reflects modelValue prop', () => {
    const wrapper = mount(SearchInput, {
      props: { modelValue: 'test' },
    })
    const input = wrapper.find('input')
    expect(input.element.value).toBe('test')
  })

  it('clear button is visible when model is not empty', () => {
    const wrapper = mount(SearchInput, {
      props: { modelValue: 'hello' },
    })
    expect(wrapper.find('.clear-button').exists()).toBe(true)
  })

  it('clear button is hidden when model is empty', () => {
    const wrapper = mount(SearchInput, {
      props: { modelValue: '' },
    })
    expect(wrapper.find('.clear-button').exists()).toBe(false)
  })

  it('typing in input emits update:modelValue', async () => {
    const wrapper = mount(SearchInput, {
      props: { modelValue: '' },
    })
    await wrapper.find('input').setValue('hello')
    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')![0]).toEqual(['hello'])
  })

  it('clicking clear resets model and emits update:modelValue with empty string', async () => {
    const wrapper = mount(SearchInput, {
      props: { modelValue: 'test' },
    })
    await wrapper.find('.clear-button').trigger('click')
    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    expect(emitted![emitted!.length - 1]).toEqual([''])
  })

  it('uses default placeholder from i18n when no placeholder prop given', () => {
    const wrapper = mount(SearchInput)
    const input = wrapper.find('input')
    expect(input.attributes('placeholder')).toBe('common.search')
  })

  it('custom placeholder overrides default', () => {
    const wrapper = mount(SearchInput, {
      props: { placeholder: 'Find items...' },
    })
    const input = wrapper.find('input')
    expect(input.attributes('placeholder')).toBe('Find items...')
  })

  it('applies compact class when compact is set', () => {
    const wrapper = mount(SearchInput, {
      props: { compact: true },
    })
    expect(wrapper.find('.search-box--compact').exists()).toBe(true)
  })
})
