<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import AppFooter from "../components/layout/AppFooter.vue";
import AppHeader from "../components/layout/AppHeader.vue";
import { apiGet } from "../composables/useApi";
import { useAuth } from "../composables/useAuth";
import type { User } from "../types/entities";

const { currentUser, updateMyProfile } = useAuth();
const { t } = useI18n();

const firstName = ref("");
const lastName = ref("");
const middleName = ref("");
const position = ref("");
const isLoading = ref(false);
const isSaving = ref(false);
const errorMessage = ref<string | null>(null);
const successMessage = ref<string | null>(null);

const applyUser = (user: User): void => {
  firstName.value = user.firstName ?? "";
  lastName.value = user.lastName ?? "";
  middleName.value = user.middleName ?? "";
  position.value = user.position ?? "";
};

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

  if (currentUser.value) {
    applyUser(currentUser.value);
  }
  successMessage.value = t("profile.updated");
};

onMounted(() => {
  if (currentUser.value) {
    applyUser(currentUser.value);
  }
  loadProfile();
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

          <button type="submit" class="btn" :disabled="isSaving || isLoading">
            {{ isSaving ? t("common.saving") : t("common.save") }}
          </button>
        </form>
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

.btn {
  margin-top: 4px;
  border: none;
  border-radius: var(--radius-sm);
  padding: 11px 16px;
  background: var(--primary);
  color: #fff;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
}

.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>
