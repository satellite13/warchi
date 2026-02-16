<script setup lang="ts">

</script>

<template>
  <div class="main-layout">
    <header class="main-layout__header">
      <slot name="header" />
    </header>
    <main class="main-layout__body">
      <slot />
    </main>
    <footer class="main-layout__footer">
      <slot name="footer" />
    </footer>
  </div>
</template>

<style scoped>
.main-layout {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  align-content: stretch;
  justify-content: flex-start;
  height: 100vh;
}
.main-layout__header {
}
.main-layout__body {
  flex-grow: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.main-layout__footer {
}
</style>
