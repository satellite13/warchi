<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import { RouterView, useRoute, useRouter } from "vue-router";
import { AUTH_CLEARED_EVENT } from "./composables/authStorage";
import { useAuth } from "./composables/useAuth";

const router = useRouter();
const route = useRoute();
const { isAuthenticated, loadCurrentUser } = useAuth();

const handleAuthCleared = () => {
  if (route.name === "login") return;
  router.push({
    name: "login",
    query: { redirect: route.fullPath }
  });
};

onMounted(() => {
  if (isAuthenticated.value) {
    loadCurrentUser();
  }

  window.addEventListener(AUTH_CLEARED_EVENT, handleAuthCleared);
});

onUnmounted(() => {
  window.removeEventListener(AUTH_CLEARED_EVENT, handleAuthCleared);
});
</script>

<template>
  <RouterView/>
</template>

<style scoped>
</style>
