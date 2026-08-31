import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AppTooltip from './AppTooltip.vue'

const slot = { default: '<button type="button">x</button>' }

let wrapper: ReturnType<typeof mount> | undefined

function mountTooltip(props: Record<string, unknown> = {}) {
  wrapper = mount(AppTooltip, { props, slots: slot })
  return wrapper
}

function bubble(): HTMLElement | null {
  return document.querySelector('[role="tooltip"]')
}

beforeEach(() => vi.useFakeTimers())

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.innerHTML = ''
  vi.useRealTimers()
})

describe('AppTooltip', () => {
  it('renders slot and hides bubble initially', () => {
    mountTooltip({ text: 'Hint' })
    expect(wrapper!.find('button').exists()).toBe(true)
    expect(bubble()).toBeNull()
  })

  it('does not render bubble when text is empty', async () => {
    mountTooltip({ text: '' })
    await wrapper!.trigger('mouseenter')
    vi.advanceTimersByTime(500)
    await wrapper!.vm.$nextTick()
    expect(bubble()).toBeNull()
  })

  it('renders bubble into document body', async () => {
    mountTooltip({ text: 'Hint', showDelay: 10 })
    await wrapper!.trigger('mouseenter')
    vi.advanceTimersByTime(10)
    await wrapper!.vm.$nextTick()
    expect(bubble()).not.toBeNull()
    expect(document.body.contains(bubble())).toBe(true)
  })

  it('shows bubble only after showDelay elapses on mouseenter', async () => {
    mountTooltip({ text: 'Hint', showDelay: 200 })
    await wrapper!.trigger('mouseenter')
    vi.advanceTimersByTime(199)
    await wrapper!.vm.$nextTick()
    expect(bubble()).toBeNull()
    vi.advanceTimersByTime(1)
    await wrapper!.vm.$nextTick()
    expect(bubble()!.textContent).toBe('Hint')
  })

  it('cancels pending show when mouse leaves before delay', async () => {
    mountTooltip({ text: 'Hint', showDelay: 200 })
    await wrapper!.trigger('mouseenter')
    vi.advanceTimersByTime(100)
    await wrapper!.trigger('mouseleave')
    vi.advanceTimersByTime(500)
    await wrapper!.vm.$nextTick()
    expect(bubble()).toBeNull()
  })

  it('hides bubble after hideDelay on mouseleave', async () => {
    mountTooltip({ text: 'Hint', showDelay: 50, hideDelay: 300 })
    await wrapper!.trigger('mouseenter')
    vi.advanceTimersByTime(50)
    await wrapper!.vm.$nextTick()
    expect(bubble()).not.toBeNull()
    await wrapper!.trigger('mouseleave')
    vi.advanceTimersByTime(299)
    expect(bubble()).not.toBeNull()
    vi.advanceTimersByTime(1)
    await wrapper!.vm.$nextTick()
    expect(bubble()).toBeNull()
  })

  it('re-entering during hide delay keeps bubble visible', async () => {
    mountTooltip({ text: 'Hint', showDelay: 50, hideDelay: 300 })
    await wrapper!.trigger('mouseenter')
    vi.advanceTimersByTime(50)
    await wrapper!.vm.$nextTick()
    await wrapper!.trigger('mouseleave')
    vi.advanceTimersByTime(100)
    await wrapper!.trigger('mouseenter')
    vi.advanceTimersByTime(400)
    await wrapper!.vm.$nextTick()
    expect(bubble()).not.toBeNull()
  })

  it('shows immediately on focusin regardless of showDelay', async () => {
    mountTooltip({ text: 'Hint', showDelay: 500 })
    await wrapper!.trigger('focusin')
    await wrapper!.vm.$nextTick()
    expect(bubble()).not.toBeNull()
  })

  it('hides on focusout', async () => {
    mountTooltip({ text: 'Hint' })
    await wrapper!.trigger('focusin')
    await wrapper!.vm.$nextTick()
    expect(bubble()).not.toBeNull()
    await wrapper!.trigger('focusout')
    await wrapper!.vm.$nextTick()
    expect(bubble()).toBeNull()
  })

  it('uses requested placement modifier class', async () => {
    mountTooltip({ text: 'Hint', placement: 'bottom', showDelay: 10 })
    await wrapper!.trigger('mouseenter')
    vi.advanceTimersByTime(10)
    await wrapper!.vm.$nextTick()
    expect(bubble()!.classList.contains('app-tooltip__bubble--bottom')).toBe(true)
  })

  it('flips bottom to top when there is no room below', async () => {
    mountTooltip({ text: 'Hint', placement: 'bottom', showDelay: 10 })
    elmockRect(wrapper!.element, { top: 760, left: 100, width: 24, height: 24 })
    await wrapper!.trigger('mouseenter')
    vi.advanceTimersByTime(10)
    await wrapper!.vm.$nextTick()
    await wrapper!.vm.$nextTick()
    expect(bubble()!.classList.contains('app-tooltip__bubble--top')).toBe(true)
  })
})

function elmockRect(el: Element, r: { top: number; left: number; width: number; height: number }) {
  const bottom = r.top + r.height
  const right = r.left + r.width
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    top: r.top,
    left: r.left,
    right,
    bottom,
    width: r.width,
    height: r.height,
    x: r.left,
    y: r.top,
    toJSON: () => r,
  } as DOMRect)
}
