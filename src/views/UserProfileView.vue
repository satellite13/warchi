<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { useI18n } from "vue-i18n"
import AppFooter from "../components/layout/AppFooter.vue"
import AppHeader from "../components/layout/AppHeader.vue"
import ApiKeysSection from "@/components/profile/ApiKeysSection.vue"
import UiIcon from "@/components/ui/UiIcon.vue"
import { apiGet } from "../composables/useApi"
import { useAuth } from "../composables/useAuth"
import { useOidcAuth } from "../composables/useOidcAuth"
import type { User } from "../types/entities"

const { currentUser, updateMyProfile } = useAuth()
const { ssoLogin, unlinkSso, getLinkStatus, fetchSsoConfig, oidcLinkStatus, ssoConfig } =
  useOidcAuth()
const { t } = useI18n()

const firstName = ref("")
const lastName = ref("")
const middleName = ref("")
const position = ref("")
const isLoading = ref(false)
const isSaving = ref(false)
const errorMessage = ref<string | null>(null)
const successMessage = ref<string | null>(null)

const savedFirstName = ref("")
const savedLastName = ref("")
const savedMiddleName = ref("")
const savedPosition = ref("")

const displayName = computed(() => {
  const parts = [firstName.value, lastName.value].map((s) => s.trim()).filter(Boolean)
  return parts.length > 0 ? parts.join(" ") : (currentUser.value?.email ?? "—")
})

const avatarLetter = computed(() => {
  const fromName = firstName.value.trim() || lastName.value.trim()
  const source = fromName || currentUser.value?.email || "?"
  return source.slice(0, 1).toLocaleUpperCase()
})

const applyUser = (user: User): void => {
  firstName.value = user.firstName ?? ""
  lastName.value = user.lastName ?? ""
  middleName.value = user.middleName ?? ""
  position.value = user.position ?? ""
  savedFirstName.value = firstName.value
  savedLastName.value = lastName.value
  savedMiddleName.value = middleName.value
  savedPosition.value = position.value
}

const isDirty = computed(
  () =>
    firstName.value !== savedFirstName.value ||
    lastName.value !== savedLastName.value ||
    middleName.value !== savedMiddleName.value ||
    position.value !== savedPosition.value
)

const loadProfile = async (): Promise<void> => {
  isLoading.value = true
  errorMessage.value = null
  successMessage.value = null

  const result = await apiGet<User>("/users/me/profile")
  isLoading.value = false

  if (!result.success) {
    errorMessage.value = result.error.message
    return
  }

  applyUser(result.data)
}

const saveProfile = async (): Promise<void> => {
  if (!firstName.value.trim()) {
    errorMessage.value = t("auth.validationFirstNameRequired")
    return
  }
  if (!lastName.value.trim()) {
    errorMessage.value = t("auth.validationLastNameRequired")
    return
  }

  isSaving.value = true
  errorMessage.value = null
  successMessage.value = null

  const result = await updateMyProfile({
    firstName: firstName.value.trim(),
    lastName: lastName.value.trim(),
    middleName: middleName.value.trim(),
    position: position.value.trim(),
  })
  isSaving.value = false

  if (!result.success) {
    errorMessage.value = result.error
    return
  }

  savedFirstName.value = firstName.value.trim()
  savedLastName.value = lastName.value.trim()
  savedMiddleName.value = middleName.value.trim()
  savedPosition.value = position.value.trim()
  if (currentUser.value) {
    applyUser(currentUser.value)
  }
  successMessage.value = t("profile.updated")
}

const handleLinkSso = async (): Promise<void> => {
  if (!currentUser.value?.id) return
  errorMessage.value = null
  await ssoLogin()
}

const handleUnlinkSso = async (): Promise<void> => {
  const success = await unlinkSso()
  if (success) {
    successMessage.value = t("profile.ssoUnlinked")
    errorMessage.value = null
  } else {
    errorMessage.value = t("profile.ssoUnlinkError")
  }
}

onMounted(async () => {
  if (currentUser.value) {
    applyUser(currentUser.value)
  }
  loadProfile()
  await fetchSsoConfig()
  if (ssoConfig.value.enabled) {
    await getLinkStatus()
  }
})
</script>

