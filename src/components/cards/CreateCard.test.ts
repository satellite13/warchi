import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import CreateCard from './CreateCard.vue'

const mountCard = (props: { title: string; description?: string }) =>
  mount(CreateCard, { props })

describe('CreateCard', () => {
  it('renders title', () => {
    const wrapper = mountCard({ title: 'Create New' })
    expect(wrapper.find('.create-card__title').text()).toBe('Create New')
  })

  it('renders description when provided', () => {
    const wrapper = mountCard({ title: 'Create New', description: 'Add a new model' })
    expect(wrapper.find('.create-card__description').exists()).toBe(true)
    expect(wrapper.find('.create-card__description').text()).toBe('Add a new model')
  })

  it('hides description when not provided', () => {
    const wrapper = mountCard({ title: 'Create New' })
    expect(wrapper.find('.create-card__description').exists()).toBe(false)
  })

  it('click emits click', async () => {
    const wrapper = mountCard({ title: 'Create New' })
    await wrapper.find('.create-card').trigger('click')
    expect(wrapper.emitted('click')).toBeTruthy()
  })
})
