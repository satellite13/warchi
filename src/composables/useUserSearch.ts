import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { apiGet } from './useApi'
import { pagedListParams, PAGE_SIZE_SEARCH } from '../api/queryHelpers'
import type { PaginatedResponse, UserInfo } from '../types/entities'

export function useUserSearch() {
  const { t } = useI18n()

  const userSearchEmail = ref('')
  const searchError = ref<string | null>(null)
  const selectedUser = ref<UserInfo | null>(null)
  const searchResults = ref<UserInfo[]>([])
  const searchPerformed = ref(false)

  const searchUsers = async (): Promise<void> => {
    const email = userSearchEmail.value.trim()
    searchError.value = null
    searchPerformed.value = true
    selectedUser.value = null
    searchResults.value = []

    if (!email) {
      searchError.value = t('share.enterEmailForSearch')
      return
    }

    const query = pagedListParams(0, PAGE_SIZE_SEARCH)
    query.set('sort', 'email,asc')
    query.set('email', email)

    const result = await apiGet<PaginatedResponse<UserInfo>>(
      `/users/public/search?${query.toString()}`,
    )
    if (!result.success) {
      searchError.value = result.error.message
      return
    }

    searchResults.value = Array.isArray(result.data.content) ? result.data.content : []
  }

  const selectUser = (user: UserInfo) => {
    selectedUser.value = user
  }

  const resetSearch = () => {
    userSearchEmail.value = ''
    selectedUser.value = null
    searchError.value = null
    searchResults.value = []
    searchPerformed.value = false
  }

  watch(userSearchEmail, () => {
    selectedUser.value = null
    searchError.value = null
    searchResults.value = []
    searchPerformed.value = false
  })

  return {
    userSearchEmail,
    searchError,
    selectedUser,
    searchResults,
    searchPerformed,
    searchUsers,
    selectUser,
    resetSearch,
  }
}
