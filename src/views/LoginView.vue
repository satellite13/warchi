<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuth } from "../composables/useAuth";

const router = useRouter();
const route = useRoute();
const { login, register, registerAdmin } = useAuth();

const email = ref("");
const password = ref("");
const adminSecret = ref("");
const firstName = ref("");
const lastName = ref("");
const middleName = ref("");
const position = ref("");
const isLoading = ref(false);
const errorMessage = ref<string | null>(null);
const successMessage = ref<string | null>(null);
const mode = ref<"login" | "register" | "register-admin">("login");

const modeTitle = computed(() => {
  if (mode.value === "register") return "Регистрация";
  if (mode.value === "register-admin") return "Регистрация администратора";
  return "Вход в систему";
});

const submitLabel = computed(() => {
  if (isLoading.value) return "Отправка...";
  if (mode.value === "register") return "Зарегистрироваться";
  if (mode.value === "register-admin") return "Создать администратора";
  return "Войти";
});

const validateForm = (): string | null => {
  if (!email.value.trim()) return "Введите email";
  if (!password.value.trim()) return "Введите пароль";
  if (password.value.trim().length < 6) return "Пароль должен быть не короче 6 символов";
  if (mode.value !== "login") {
    if (!firstName.value.trim()) return "Введите имя";
    if (!lastName.value.trim()) return "Введите фамилию";
  }
  if (mode.value === "register-admin" && !adminSecret.value.trim()) {
    return "Введите admin secret";
  }
  return null;
};

const handleSubmit = async () => {
  const validationError = validateForm();
  if (validationError) {
    errorMessage.value = validationError;
    return;
  }

  isLoading.value = true;
  errorMessage.value = null;
  successMessage.value = null;

  const emailValue = email.value.trim();
  const passwordValue = password.value.trim();
  const adminSecretValue = adminSecret.value.trim();
  const profileValue = {
    firstName: firstName.value.trim(),
    lastName: lastName.value.trim(),
    middleName: middleName.value.trim() || undefined,
    position: position.value.trim() || undefined
  };

  const result =
    mode.value === "register"
      ? await register(emailValue, passwordValue, profileValue)
      : mode.value === "register-admin"
        ? await registerAdmin(emailValue, passwordValue, adminSecretValue, profileValue)
        : await login(emailValue, passwordValue);

  isLoading.value = false;

  if (result.success) {
    successMessage.value = mode.value === "login" ? "Вход выполнен" : "Регистрация выполнена";
    const redirectTarget =
      typeof route.query.redirect === "string" && route.query.redirect.startsWith("/")
        ? route.query.redirect
        : null;
    await router.push(redirectTarget ?? { name: "home" });
  } else {
    errorMessage.value = result.error || "Ошибка входа";
  }
};

const setMode = (newMode: "login" | "register" | "register-admin") => {
  if (isLoading.value) return;
  mode.value = newMode;
  errorMessage.value = null;
  successMessage.value = null;
};
</script>

