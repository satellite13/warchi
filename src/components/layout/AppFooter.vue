<script setup lang="ts">

</script>

<template>
  <header class="app-footer">
    <div class="app-footer__left">
      2026 - Nikolay Groznykh
    </div>
    <div class="app-footer__center">
    </div>
    <div class="app-footer__right">
      Version: 0.0.1
    </div>
  </header>

</template>

<style scoped>
.app-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 10px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  font-size: var(--small-font-size);
  color: var(--text-subtle);
}

.app-footer__left {
  display: flex;
  align-items: center;
  gap: 24px;
}
.app-footer__center {
  display: flex;
  align-items: center;
  gap: 24px;
}
.app-footer__right {
  display: flex;
  align-items: center;
  gap: 24px;
}

</style>
