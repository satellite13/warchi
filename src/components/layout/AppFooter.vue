<script setup lang="ts">

</script>

<template>
  <footer class="app-footer">
    <div class="app-footer__left">
      2026 - Nikolay Groznykh
    </div>
    <div class="app-footer__center">
    </div>
    <div class="app-footer__right">
      Version: 0.0.12
    </div>
  </footer>

</template>

<style scoped>
.app-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 20px;
  border-top: 1px solid var(--border);
  background: var(--surface);
  font-size: var(--small-font-size);
  color: var(--text-subtle);
  letter-spacing: 0.02em;
}

.app-footer__left {
  display: flex;
  align-items: center;
}
.app-footer__center {
  display: flex;
  align-items: center;
}
.app-footer__right {
  display: flex;
  align-items: center;
  font-variant-numeric: tabular-nums;
}

</style>
