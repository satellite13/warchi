<script setup lang="ts">
import {RouterLink} from "vue-router";
import { useAuth } from "../../composables/useAuth";

const { isAdmin } = useAuth();
</script>

<template>
  <nav class="app-nav">
    <RouterLink to="/" class="app-nav__link" active-class="app-nav__link--active">
      <span class="material-symbols-outlined" title="Главная">home</span>Главная
    </RouterLink>
    <RouterLink to="/models" class="app-nav__link" active-class="app-nav__link--active">
      <span class="material-symbols-outlined" title="Модели">schema</span>Модели
    </RouterLink>
    <RouterLink to="/notations" class="app-nav__link" active-class="app-nav__link--active">
      <span class="material-symbols-outlined" title="Нотации">graph_3</span>Нотации
    </RouterLink>
    <RouterLink to="/types" class="app-nav__link" active-class="app-nav__link--active">
      <span class="material-symbols-outlined" title="Типы">category</span>Типы
    </RouterLink>
    <RouterLink to="/docs" class="app-nav__link" active-class="app-nav__link--active">
      <span class="material-symbols-outlined" title="Документация">menu_book</span>Документация
    </RouterLink>
    <RouterLink to="/profile" class="app-nav__link" active-class="app-nav__link--active">
      <span class="material-symbols-outlined" title="Профиль">account_circle</span>Профиль
    </RouterLink>
    <RouterLink v-if="isAdmin" to="/admin/users" class="app-nav__link" active-class="app-nav__link--active">
      <span class="material-symbols-outlined" title="Администрирование">admin_panel_settings</span>Администрирование
    </RouterLink>
  </nav>
</template>

<style scoped>
.app-nav {
  display: flex;
  gap: 4px;
}

.app-nav__link {
  text-decoration: none;
  color: var(--text-muted);
  font-weight: 500;
  font-size: 14px;
  padding: 7px 14px;
  border-radius: var(--radius-sm);
  transition: color 0.2s ease, background 0.2s ease;
  display: flex;
  align-items: center;
  gap: 6px;
}

.app-nav__link .material-symbols-outlined {
  font-size: 20px;
}

.app-nav__link:hover {
  color: var(--base-text);
  background: var(--surface-strong);
}

.app-nav__link--active {
  color: var(--primary);
  background: var(--primary-soft);
}

.app-nav__link--active:hover {
  color: var(--primary);
  background: var(--primary-soft);
}
</style>
