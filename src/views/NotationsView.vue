<script setup lang="ts">
import StubComponent from "../components/layout/StubComponent.vue";
import AppHeader from "../components/layout/AppHeader.vue";
import NotationsViewLayout from "../layouts/NotationsViewLayout.vue";
import NotationsCatalog from "../features/notations/NotationsCatalog.vue";
import AppFooter from "../components/layout/AppFooter.vue";
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
      <AppFooter />
    </template>
  </NotationsViewLayout>

</template>

<style scoped>

</style>
