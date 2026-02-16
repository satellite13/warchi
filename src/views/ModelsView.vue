<script setup lang="ts">

import ModelsViewLayout from "../layouts/ModelsViewLayout.vue";
import AppHeader from "../components/layout/AppHeader.vue";
import ModelsCatalog from "../features/models/ModelsCatalog.vue";
import AppFooter from "../components/layout/AppFooter.vue";
</script>

<template>
  <ModelsViewLayout>
    <template #header>
      <AppHeader/>
    </template>
    <template #default>
      <ModelsCatalog/>
    </template>
    <template #footer>
      <AppFooter/>
    </template>
  </ModelsViewLayout>
</template>

<style scoped>

</style>
