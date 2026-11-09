import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SearchableSelect from './SearchableSelect.vue'

describe('SearchableSelect', () => {
  it('keeps both diagram versions visible when the names match', async () => {
    const wrapper = mount(SearchableSelect, {
      props: {
        modelValue: 'a',
        options: [
          { id: 'a', label: 'Компонентная диаграмма 1.0.0' },
          { id: 'b', label: 'Компонентная диаграмма 1.1.0' },
        ],
      },
      attachTo: document.body,
    })

    const selectedTail = wrapper.get('.searchable-select__value .select-option-label__tail')
    expect(selectedTail.text()).toBe('1.0.0')

    await wrapper.get('.searchable-select__control').trigger('click')

    const tails = [...document.body.querySelectorAll('.searchable-select__item .select-option-label__tail')]
    expect(tails.map(node => node.textContent)).toEqual(['1.0.0', '1.1.0'])

    wrapper.unmount()
  })
})
