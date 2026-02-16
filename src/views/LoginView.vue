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
    <div class="login-bg"></div>
    <div class="login-card">
      <div class="login-header">
        <object class="login-logo" data="/warchi.svg" type="image/svg+xml"/>
        <h1>wArchi</h1>
        <p class="login-subtitle">Архитектурный репозиторий</p>
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
  position: relative;
  overflow: hidden;
}

.login-bg {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 60% 50% at 20% 20%, rgba(124, 92, 252, 0.1) 0%, transparent 60%),
    radial-gradient(ellipse 50% 40% at 80% 80%, rgba(43, 184, 150, 0.08) 0%, transparent 60%);
  pointer-events: none;
}

.login-card {
  width: 100%;
  max-width: 400px;
  padding: 48px 40px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-md);
  position: relative;
  z-index: 1;
}

.login-header {
  text-align: center;
  margin-bottom: 36px;
}

.login-logo {
  width: 72px;
  height: 72px;
}

.login-header h1 {
  margin: 12px 0 4px;
  font-size: 30px;
  font-weight: 600;
  color: var(--base-text);
  letter-spacing: -0.03em;
}

.login-subtitle {
  margin: 0;
  font-size: 14px;
  color: var(--text-subtle);
  letter-spacing: 0.01em;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-field label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-muted);
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.form-field input {
  padding: 12px 16px;
  font-size: 15px;
  font-family: inherit;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  outline: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
  background: var(--surface-muted);
  color: var(--base-text);
}

.form-field input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(124, 92, 252, 0.15);
  background: var(--surface);
}

.form-field input::placeholder {
  color: var(--text-subtle);
}

.form-field input:disabled {
  background: var(--surface-strong);
  color: var(--text-subtle);
}

.error-message {
  padding: 12px 16px;
  background: var(--danger-soft);
  color: var(--danger);
  border-radius: var(--radius-sm);
  font-size: 14px;
  border: 1px solid rgba(239, 68, 68, 0.2);
}

.login-button {
  padding: 14px 24px;
  font-size: 15px;
  font-weight: 600;
  font-family: inherit;
  color: #fff;
  background: var(--primary);
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background 0.2s ease, box-shadow 0.2s ease;
  letter-spacing: 0.01em;
}

.login-button:hover:not(:disabled) {
  background: var(--primary-hover);
  box-shadow: var(--shadow-glow);
}

.login-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
