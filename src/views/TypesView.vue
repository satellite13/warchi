<script setup lang="ts">
import MainLayout from '../layouts/MainLayout.vue'
import AppHeader from '../components/layout/AppHeader.vue'
import AppFooter from '../components/layout/AppFooter.vue'
import TypeEditorPage from '../features/types/TypeEditorPage.vue'
</script>

<template>
  <MainLayout>
    <template #header>
      <AppHeader />
    </template>
    <TypeEditorPage />
    <template #footer>
      <AppFooter />
    </template>
  </MainLayout>
</template>
