<script setup lang="ts">

import MainLayout from "../layouts/MainLayout.vue";
import AppHeader from "../components/layout/AppHeader.vue";
import ModelsCatalog from "../features/models/ModelsCatalog.vue";
</script>

<template>
  <MainLayout>
    <template #header>
      <AppHeader/>
    </template>
    <template #default>
      <ModelsCatalog/>
    </template>
  </MainLayout>
</template>

<style scoped>

</style>
