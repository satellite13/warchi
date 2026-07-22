<script setup lang="ts">
import MainLayout from '../layouts/MainLayout.vue'
import AppHeader from '../components/layout/AppHeader.vue'
import AppFooter from '../components/layout/AppFooter.vue'
import ShapeEditorPage from '../features/shapes/ShapeEditorPage.vue'
</script>

<template>
  <MainLayout>
    <template #header>
      <AppHeader />
    </template>
    <ShapeEditorPage />
    <template #footer>
      <AppFooter />
    </template>
  </MainLayout>
</template>
