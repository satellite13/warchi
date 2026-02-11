<script setup lang="ts">
import AppHeader from "../components/layout/AppHeader.vue";
import MainLayout from "../layouts/MainLayout.vue";
import NotationEditor from "../features/notations/NotationEditor.vue";
import AppFooter from "../components/layout/AppFooter.vue";
</script>

<template>
  <MainLayout>
    <template #header>
      <AppHeader />
    </template>
    <template #default>
      <NotationEditor />
    </template>
    <template #footer>
      <AppFooter />
    </template>
  </MainLayout>
</template>

<style scoped>

</style>
