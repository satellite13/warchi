import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nextTick } from 'vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

const mockApiGet = vi.fn()

vi.mock('./useApi', () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
}))

import { useUserSearch } from './useUserSearch'

function mockUser(id = 'u-1', email = 'user@example.com') {
  return { id, email, firstName: 'Test', lastName: 'User', role: 'USER' }
}

function mockPaginated(content: unknown[]) {
  return {
    content,
    page: { totalPages: 1, totalElements: content.length, number: 0 },
    totalPages: 1,
    totalElements: content.length,
    last: true,
  }
}

describe('useUserSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('initial state', () => {
    it('starts with empty email, null error, null selection, empty results, search not performed', () => {
      const { userSearchEmail, searchError, selectedUser, searchResults, searchPerformed } =
        useUserSearch()

      expect(userSearchEmail.value).toBe('')
      expect(searchError.value).toBeNull()
      expect(selectedUser.value).toBeNull()
      expect(searchResults.value).toEqual([])
      expect(searchPerformed.value).toBe(false)
    })
  })

  describe('searchUsers', () => {
    it('fetches users successfully', async () => {
      const users = [mockUser('u-1', 'anna@example.com'), mockUser('u-2', 'anna2@example.com')]
      mockApiGet.mockResolvedValue({ success: true, data: mockPaginated(users) })

      const { userSearchEmail, searchUsers, searchResults, searchPerformed, searchError } =
        useUserSearch()
      userSearchEmail.value = 'anna@example.com'
      await nextTick()
      await searchUsers()
      await nextTick()

      expect(mockApiGet).toHaveBeenCalledWith(expect.stringContaining('/users/public/search?'))
      expect(searchResults.value).toEqual(users)
      expect(searchPerformed.value).toBe(true)
      expect(searchError.value).toBeNull()
    })

    it('includes email and sort params in query', async () => {
      mockApiGet.mockResolvedValue({ success: true, data: mockPaginated([]) })

      const { userSearchEmail, searchUsers } = useUserSearch()
      userSearchEmail.value = 'john@example.com'
      await nextTick()
      await searchUsers()

      const calledUrl = mockApiGet.mock.calls[0][0]
      expect(calledUrl).toContain('email=john%40example.com')
      expect(calledUrl).toContain('sort=email%2Casc')
    })

    it('sets error on API failure', async () => {
      mockApiGet.mockResolvedValue({
        success: false,
        error: { status: 500, message: 'Database error' },
      })

      const { userSearchEmail, searchUsers, searchError } = useUserSearch()
      userSearchEmail.value = 'test@example.com'
      await nextTick()
      await searchUsers()

      expect(searchError.value).toBe('Database error')
    })

    it('sets validation error when email is empty', async () => {
      const { userSearchEmail, searchUsers, searchError } = useUserSearch()
      userSearchEmail.value = ''
      await nextTick()
      await searchUsers()

      expect(searchError.value).toBe('share.enterEmailForSearch')
      expect(mockApiGet).not.toHaveBeenCalled()
    })

    it('sets validation error for whitespace-only email', async () => {
      const { userSearchEmail, searchUsers, searchError } = useUserSearch()
      userSearchEmail.value = '   '
      await nextTick()
      await searchUsers()

      expect(searchError.value).toBe('share.enterEmailForSearch')
    })

    it('clears previous results and selection before search', async () => {
      mockApiGet.mockResolvedValue({ success: true, data: mockPaginated([]) })

      const { userSearchEmail, searchUsers, selectedUser, searchResults } = useUserSearch()
      searchResults.value = [mockUser('old')]
      userSearchEmail.value = 'new@example.com'
      await nextTick()
      selectedUser.value = mockUser('old')
      await searchUsers()

      expect(selectedUser.value).toBeNull()
    })

    it('handles empty content array', async () => {
      mockApiGet.mockResolvedValue({ success: true, data: mockPaginated([]) })

      const { userSearchEmail, searchUsers, searchResults } = useUserSearch()
      userSearchEmail.value = 'nobody@example.com'
      await nextTick()
      await searchUsers()

      expect(searchResults.value).toEqual([])
    })

    it('handles null content gracefully', async () => {
      mockApiGet.mockResolvedValue({ success: true, data: { content: null } })

      const { userSearchEmail, searchUsers, searchResults } = useUserSearch()
      userSearchEmail.value = 'test@example.com'
      await nextTick()
      await searchUsers()

      expect(searchResults.value).toEqual([])
    })
  })

  describe('selectUser', () => {
    it('sets the selected user', () => {
      const { selectUser, selectedUser } = useUserSearch()
      const user = mockUser('u-42', 'selected@example.com')

      selectUser(user)

      expect(selectedUser.value).toEqual(user)
    })

    it('overwrites previous selection', () => {
      const { selectUser, selectedUser } = useUserSearch()
      selectUser(mockUser('u-1', 'first@example.com'))
      expect(selectedUser.value?.id).toBe('u-1')

      selectUser(mockUser('u-2', 'second@example.com'))
      expect(selectedUser.value?.id).toBe('u-2')
    })
  })

  describe('resetSearch', () => {
    it('resets all state to initial values', () => {
      const {
        userSearchEmail,
        searchError,
        selectedUser,
        searchResults,
        searchPerformed,
        resetSearch,
      } = useUserSearch()

      userSearchEmail.value = 'test@example.com'
      searchError.value = 'some error'
      selectedUser.value = mockUser()
      searchResults.value = [mockUser()]
      searchPerformed.value = true

      resetSearch()

      expect(userSearchEmail.value).toBe('')
      expect(searchError.value).toBeNull()
      expect(selectedUser.value).toBeNull()
      expect(searchResults.value).toEqual([])
      expect(searchPerformed.value).toBe(false)
    })
  })

  describe('watch on userSearchEmail', () => {
    it('clears selection when email changes', async () => {
      const { userSearchEmail, selectedUser, searchError, searchResults, searchPerformed } =
        useUserSearch()

      selectedUser.value = mockUser()
      searchError.value = 'old error'
      searchResults.value = [mockUser()]
      searchPerformed.value = true

      userSearchEmail.value = 'new@example.com'
      await nextTick()

      expect(selectedUser.value).toBeNull()
      expect(searchError.value).toBeNull()
      expect(searchResults.value).toEqual([])
      expect(searchPerformed.value).toBe(false)
    })

    it('clears state on each email change', async () => {
      const { userSearchEmail, selectedUser } = useUserSearch()

      selectedUser.value = mockUser('u-1')
      userSearchEmail.value = 'a@example.com'
      await nextTick()
      expect(selectedUser.value).toBeNull()

      selectedUser.value = mockUser('u-2')
      userSearchEmail.value = 'b@example.com'
      await nextTick()
      expect(selectedUser.value).toBeNull()
    })
  })
})
