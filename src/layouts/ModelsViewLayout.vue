<script setup lang="ts">

</script>

<template>
  <div class="models-view-layout">
    <header class="models-view-layout__header">
      <slot name="header" />
    </header>
    <main class="models-view-layout__body">
      <slot />
    </main>
    <footer class="models-view-layout__footer">
      <slot name="footer" />
    </footer>
  </div>
</template>

<style scoped>
.models-view-layout {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  align-content: stretch;
  justify-content: flex-start;
  height: 100vh;
}
.models-view-layout__header {
}
.models-view-layout__body {
  flex-grow: 1;
}
.models-view-layout__footer {
}
</style>
