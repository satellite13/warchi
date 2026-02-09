<script setup lang="ts">
import {ref} from "vue";
import {useRouter} from "vue-router";
import {useAuth} from "../composables/useAuth";

const router = useRouter();
const {login} = useAuth();

const email = ref("");
const isLoading = ref(false);
const errorMessage = ref<string | null>(null);

const handleSubmit = async () => {
  if (!email.value.trim()) {
    errorMessage.value = "Введите email";
    return;
  }

  isLoading.value = true;
  errorMessage.value = null;

  const result = await login(email.value.trim());

  isLoading.value = false;

  if (result.success) {
    await router.push({name: "home"});
  } else {
    errorMessage.value = result.error || "Ошибка входа";
  }
};
</script>

<template>
  <main class="login">
    <div class="login-card">
      <div class="login-header">
        <object class="login-logo" data="/warchi.svg" type="image/svg+xml"/>
        <h1>wArchi</h1>
      </div>

      <form class="login-form" @submit.prevent="handleSubmit">
        <div class="form-field">
          <label for="email">Email</label>
          <input id="email" v-model="email" type="email" placeholder="user@example.com" :disabled="isLoading">
        </div>
        <div v-if="errorMessage" class="error-message">{{ errorMessage }}</div>

        <button type="submit" class="login-button" :disabled="isLoading">
          {{ isLoading ? "Вход..." : "Войти" }}
        </button>
      </form>
    </div>
  </main>
</template>

<style scoped>
.login {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: var(--base-bg);
}

.login-card {
  width: 100%;
  max-width: 400px;
  padding: 40px;
  background: var(--surface);
  border-radius: var(--radius);
  box-shadow: var(--shadow-md);
}

.login-header {
  text-align: center;
  margin-bottom: 32px;
}

.login-logo {
  width: 86px;
  height: 86px;
}

.login-header h1 {
  margin: 0 0 8px;
  font-size: 32px;
  font-weight: 300;
  color: var(--base-text);
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-field label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-muted);
}

.form-field input {
  padding: 12px 16px;
  font-size: 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  outline: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  background: var(--surface);
  color: var(--base-text);
}

.form-field input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.2);
}

.form-field input:disabled {
  background: var(--surface-strong);
  color: var(--text-muted);
}

.error-message {
  padding: 12px 16px;
  background: var(--danger-soft);
  color: var(--danger);
  border-radius: var(--radius-sm);
  font-size: 14px;
}

.login-button {
  padding: 14px 24px;
  font-size: 16px;
  font-weight: 500;
  color: var(--surface);
  background: var(--primary);
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background 0.2s ease;
}

.login-button:hover:not(:disabled) {
  background: var(--primary-hover);
}

.login-button:disabled {
  background: var(--border-strong);
  cursor: not-allowed;
}
</style>
