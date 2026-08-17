import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import ShareAccessModal from './ShareAccessModal.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

vi.mock('@/composables/useAccessShares', () => ({
  useAccessShares: () => ({
    shares: ref([
      {
        id: 's1',
        granteeDisplayName: 'user@example.com',
        permissionLabel: 'VIEW',
        grantedByDisplayName: 'owner@example.com',
      },
    ]),
    isLoading: ref(false),
    isSubmitting: ref(false),
    errorMessage: ref(null),
    loadShares: vi.fn(),
    grantShare: vi.fn(),
    revokeShare: vi.fn(),
  }),
}))

vi.mock('@/composables/useUserSearch', () => ({
  useUserSearch: () => ({
    userSearchEmail: ref(''),
    searchError: ref(null),
    selectedUser: ref(null),
    searchResults: ref([]),
    searchPerformed: ref(false),
    searchUsers: vi.fn(),
    selectUser: vi.fn(),
    resetSearch: vi.fn(),
  }),
}))

const BaseModalStub = {
  template: '<div class="base-modal"><slot /><slot name="footer" /></div>',
}

describe('ShareAccessModal', () => {
  it('uses soft-danger for revoke instead of scoped danger override', () => {
    const wrapper = mount(ShareAccessModal, {
      props: {
        title: 'Share',
        resourceType: 'MODEL',
        resourceId: 'm1',
      },
      global: {
        stubs: { BaseModal: BaseModalStub },
      },
    })

    const revoke = wrapper.find('.share-modal__list-item button')
    expect(revoke.classes()).toContain('btn--soft-danger')
    expect(revoke.classes()).not.toContain('btn--danger')
  })
})
