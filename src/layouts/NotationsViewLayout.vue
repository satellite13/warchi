<script setup lang="ts">

</script>

<template>
  <div class="notations-view-layout-layout">
    <header class="notations-view-layout-layout__header">
      <slot name="header" />
    </header>
    <main class="notations-view-layout-layout__body">
      <slot />
    </main>
    <footer class="notations-view-layout-layout__footer">
      <slot name="footer" />
    </footer>
  </div>
</template>

<style scoped>
.notations-view-layout-layout {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  align-content: stretch;
  justify-content: flex-start;
  height: 100vh;
}
.notations-view-layout-layout__header {
}
.notations-view-layout-layout__body {
  flex-grow: 1;
}
.notations-view-layout-layout__footer {
}
</style>
