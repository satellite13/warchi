import { ref } from 'vue'
import type { Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { isPasswordPolicySatisfied } from '@/utils/passwordPolicy'

type ProfileFields = {
  firstName: string
  lastName: string
  middleName: string
  position: string
}

type ProfileUser = {
  id: string
  firstName?: string | null
  lastName?: string | null
  middleName?: string | null
  position?: string | null
}

type UpdateFn = (
  userId: string,
  patch: Record<string, unknown>,
) => Promise<void>

export function useUserProfileEdit(
  isSavingId: Ref<string | null>,
  errorMessage: Ref<string | null>,
  successMessage: Ref<string | null>,
  updateUser: UpdateFn,
) {
  const { t } = useI18n()
  const profileEditId = ref<string | null>(null)
  const profileDraft = ref<Record<string, ProfileFields>>({})

  const openProfileEdit = (user: ProfileUser): void => {
    profileEditId.value = user.id
    profileDraft.value[user.id] = {
      firstName: user.firstName?.trim() ?? '',
      lastName: user.lastName?.trim() ?? '',
      middleName: user.middleName?.trim() ?? '',
      position: user.position?.trim() ?? '',
    }
    errorMessage.value = null
    successMessage.value = null
  }

  const closeProfileEdit = (): void => {
    if (!profileEditId.value) return
    delete profileDraft.value[profileEditId.value]
    profileEditId.value = null
  }

  const getProfileDraft = (userId: string): ProfileFields => {
    if (!profileDraft.value[userId]) {
      profileDraft.value[userId] = {
        firstName: '',
        lastName: '',
        middleName: '',
        position: '',
      }
    }
    return profileDraft.value[userId]
  }

  const submitProfileChange = async (user: ProfileUser): Promise<void> => {
    const draft = profileDraft.value[user.id]
    if (!draft) return

    const firstName = draft.firstName.trim()
    const lastName = draft.lastName.trim()
    const middleName = draft.middleName.trim()
    const position = draft.position.trim()

    if (!firstName) {
      errorMessage.value = t('auth.validationFirstNameRequired')
      return
    }
    if (!lastName) {
      errorMessage.value = t('auth.validationLastNameRequired')
      return
    }

    await updateUser(user.id, {
      firstName,
      lastName,
      middleName,
      position,
    })

    if (isSavingId.value === null && !errorMessage.value) {
      successMessage.value = t('adminUsers.profileUpdated', { email: (user as { email?: string }).email })
      closeProfileEdit()
    }
  }

  return {
    profileEditId,
    profileDraft,
    openProfileEdit,
    closeProfileEdit,
    getProfileDraft,
    submitProfileChange,
  }
}

export function useUserPasswordEdit(
  isSavingId: Ref<string | null>,
  errorMessage: Ref<string | null>,
  successMessage: Ref<string | null>,
  updateUser: UpdateFn,
) {
  const { t } = useI18n()
  const passwordEditId = ref<string | null>(null)
  const passwordDraft = ref<Record<string, string>>({})

  const openPasswordEdit = (userId: string): void => {
    passwordEditId.value = userId
    passwordDraft.value[userId] = ''
    errorMessage.value = null
    successMessage.value = null
  }

  const closePasswordEdit = (): void => {
    if (!passwordEditId.value) return
    delete passwordDraft.value[passwordEditId.value]
    passwordEditId.value = null
  }

  const submitPasswordChange = async (user: { id: string; email?: string }): Promise<void> => {
    const nextPassword = (passwordDraft.value[user.id] ?? '').trim()
    if (!isPasswordPolicySatisfied(nextPassword)) {
      errorMessage.value = t('adminUsers.passwordMinLength')
      return
    }

    await updateUser(user.id, { password: nextPassword })
    if (isSavingId.value === null && !errorMessage.value) {
      successMessage.value = t('adminUsers.passwordUpdated', { email: user.email })
      closePasswordEdit()
    }
  }

  return {
    passwordEditId,
    passwordDraft,
    openPasswordEdit,
    closePasswordEdit,
    submitPasswordChange,
  }
}
