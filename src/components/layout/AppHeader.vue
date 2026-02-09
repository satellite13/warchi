<script setup lang="ts">
import {useRouter} from "vue-router";
import {useAuth} from "../../composables/useAuth";
import AppLogo from "../AppLogo.vue";
import UserAvatar from "../UserAvatar.vue";
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
  padding: 10px 10px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  position: sticky;
  top: 0;
  z-index: 10;
  box-shadow: var(--shadow-sm);
}

.material-symbols-outlined {
  line-height: unset;
}

.app-header__left {
  display: flex;
  align-items: center;
  gap: 24px;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.user-email {
  font-size: 12px;
  color: var(--text-muted);
}

.logout-button {
  padding: 4px 8px;
  font-size: large;
  font-weight: 100;
  color: var(--text-muted);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: color 0.2s ease;
}

.logout-button:hover {
  color: var(--primary-hover);
}
</style>
