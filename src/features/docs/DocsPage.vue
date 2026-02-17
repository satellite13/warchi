<script setup lang="ts">
import DocsSidebar from "./components/DocsSidebar.vue"
import DocsContent from "./components/DocsContent.vue"
import { useDocsNavigation } from "./composables/useDocsNavigation"

const { currentSection, rawContent, isLoading } = useDocsNavigation()
</script>

<template>
  <div class="docs-page">
    <DocsSidebar :current-section="currentSection" />
    <DocsContent :content="rawContent" :is-loading="isLoading" />
  </div>
</template>

<style scoped>
.docs-page {
  display: flex;
  height: 100%;
  background: var(--base-bg);
}
</style>
