import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import LoginView from './LoginView.vue'

const ssoConfig = ref({
  enabled: true,
  displayName: 'Lemanapro',
  buttonBg: '#F5C518',
  buttonTextColor: '#1A1A1A',
  buttonIconUrl: '/icons/lemanapro.svg',
  registrationEnabled: false,
})

vi.mock('../composables/useOidcAuth', () => ({
  useOidcAuth: () => ({
    ssoLogin: vi.fn(),
    fetchSsoConfig: vi.fn(async () => ssoConfig.value),
    ssoConfig,
  }),
}))

vi.mock('../composables/useAuth', () => ({
  useAuth: () => ({
    login: vi.fn(),
    register: vi.fn(),
    registerAdmin: vi.fn(),
  }),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: { name?: string }) =>
      params?.name ? `${key}:${params.name}` : key,
  }),
}))

vi.mock('../components/layout/LanguageSwitcher.vue', () => ({
  default: { name: 'LanguageSwitcher', template: '<div />' },
}))

vi.mock('@/components/ui/UiIcon.vue', () => ({
  default: { name: 'UiIcon', template: '<span />' },
}))

describe('LoginView', () => {
  beforeEach(() => {
    ssoConfig.value = {
      enabled: true,
      displayName: 'Lemanapro',
      buttonBg: '#F5C518',
      buttonTextColor: '#1A1A1A',
      buttonIconUrl: '/icons/lemanapro.svg',
      registrationEnabled: false,
    }
  })

  it('hides register and admin tabs when registration is disabled', async () => {
    const wrapper = mount(LoginView)
    await flushPromises()
    const labels = wrapper.findAll('.tab').map((t) => t.text())
    expect(labels.some((t) => t.includes('auth.tabLogin'))).toBe(true)
    expect(labels.some((t) => t.includes('auth.tabRegister'))).toBe(false)
    expect(labels.some((t) => t.includes('auth.tabAdmin'))).toBe(false)
  })

  it('applies SSO button branding from config', async () => {
    const wrapper = mount(LoginView)
    await flushPromises()
    const btn = wrapper.get('.sso-btn')
    expect(btn.attributes('style')).toContain('--sso-btn-bg: #F5C518')
    expect(btn.attributes('style')).toContain('--sso-btn-color: #1A1A1A')
    expect(wrapper.get('.sso-btn__icon').attributes('src')).toBe('/icons/lemanapro.svg')
  })

  it('shows register tabs when registrationEnabled is true', async () => {
    ssoConfig.value = { ...ssoConfig.value, registrationEnabled: true }
    const wrapper = mount(LoginView)
    await flushPromises()
    const labels = wrapper.findAll('.tab').map((t) => t.text())
    expect(labels.some((t) => t.includes('auth.tabRegister'))).toBe(true)
    expect(labels.some((t) => t.includes('auth.tabAdmin'))).toBe(true)
  })
})
