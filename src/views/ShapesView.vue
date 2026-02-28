<script setup lang="ts">
import AppHeader from "../components/layout/AppHeader.vue"
import AppFooter from "../components/layout/AppFooter.vue"
import ShapeEditorPage from "../features/shapes/ShapeEditorPage.vue"
</script>

<template>
  <div class="shapes-view">
    <header class="shapes-view__header">
      <AppHeader />
    </header>
    <main class="shapes-view__body">
      <ShapeEditorPage />
    </main>
    <footer class="shapes-view__footer">
      <AppFooter />
    </footer>
  </div>
</template>

<style scoped>
.shapes-view {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.shapes-view__body {
  flex: 1;
  min-height: 0;
}
</style>
