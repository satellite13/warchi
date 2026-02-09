<script setup lang="ts">
import StubComponent from "../components/StubComponent.vue";
import AppHeader from "../components/layout/AppHeader.vue";
import NotationsViewLayout from "../layouts/NotationsViewLayout.vue";
import NotationsCatalog from "../features/notations/NotationsCatalog.vue";
</script>

<template>
  <NotationsViewLayout>
    <template #header>
      <AppHeader/>
    </template>
    <template #default>
      <NotationsCatalog/>
    </template>
    <template #footer>
      <StubComponent/>
    </template>
  </NotationsViewLayout>

</template>

<style scoped>

</style>
