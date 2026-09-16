import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import BaseModal from './BaseModal.vue'

describe('BaseModal', () => {
  it('closes when both mousedown and click happen on the overlay', async () => {
    const wrapper = mount(BaseModal, {
      props: { title: 'Create diagram' },
      attachTo: document.body,
      slots: { default: '<input class="field" value="Architecture" />' },
    })

    const overlay = document.querySelector('.modal-overlay') as HTMLElement
    await overlay.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('does not close when text selection starts inside and ends on the overlay', async () => {
    const wrapper = mount(BaseModal, {
      props: { title: 'Create diagram' },
      attachTo: document.body,
      slots: { default: '<input class="field" value="Architecture" />' },
    })

    const overlay = document.querySelector('.modal-overlay') as HTMLElement
    const field = document.querySelector('.field') as HTMLElement

    await field.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(wrapper.emitted('close')).toBeUndefined()
    wrapper.unmount()
  })
})
