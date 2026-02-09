<script setup lang="ts">
import {RouterLink} from "vue-router";
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
  </nav>
</template>

<style scoped>
.app-nav {
  display: flex;
  gap: 16px;
}

.app-nav__link {
  text-decoration: none;
  color: var(--text-muted);
  font-weight: 500;
  font-size: 14px;
  padding: 8px 4px;
  border-bottom: 2px solid transparent;
  transition: color 0.2s ease, border-color 0.2s ease;
  display: flex;
  align-items: center;
  gap: 4px;
}

.app-nav__link:hover {
  color: var(--primary);
}

.app-nav__link--active {
  color: var(--primary);
  border-color: var(--primary);
}

</style>
