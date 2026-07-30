<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import AppFooter from "../components/layout/AppFooter.vue";
import AppHeader from "../components/layout/AppHeader.vue";
import UiIcon from "@/components/ui/UiIcon.vue";
import { apiGet } from "../composables/useApi";
import { useAuth } from "../composables/useAuth";
import { useOidcAuth } from "../composables/useOidcAuth";
import type { User } from "../types/entities";

const { currentUser, updateMyProfile } = useAuth();
const { ssoLogin, unlinkSso, getLinkStatus, fetchSsoConfig, oidcLinkStatus, ssoConfig } = useOidcAuth();
const { t } = useI18n();

const firstName = ref("");
const lastName = ref("");
const middleName = ref("");
const position = ref("");
const isLoading = ref(false);
const isSaving = ref(false);
const errorMessage = ref<string | null>(null);
const successMessage = ref<string | null>(null);

const savedFirstName = ref("");
const savedLastName = ref("");
const savedMiddleName = ref("");
const savedPosition = ref("");

const applyUser = (user: User): void => {
  firstName.value = user.firstName ?? "";
  lastName.value = user.lastName ?? "";
  middleName.value = user.middleName ?? "";
  position.value = user.position ?? "";
  savedFirstName.value = firstName.value;
  savedLastName.value = lastName.value;
  savedMiddleName.value = middleName.value;
  savedPosition.value = position.value;
};

const isDirty = computed(
  () =>
    firstName.value !== savedFirstName.value ||
    lastName.value !== savedLastName.value ||
    middleName.value !== savedMiddleName.value ||
    position.value !== savedPosition.value
);

const loadProfile = async (): Promise<void> => {
  isLoading.value = true;
  errorMessage.value = null;
  successMessage.value = null;

  const result = await apiGet<User>("/users/me/profile");
  isLoading.value = false;

  if (!result.success) {
    errorMessage.value = result.error.message;
    return;
  }

  applyUser(result.data);
};

const saveProfile = async (): Promise<void> => {
  if (!firstName.value.trim()) {
    errorMessage.value = t("auth.validationFirstNameRequired");
    return;
  }
  if (!lastName.value.trim()) {
    errorMessage.value = t("auth.validationLastNameRequired");
    return;
  }

  isSaving.value = true;
  errorMessage.value = null;
  successMessage.value = null;

  const result = await updateMyProfile({
    firstName: firstName.value.trim(),
    lastName: lastName.value.trim(),
    middleName: middleName.value.trim(),
    position: position.value.trim()
  });
  isSaving.value = false;

  if (!result.success) {
    errorMessage.value = result.error;
    return;
  }

  savedFirstName.value = firstName.value.trim();
  savedLastName.value = lastName.value.trim();
  savedMiddleName.value = middleName.value.trim();
  savedPosition.value = position.value.trim();
  if (currentUser.value) {
    applyUser(currentUser.value);
  }
  successMessage.value = t("profile.updated");
};

const handleLinkSso = async (): Promise<void> => {
  if (!currentUser.value?.id) return;
  errorMessage.value = null;
  await ssoLogin();
};

const handleUnlinkSso = async (): Promise<void> => {
  const success = await unlinkSso();
  if (success) {
    successMessage.value = t("profile.ssoUnlinked");
    errorMessage.value = null;
  } else {
    errorMessage.value = t("profile.ssoUnlinkError");
  }
};

onMounted(async () => {
  if (currentUser.value) {
    applyUser(currentUser.value);
  }
  loadProfile();
  await fetchSsoConfig();
  if (ssoConfig.value.enabled) {
    await getLinkStatus();
  }
});
</script>

<template>
  <div class="profile-page">
    <header class="profile-page__header">
      <AppHeader />
    </header>
    <main class="profile-page__body">
      <section class="card">
        <h1>{{ t("profile.myProfile") }}</h1>
        <p>{{ t("profile.subtitle") }}</p>

        <form class="form" @submit.prevent="saveProfile">
          <label class="field">
            <span>{{ t("auth.labelFirstName") }}</span>
            <input v-model="firstName" type="text" :disabled="isLoading || isSaving">
          </label>
          <label class="field">
            <span>{{ t("auth.labelLastName") }}</span>
            <input v-model="lastName" type="text" :disabled="isLoading || isSaving">
          </label>
          <label class="field">
            <span>{{ t("profile.middleName") }}</span>
            <input v-model="middleName" type="text" :disabled="isLoading || isSaving">
          </label>
          <label class="field">
            <span>{{ t("profile.position") }}</span>
            <input v-model="position" type="text" :disabled="isLoading || isSaving">
          </label>

          <div v-if="errorMessage" class="msg msg--error">{{ errorMessage }}</div>
          <div v-if="successMessage" class="msg msg--success">{{ successMessage }}</div>

          <button type="submit" class="btn btn--primary profile-form__save" :disabled="isSaving || isLoading || !isDirty">
            <UiIcon name="save" />
            {{ isSaving ? t("common.saving") : t("common.save") }}
          </button>
        </form>
      </section>

      <section v-if="ssoConfig.enabled" class="card sso-section">
        <h2>{{ t("profile.ssoTitle") }}</h2>
        <p>{{ t("profile.ssoSubtitle") }}</p>

        <div class="sso-status">
          <div v-if="oidcLinkStatus.linked" class="sso-linked">
            <svg class="sso-icon" viewBox="0 0 20 20" fill="none">
              <path d="M10 2a3 3 0 0 1 3 3v2a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" stroke="#1ea355" stroke-width="1.4"/>
              <path d="M6 16c0-2.2 1.8-4 4-4s4 1.8 4 4" stroke="#1ea355" stroke-width="1.4" stroke-linecap="round"/>
              <circle cx="10" cy="13" r="1" fill="#1ea355"/>
            </svg>
            <span>{{ t("profile.ssoLinked") }}</span>
            <button
              type="button"
              class="btn btn--danger sso-unlink"
              @click="handleUnlinkSso"
            >
              {{ t("profile.ssoUnlink") }}
            </button>
          </div>
          <div v-else class="sso-unlinked">
            <svg class="sso-icon" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="7" stroke="var(--text-subtle)" stroke-width="1.4"/>
              <path d="M10 7v6M7 10h6" stroke="var(--text-subtle)" stroke-width="1.4" stroke-linecap="round"/>
            </svg>
            <span>{{ t("profile.ssoNotLinked") }}</span>
            <button
              type="button"
              class="btn btn--primary sso-link"
              @click="handleLinkSso"
            >
              {{ t("profile.ssoLink") }}
            </button>
          </div>
        </div>
      </section>
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

.card {
  max-width: 560px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 20px;
}

.card h1 {
  margin: 0;
  font-size: 24px;
}

.card p {
  margin: 6px 0 16px;
  color: var(--text-muted);
}

.form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field span {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted);
}

.field input {
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

.profile-form__save {
  margin-top: 4px;
}

.sso-section {
  margin-top: 20px;
}

.sso-section h2 {
  margin: 0 0 4px;
  font-size: 18px;
}

.sso-section p {
  margin: 0 0 16px;
  color: var(--text-muted);
  font-size: 13px;
}

.sso-status {
  display: flex;
  flex-direction: column;
  gap: 12px;
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
</style>
