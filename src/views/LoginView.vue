<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { useAuth } from "../composables/useAuth";
import { useOidcAuth } from "../composables/useOidcAuth";
import LanguageSwitcher from "../components/layout/LanguageSwitcher.vue";

const router = useRouter();
const route = useRoute();
const { t } = useI18n();
const { login } = useAuth();
const { ssoLogin } = useOidcAuth();

const email = ref("");
const password = ref("");
const isLoading = ref(false);
const errorMessage = ref<string | null>(null);
const successMessage = ref<string | null>(null);
const isSsoLoading = ref(false);
const ssoError = ref<string | null>(null);

const submitLabel = computed(() => {
  if (isLoading.value) return t("auth.submitLoading");
  return t("auth.submitLogin");
});

const validateForm = (): string | null => {
  if (!email.value.trim()) return t("auth.validationEmailRequired");
  if (!password.value.trim()) return t("auth.validationPasswordRequired");
  if (password.value.trim().length < 6) return t("auth.validationPasswordMin");
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

  const result = await login(email.value.trim(), password.value.trim());

  isLoading.value = false;

  if (result.success) {
    successMessage.value = t("auth.successLogin");
    const redirectTarget =
      typeof route.query.redirect === "string" && route.query.redirect.startsWith("/")
        ? route.query.redirect
        : null;
    await router.push(redirectTarget ?? { name: "home" });
  } else {
    errorMessage.value = result.error || t("auth.defaultError");
  }
};

const handleSsoLogin = async () => {
  isSsoLoading.value = true;
  ssoError.value = null;
  try {
    await ssoLogin();
  } catch {
    ssoError.value = t("auth.ssoError");
    isSsoLoading.value = false;
  }
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
          <p class="card-desc">{{ t("auth.cardSubtitle") }}</p>
        </div>
        <LanguageSwitcher class="card-header__language" />
      </div>

      <!-- SSO Login Button -->
      <button
        type="button"
        class="sso-btn"
        :disabled="isSsoLoading"
        @click="handleSsoLogin"
      >
        <svg v-if="!isSsoLoading" class="sso-btn__icon" viewBox="0 0 20 20" fill="none">
          <path d="M10 2L13.5 6H17L14 9.5L15.5 14L10 11L4.5 14L6 9.5L3 6H6.5L10 2Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
        </svg>
        <span v-if="isSsoLoading" class="sso-btn__spinner"></span>
        {{ t("auth.submitSso") }}
      </button>

      <div v-if="ssoError" class="msg msg--error">{{ ssoError }}</div>

      <div class="divider">
        <span>{{ t("auth.orDivider") }}</span>
      </div>

      <form class="form" @submit.prevent="handleSubmit">
        <h2 class="form__title">{{ t("auth.modeLoginTitle") }}</h2>

        <div class="field">
          <label class="field__label" for="email">{{ t("auth.labelEmail") }}</label>
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
          <label class="field__label" for="password">{{ t("auth.labelPassword") }}</label>
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
              :placeholder="t('auth.placeholderPassword')"
              autocomplete="current-password"
              :disabled="isLoading"
            >
          </div>
        </div>

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
  margin-bottom: 28px;
}

.card-header__language {
  margin-left: auto;
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
  letterSpacing: -0.04em;
  line-height: 1.1;
}

.card-desc {
  margin: 3px 0 0;
  font-size: 13px;
  color: var(--text-muted);
  letter-spacing: 0.01em;
}

/* ─── SSO Button ──────────────────────────────── */
.sso-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  padding: 14px 24px;
  font-size: 15px;
  font-weight: 600;
  font-family: inherit;
  color: #fff;
  background: #2a9d8f;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  transition: background 0.2s ease, box-shadow 0.2s ease, transform 0.12s ease;
}

.sso-btn:hover:not(:disabled) {
  background: #238b7e;
  box-shadow: 0 6px 24px rgba(42, 157, 143, 0.28);
  transform: translateY(-1px);
}

.sso-btn:active:not(:disabled) {
  transform: translateY(0);
}

.sso-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.sso-btn__icon {
  width: 20px;
  height: 20px;
}

.sso-btn__spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

/* ─── Divider ─────────────────────────────────── */
.divider {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 20px 0;
  color: var(--text-subtle);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.divider::before,
.divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: rgba(0, 0, 0, 0.08);
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
