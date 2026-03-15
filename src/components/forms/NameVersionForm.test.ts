import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import NameVersionForm from './NameVersionForm.vue'

describe('NameVersionForm', () => {
  const defaultProps = {
    nameLabel: 'Name',
    versionLabel: 'Version',
  }

  it('renders both labels', () => {
    const wrapper = mount(NameVersionForm, { props: defaultProps })
    const labels = wrapper.findAll('label')
    expect(labels).toHaveLength(2)
    expect(labels[0].text()).toBe('Name')
    expect(labels[1].text()).toBe('Version')
  })

  it('inputs reflect model values', () => {
    const wrapper = mount(NameVersionForm, {
      props: { ...defaultProps, name: 'My Model', version: '1.0.0' },
    })
    const inputs = wrapper.findAll<HTMLInputElement>('input[type="text"]')
    expect(inputs[0].element.value).toBe('My Model')
    expect(inputs[1].element.value).toBe('1.0.0')
  })

  it('emits update:name on name input', async () => {
    const wrapper = mount(NameVersionForm, {
      props: { ...defaultProps, name: '', version: '' },
    })
    const inputs = wrapper.findAll('input[type="text"]')
    await inputs[0].setValue('New Name')
    expect(wrapper.emitted('update:name')).toBeTruthy()
    expect(wrapper.emitted('update:name')!.pop()).toEqual(['New Name'])
  })

  it('emits update:version on version input', async () => {
    const wrapper = mount(NameVersionForm, {
      props: { ...defaultProps, name: '', version: '' },
    })
    const inputs = wrapper.findAll('input[type="text"]')
    await inputs[1].setValue('2.0.0')
    expect(wrapper.emitted('update:version')).toBeTruthy()
    expect(wrapper.emitted('update:version')!.pop()).toEqual(['2.0.0'])
  })

  it('disabled prop disables both inputs', () => {
    const wrapper = mount(NameVersionForm, {
      props: { ...defaultProps, disabled: true },
    })
    const inputs = wrapper.findAll<HTMLInputElement>('input[type="text"]')
    expect(inputs[0].element.disabled).toBe(true)
    expect(inputs[1].element.disabled).toBe(true)
  })

  it('inputs are enabled by default', () => {
    const wrapper = mount(NameVersionForm, { props: defaultProps })
    const inputs = wrapper.findAll<HTMLInputElement>('input[type="text"]')
    expect(inputs[0].element.disabled).toBe(false)
    expect(inputs[1].element.disabled).toBe(false)
  })

  it('placeholders work', () => {
    const wrapper = mount(NameVersionForm, {
      props: {
        ...defaultProps,
        namePlaceholder: 'Enter name',
        versionPlaceholder: 'e.g. 1.0.0',
      },
    })
    const inputs = wrapper.findAll<HTMLInputElement>('input[type="text"]')
    expect(inputs[0].element.placeholder).toBe('Enter name')
    expect(inputs[1].element.placeholder).toBe('e.g. 1.0.0')
  })

  it('label for attributes match input ids', () => {
    const wrapper = mount(NameVersionForm, {
      props: { ...defaultProps, nameId: 'name-input', versionId: 'version-input' },
    })
    const labels = wrapper.findAll('label')
    const inputs = wrapper.findAll('input[type="text"]')
    expect(labels[0].attributes('for')).toBe('name-input')
    expect(inputs[0].attributes('id')).toBe('name-input')
    expect(labels[1].attributes('for')).toBe('version-input')
    expect(inputs[1].attributes('id')).toBe('version-input')
  })
})
