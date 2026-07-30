<script setup lang="ts">
import MainLayout from '../layouts/MainLayout.vue'
import AppHeader from '../components/layout/AppHeader.vue'
import AppFooter from '../components/layout/AppFooter.vue'
import ValidationScriptEditorPage from '../features/validation-scripts/ValidationScriptEditorPage.vue'
</script>

<template>
  <MainLayout>
    <template #header>
      <AppHeader />
    </template>
    <ValidationScriptEditorPage />
    <template #footer>
      <AppFooter />
    </template>
  </MainLayout>
</template>
