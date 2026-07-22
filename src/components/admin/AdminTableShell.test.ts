import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AdminTableShell from './AdminTableShell.vue'

describe('AdminTableShell', () => {
  it('shows loading placeholder', () => {
    const wrapper = mount(AdminTableShell, {
      props: { loading: true, loadingText: 'Loading…' },
    })
    expect(wrapper.text()).toContain('Loading…')
    expect(wrapper.find('table').exists()).toBe(false)
  })

  it('shows empty placeholder', () => {
    const wrapper = mount(AdminTableShell, {
      props: { empty: true, emptyText: 'Nothing here' },
    })
    expect(wrapper.text()).toContain('Nothing here')
  })

  it('renders head and body slots when ready', () => {
    const wrapper = mount(AdminTableShell, {
      slots: {
        head: '<tr><th>Name</th></tr>',
        default: '<tbody><tr><td>Row</td></tr></tbody>',
      },
    })
    expect(wrapper.find('th').text()).toBe('Name')
    expect(wrapper.find('td').text()).toBe('Row')
  })
})
