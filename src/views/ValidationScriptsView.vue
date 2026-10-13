<script setup lang="ts">
import MainLayout from '../layouts/MainLayout.vue'
import AppHeader from '../components/layout/AppHeader.vue'
import ValidationScriptEditorPage from '../features/validation-scripts/ValidationScriptEditorPage.vue'
</script>

<template>
  <MainLayout>
    <template #header>
      <AppHeader />
    </template>
    <ValidationScriptEditorPage />
  </MainLayout>
</template>
