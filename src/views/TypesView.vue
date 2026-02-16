<script setup lang="ts">
import AppHeader from "../components/layout/AppHeader.vue"
import AppFooter from "../components/layout/AppFooter.vue"
import TypeEditorPage from "../features/types/TypeEditorPage.vue"
</script>

<template>
  <div class="types-view">
    <header class="types-view__header">
      <AppHeader/>
    </header>
    <main class="types-view__body">
      <TypeEditorPage/>
    </main>
    <footer class="types-view__footer">
      <AppFooter/>
    </footer>
  </div>
</template>

<style scoped>
.types-view {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.types-view__body {
  flex: 1;
  min-height: 0;
}
</style>
