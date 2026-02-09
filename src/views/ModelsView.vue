<script setup lang="ts">

import ModelsViewLayout from "../layouts/ModelsViewLayout.vue";
import StubComponent from "../components/StubComponent.vue";
import AppHeader from "../components/layout/AppHeader.vue";
import ModelsCatalog from "../features/models/ModelsCatalog.vue";
</script>

<template>
<ModelsViewLayout>
  <template #header>
    <AppHeader />
  </template>
  <template #default>
    <ModelsCatalog />
  </template>
  <template #footer>
    <StubComponent />
  </template>
</ModelsViewLayout>
</template>

<style scoped>

</style>