<template>
  <main class="login-page">
    <!-- Animated background blobs -->
    <div class="bg-layer">
      <div class="blob blob--1"></div>
      <div class="blob blob--2"></div>
      <div class="blob blob--3"></div>
    </div>
    <div class="bg-noise"></div>

    <!-- Card -->
    <div class="card">
      <div class="card-header">
        <object class="card-logo" data="/warchi.svg" type="image/svg+xml" />
        <div>
          <h1 class="card-brand">wArchi</h1>
          <p class="card-desc">Архитектурный репозиторий</p>
        </div>
      </div>

      <div class="tabs">
        <button
          v-for="t in ([
            { key: 'login', label: 'Вход' },
            { key: 'register', label: 'Регистрация' },
            { key: 'register-admin', label: 'Админ' },
          ] as const)"
          :key="t.key"
          type="button"
          class="tab"
          :class="{ 'tab--active': mode === t.key }"
          @click="setMode(t.key)"
        >
          {{ t.label }}
          <span v-if="mode === t.key" class="tab__indicator"></span>
        </button>
      </div>

      <form class="form" @submit.prevent="handleSubmit">
        <h2 class="form__title">{{ modeTitle }}</h2>

        <Transition name="slide">
          <section v-if="mode !== 'login'" class="profile-fields">
            <div class="field">
              <label class="field__label" for="last-name">Фамилия</label>
              <div class="field__wrap">
                <svg class="field__icon" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="7" r="3" stroke="currentColor" stroke-width="1.4"/>
                  <path d="M4 16c1.2-2.3 3.2-3.5 6-3.5s4.8 1.2 6 3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
                </svg>
                <input
                  id="last-name"
                  v-model="lastName"
                  class="field__input"
                  type="text"
                  placeholder="Иванов"
                  autocomplete="family-name"
                  :disabled="isLoading"
                >
              </div>
            </div>
            <div class="field">
              <label class="field__label" for="first-name">Имя</label>
              <div class="field__wrap">
                <svg class="field__icon" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="7" r="3" stroke="currentColor" stroke-width="1.4"/>
                  <path d="M4 16c1.2-2.3 3.2-3.5 6-3.5s4.8 1.2 6 3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
                </svg>
                <input
                  id="first-name"
                  v-model="firstName"
                  class="field__input"
                  type="text"
                  placeholder="Иван"
                  autocomplete="given-name"
                  :disabled="isLoading"
                >
              </div>
            </div>
            <div class="field">
              <label class="field__label" for="middle-name">Отчество (необязательно)</label>
              <div class="field__wrap">
                <svg class="field__icon" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="7" r="3" stroke="currentColor" stroke-width="1.4"/>
                  <path d="M4 16c1.2-2.3 3.2-3.5 6-3.5s4.8 1.2 6 3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
                </svg>
                <input
                  id="middle-name"
                  v-model="middleName"
                  class="field__input"
                  type="text"
                  placeholder="Иванович"
                  autocomplete="additional-name"
                  :disabled="isLoading"
                >
              </div>
            </div>
            <div class="field">
              <label class="field__label" for="position">Должность (необязательно)</label>
              <div class="field__wrap">
                <svg class="field__icon" viewBox="0 0 20 20" fill="none">
                  <rect x="3" y="5" width="14" height="11" rx="2" stroke="currentColor" stroke-width="1.4"/>
                  <path d="M7 5.5V4.5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 13 4.5v1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
                </svg>
                <input
                  id="position"
                  v-model="position"
                  class="field__input"
                  type="text"
                  placeholder="Архитектор"
                  autocomplete="organization-title"
                  :disabled="isLoading"
                >
              </div>
            </div>
          </section>
        </Transition>

        <div class="field">
          <label class="field__label" for="email">Email</label>
          <div class="field__wrap">
            <svg class="field__icon" viewBox="0 0 20 20" fill="none">
              <path d="M3 5l7 5 7-5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
              <rect x="2" y="4" width="16" height="12" rx="2" stroke="currentColor" stroke-width="1.4"/>
            </svg>
            <input
              id="email"
              v-model="email"
              class="field__input"
              type="email"
              placeholder="user@example.com"
              autocomplete="email"
              :disabled="isLoading"
            >
          </div>
        </div>

        <div class="field">
          <label class="field__label" for="password">Пароль</label>
          <div class="field__wrap">
            <svg class="field__icon" viewBox="0 0 20 20" fill="none">
              <rect x="4" y="9" width="12" height="8" rx="2" stroke="currentColor" stroke-width="1.4"/>
              <path d="M7 9V6a3 3 0 0 1 6 0v3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
            </svg>
            <input
              id="password"
              v-model="password"
              class="field__input"
              type="password"
              placeholder="Минимум 6 символов"
              autocomplete="current-password"
              :disabled="isLoading"
            >
          </div>
        </div>

        <Transition name="slide">
          <div v-if="mode === 'register-admin'" class="field">
            <label class="field__label" for="admin-secret">Admin Secret</label>
            <div class="field__wrap">
              <svg class="field__icon" viewBox="0 0 20 20" fill="none">
                <path d="M10 2l1.5 4.5H16l-3.7 2.7 1.4 4.3L10 11l-3.7 2.5 1.4-4.3L4 6.5h4.5z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
              </svg>
              <input
                id="admin-secret"
                v-model="adminSecret"
                class="field__input"
                type="password"
                placeholder="Секрет для создания администратора"
                :disabled="isLoading"
              >
            </div>
          </div>
        </Transition>

        <Transition name="fade">
          <div v-if="errorMessage" class="msg msg--error">{{ errorMessage }}</div>
        </Transition>
        <Transition name="fade">
          <div v-if="successMessage" class="msg msg--success">{{ successMessage }}</div>
        </Transition>

        <button type="submit" class="submit" :disabled="isLoading">
          <span v-if="isLoading" class="submit__spinner"></span>
          {{ submitLabel }}
        </button>
      </form>
    </div>
  </main>
</template>

<style scoped>
/* ─── Page ────────────────────────────────────── */
.login-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: #f0ede8;
  position: relative;
  overflow: hidden;
}

/* ─── Background ──────────────────────────────── */
.bg-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

.blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  will-change: transform;
}

.blob--1 {
  width: 500px;
  height: 500px;
  top: -10%;
  left: -5%;
  background: rgba(124, 92, 252, 0.15);
  animation: drift1 14s ease-in-out infinite;
}

.blob--2 {
  width: 400px;
  height: 400px;
  bottom: -8%;
  right: -3%;
  background: rgba(43, 184, 150, 0.13);
  animation: drift2 16s ease-in-out infinite;
}

.blob--3 {
  width: 300px;
  height: 300px;
  top: 50%;
  left: 55%;
  background: rgba(230, 126, 34, 0.08);
  animation: drift3 18s ease-in-out infinite;
}

@keyframes drift1 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33% { transform: translate(60px, 40px) scale(1.05); }
  66% { transform: translate(-30px, 60px) scale(0.97); }
}

