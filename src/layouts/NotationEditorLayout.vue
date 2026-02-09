<script setup lang="ts">

</script>

<template>
  <div class="notation-editor-layout">
    <header class="notation-editor-layout__header">
      <slot name="header" />
    </header>
    <main class="notation-editor-layout__body">
      <slot />
    </main>
    <footer class="notation-editor-layout__footer">
      <slot name="footer" />
    </footer>
  </div>
</template>

<style scoped>
.notation-editor-layout {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  align-content: stretch;
  justify-content: flex-start;
  height: 100vh;
}
.notation-editor-layout__header {
}
.notation-editor-layout__body {
  flex-grow: 1;
}
.notation-editor-layout__footer {
}
</style>
