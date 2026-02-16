<script setup lang="ts">
import {useRouter} from "vue-router";
import {useAuth} from "../../composables/useAuth";
import AppLogo from "./AppLogo.vue";
import UserAvatar from "./UserAvatar.vue";
import NavigationMenu from "../menu/NavigationMenu.vue";

const router = useRouter();
const {currentUser, logout} = useAuth();

const handleLogout = () => {
  logout();
  router.push({name: "login"});
};
</script>

<template>
  <header class="app-header">
    <div class="app-header__left">
      <AppLogo size="md"/>
      <NavigationMenu/>
    </div>
    <div class="user-info">
      <UserAvatar :email="currentUser?.email" size="sm"/>
      <span class="user-email">{{ currentUser?.email }}</span>
      <button class="logout-button" type="button" @click="handleLogout">
        <span class="material-symbols-outlined">exit_to_app</span>
      </button>
    </div>
  </header>
</template>

<style scoped>
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  position: sticky;
  top: 0;
  z-index: 10;
}

.material-symbols-outlined {
  line-height: unset;
}

.app-header__left {
  display: flex;
  align-items: center;
  gap: 32px;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.user-email {
  font-size: 13px;
  color: var(--text-muted);
  letter-spacing: 0.01em;
}

.logout-button {
  padding: 6px 8px;
  font-size: large;
  font-weight: 100;
  color: var(--text-subtle);
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: color 0.2s ease, background 0.2s ease;
}

.logout-button:hover {
  color: var(--base-text);
  background: var(--surface-strong);
}
</style>
