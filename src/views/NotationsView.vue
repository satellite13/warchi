<script setup lang="ts">
import AppHeader from "../components/layout/AppHeader.vue";
import MainLayout from "../layouts/MainLayout.vue";
import NotationsCatalog from "../features/notations/NotationsCatalog.vue";
</script>

<template>
  <MainLayout>
    <template #header>
      <AppHeader/>
    </template>
    <template #default>
      <NotationsCatalog/>
    </template>
  </MainLayout>

</template>

<style scoped>

</style>
