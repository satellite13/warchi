<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useOidcAuth } from "../composables/useOidcAuth";

const route = useRoute();
const router = useRouter();
const { processLinkCallback } = useOidcAuth();

const errorMessage = ref<string | null>(null);
const isLoading = ref(true);

onMounted(async () => {
  const code = route.query.code as string;
  const state = route.query.state as string;

  if (!code || !state) {
    errorMessage.value = "Missing code or state parameter";
    isLoading.value = false;
    return;
  }

  const success = await processLinkCallback(code, state);
  isLoading.value = false;

  if (success) {
    await router.replace({ name: "profile" });
  } else {
    errorMessage.value = "SSO linking failed";
  }
});
</script>

<template>
  <div class="callback-page">
    <div class="callback-card">
      <div v-if="isLoading" class="spinner"></div>
      <div v-else-if="errorMessage" class="error">
        <p>{{ errorMessage }}</p>
        <router-link to="/profile" class="back-link">Back to profile</router-link>
      </div>
    </div>
  </div>
</template>

<style scoped>
.callback-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: var(--base-bg);
}

.callback-card {
  text-align: center;
  padding: 32px;
  background: var(--surface);
  border-radius: var(--radius);
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--border);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error {
  color: var(--danger);
}

.back-link {
  display: inline-block;
  margin-top: 12px;
  color: var(--primary);
  text-decoration: none;
  font-weight: 600;
}

.back-link:hover {
  text-decoration: underline;
}
</style>