@keyframes drift2 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33% { transform: translate(-50px, -30px) scale(1.03); }
  66% { transform: translate(40px, -50px) scale(0.95); }
}

@keyframes drift3 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(-40px, 30px) scale(1.08); }
}

.bg-noise {
  position: absolute;
  inset: 0;
  opacity: 0.35;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size: 128px 128px;
  pointer-events: none;
  mix-blend-mode: overlay;
}

/* ─── Card ────────────────────────────────────── */
.card {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 420px;
  padding: 40px 36px 44px;
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(24px) saturate(1.4);
  -webkit-backdrop-filter: blur(24px) saturate(1.4);
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 20px;
  box-shadow:
    0 8px 40px rgba(0, 0, 0, 0.06),
    0 1px 0 rgba(255, 255, 255, 0.6) inset;
  animation: cardIn 0.5s ease-out both;
}

@keyframes cardIn {
  from {
    opacity: 0;
    transform: translateY(20px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* ─── Header ──────────────────────────────────── */
.card-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 32px;
}

.card-logo {
  width: 52px;
  height: 52px;
  flex-shrink: 0;
}

.card-brand {
  margin: 0;
  font-size: 26px;
  font-weight: 700;
  color: var(--base-text);
  letter-spacing: -0.04em;
  line-height: 1.1;
}

.card-desc {
  margin: 3px 0 0;
  font-size: 13px;
  color: var(--text-muted);
  letter-spacing: 0.01em;
}

/* ─── Tabs ────────────────────────────────────── */
.tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 28px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  padding-bottom: 0;
}

.tab {
  position: relative;
  flex: 1;
  padding: 10px 8px 12px;
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  border: none;
  background: transparent;
  color: var(--text-subtle);
  cursor: pointer;
  transition: color 0.2s ease;
}

.tab:hover:not(.tab--active) {
  color: var(--text-muted);
}

.tab--active {
  color: var(--primary);
}

.tab__indicator {
  position: absolute;
  bottom: -1px;
  left: 12%;
  right: 12%;
  height: 2px;
  background: var(--primary);
  border-radius: 2px 2px 0 0;
  animation: indicatorIn 0.25s ease-out;
}

@keyframes indicatorIn {
  from {
    transform: scaleX(0);
  }
  to {
    transform: scaleX(1);
  }
}

/* ─── Form ────────────────────────────────────── */
.form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form__title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: var(--base-text);
  letter-spacing: -0.02em;
}

/* ─── Field ───────────────────────────────────── */
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field__label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.field__wrap {
  position: relative;
}

.field__icon {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  width: 18px;
  height: 18px;
  color: var(--text-subtle);
  pointer-events: none;
  transition: color 0.2s ease;
}

.field__wrap:focus-within .field__icon {
  color: var(--primary);
}

.field__input {
  width: 100%;
  padding: 12px 14px 12px 42px;
  font-size: 15px;
  font-family: inherit;
  border: 1.5px solid rgba(0, 0, 0, 0.08);
  border-radius: 12px;
  outline: none;
  background: rgba(255, 255, 255, 0.6);
  color: var(--base-text);
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
  box-sizing: border-box;
}

.field__input--plain {
  padding-left: 14px;
}

.field__input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-soft);
  background: rgba(255, 255, 255, 0.85);
}

.field__input::placeholder {
  color: var(--text-subtle);
}

.field__input:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* ─── Messages ────────────────────────────────── */
.msg {
  padding: 11px 14px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
}

.msg--error {
  background: rgba(220, 53, 69, 0.08);
  color: var(--danger);
  border: 1px solid rgba(220, 53, 69, 0.12);
}

.msg--success {
  background: rgba(30, 163, 85, 0.08);
  color: var(--success);
  border: 1px solid rgba(30, 163, 85, 0.12);
}

/* ─── Submit ──────────────────────────────────── */
.submit {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px 24px;
  margin-top: 2px;
  font-size: 15px;
  font-weight: 600;
  font-family: inherit;
  color: #fff;
  background: var(--primary);
  border: none;
  border-radius: 12px;
  cursor: pointer;
  transition: background 0.2s ease, box-shadow 0.2s ease, transform 0.12s ease;
}

.submit:hover:not(:disabled) {
  background: var(--primary-hover);
  box-shadow: 0 6px 24px rgba(124, 92, 252, 0.28);
  transform: translateY(-1px);
}

.submit:active:not(:disabled) {
  transform: translateY(0);
}

.submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.submit__spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ─── Transitions ─────────────────────────────── */
.slide-enter-active,
.slide-leave-active {
  transition: all 0.3s ease;
  overflow: hidden;
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  max-height: 0;
  margin-top: -20px;
}

.slide-enter-to,
.slide-leave-from {
  opacity: 1;
  max-height: 420px;
  margin-top: 0;
}

.profile-fields {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px 12px;
  padding: 12px;
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.48);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* ─── Responsive ──────────────────────────────── */
@media (max-width: 500px) {
  .card {
    margin: 16px;
    padding: 28px 24px 32px;
  }
}
</style>