<template>
  <div class="profile-page">
    <header class="profile-page__header">
      <AppHeader />
    </header>
    <main class="profile-page__body">
      <div class="profile-shell">
        <header class="profile-shell__intro">
          <div class="profile-shell__intro-text">
            <h1>{{ t("profile.myProfile") }}</h1>
            <p>{{ t("profile.subtitle") }}</p>
          </div>
          <div class="profile-shell__identity">
            <div class="profile-shell__avatar" aria-hidden="true">
              {{ avatarLetter }}
            </div>
            <div class="profile-shell__identity-meta">
              <strong>{{ displayName }}</strong>
              <span v-if="currentUser?.email">{{ currentUser.email }}</span>
            </div>
          </div>
        </header>

        <div class="profile-shell__grid">
          <div class="profile-shell__aside">
            <section class="panel">
              <div class="panel__head">
                <h2>{{ t("profile.personalTitle") }}</h2>
                <p>{{ t("profile.personalSubtitle") }}</p>
              </div>

              <form class="form" @submit.prevent="saveProfile">
                <div class="form__row">
                  <label class="field">
                    <span>{{ t("auth.labelFirstName") }}</span>
                    <input v-model="firstName" type="text" :disabled="isLoading || isSaving" />
                  </label>
                  <label class="field">
                    <span>{{ t("auth.labelLastName") }}</span>
                    <input v-model="lastName" type="text" :disabled="isLoading || isSaving" />
                  </label>
                </div>
                <label class="field">
                  <span>{{ t("profile.middleName") }}</span>
                  <input v-model="middleName" type="text" :disabled="isLoading || isSaving" />
                </label>
                <label class="field">
                  <span>{{ t("profile.position") }}</span>
                  <input v-model="position" type="text" :disabled="isLoading || isSaving" />
                </label>

                <div v-if="errorMessage" class="msg msg--error">{{ errorMessage }}</div>
                <div v-if="successMessage" class="msg msg--success">{{ successMessage }}</div>

                <div class="form__actions">
                  <button
                    type="submit"
                    class="btn btn--primary"
                    :disabled="isSaving || isLoading || !isDirty"
                  >
                    <UiIcon name="save" />
                    {{ isSaving ? t("common.saving") : t("common.save") }}
                  </button>
                </div>
              </form>
            </section>

            <section v-if="ssoConfig.enabled" class="panel">
              <div class="panel__head">
                <h2>{{ t("profile.ssoTitle") }}</h2>
                <p>{{ t("profile.ssoSubtitle") }}</p>
              </div>

              <div class="sso-status">
                <div v-if="oidcLinkStatus.linked" class="sso-linked">
                  <UiIcon name="verified_user" class="sso-icon" />
                  <span>{{ t("profile.ssoLinked") }}</span>
                  <button type="button" class="btn btn--danger sso-unlink" @click="handleUnlinkSso">
                    {{ t("profile.ssoUnlink") }}
                  </button>
                </div>
                <div v-else class="sso-unlinked">
                  <UiIcon name="link" class="sso-icon" />
                  <span>{{ t("profile.ssoNotLinked") }}</span>
                  <button type="button" class="btn btn--primary sso-link" @click="handleLinkSso">
                    {{ t("profile.ssoLink") }}
                  </button>
                </div>
              </div>
            </section>
          </div>

          <div class="profile-shell__main">
            <ApiKeysSection />
          </div>
        </div>
      </div>
    </main>
    <footer class="profile-page__footer">
      <AppFooter />
    </footer>
  </div>
</template>

<style scoped>
.profile-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.profile-page__body {
  flex: 1;
  overflow: auto;
  background: var(--base-bg);
  padding: 28px;
}

.profile-shell {
  max-width: 1120px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.profile-shell__intro {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  flex-wrap: wrap;
}

.profile-shell__intro-text h1 {
  margin: 0;
  font-size: 28px;
  letter-spacing: -0.02em;
}

.profile-shell__intro-text p {
  margin: 6px 0 0;
  color: var(--text-muted);
  font-size: 14px;
  max-width: 42ch;
}

.profile-shell__identity {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}

.profile-shell__avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: color-mix(in srgb, var(--primary) 16%, var(--surface));
  color: var(--primary);
  font-weight: 700;
  font-size: 16px;
}

.profile-shell__identity-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.profile-shell__identity-meta strong {
  font-size: 14px;
}

.profile-shell__identity-meta span {
  font-size: 12px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 280px;
}

.profile-shell__grid {
  display: grid;
  grid-template-columns: minmax(280px, 360px) minmax(0, 1fr);
  gap: 20px;
  align-items: stretch;
}

.profile-shell__aside,
.profile-shell__main {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.profile-shell__main > :deep(.panel) {
  flex: 1;
}

.panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 20px;
  overflow: hidden;
}

.panel__head {
  margin-bottom: 16px;
}

.panel__head h2 {
  margin: 0;
  font-size: 17px;
}

.panel__head p {
  margin: 4px 0 0;
  color: var(--text-muted);
  font-size: 13px;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.form__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
  min-width: 0;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.field span {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted);
}

.field input {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--surface-muted);
  color: var(--base-text);
  font-family: inherit;
  font-size: 14px;
}

.field input:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-soft);
}

.form__actions {
  display: flex;
  justify-content: flex-start;
  margin-top: 4px;
}

.msg {
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  font-size: 14px;
}

.msg--error {
  border: 1px solid rgba(220, 53, 69, 0.12);
  background: var(--danger-soft);
  color: var(--danger);
}

.msg--success {
  border: 1px solid color-mix(in srgb, var(--success) 28%, transparent);
  background: color-mix(in srgb, var(--success) 14%, transparent);
  color: var(--success);
}

.sso-linked,
.sso-unlinked {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-radius: var(--radius-sm);
}

.sso-linked {
  background: color-mix(in srgb, var(--success) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--success) 20%, transparent);
}

.sso-unlinked {
  background: color-mix(in srgb, var(--text-subtle) 6%, transparent);
  border: 1px solid var(--border);
}

.sso-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.sso-link,
.sso-unlink {
  margin-left: auto;
}

@media (max-width: 960px) {
  .profile-shell__grid {
    grid-template-columns: 1fr;
  }

  .profile-shell__main {
    order: 2;
  }
}

@media (max-width: 640px) {
  .profile-page__body {
    padding: 16px;
  }

  .form__row {
    grid-template-columns: 1fr;
  }

  .profile-shell__identity {
    width: 100%;
  }

  .sso-linked,
  .sso-unlinked {
    flex-wrap: wrap;
  }

  .sso-link,
  .sso-unlink {
    margin-left: 0;
    width: 100%;
  }
}
</style>
