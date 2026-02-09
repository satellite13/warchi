<script setup lang="ts">
import StubComponent from "../components/StubComponent.vue";
import AppHeader from "../components/layout/AppHeader.vue";
import MainLayout from "../layouts/MainLayout.vue";
</script>

<template>
  <MainLayout>
    <template #header>
      <AppHeader />
    </template>
    <template #default>
      <StubComponent />
    </template>
    <template #footer>
      <StubComponent />
    </template>
  </MainLayout>
</template>

<style scoped>

</style>
