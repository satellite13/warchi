<script setup lang="ts">
import AppHeader from "../components/layout/AppHeader.vue"
import DocsPage from "../features/docs/DocsPage.vue"
</script>

<template>
  <div class="docs-view">
    <header class="docs-view__header">
      <AppHeader />
    </header>
    <main class="docs-view__body">
      <DocsPage />
    </main>
  </div>
</template>

<style scoped>
.docs-view {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.docs-view__body {
  flex: 1;
  min-height: 0;
}
</style>
