<script setup lang="ts">

</script>

<template>
  <div class="notation-panel">
    <aside class="notation-panel__left">
      <slot name="left" />
    </aside>
    <section class="notation-panel__center">
      <div class="notation-panel__diagram">
        <slot />
      </div>
      <div class="notation-panel__properties">
        <slot name="bottom" />
      </div>
    </section>
    <aside class="notation-panel__right">
      <slot name="right" />
    </aside>
  </div>
</template>

<style scoped>
.notation-panel {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 280px 1fr 280px;
  overflow: hidden;
}

.notation-panel__left {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  border-right: 1px solid var(--border);
  background: var(--surface);
}

.notation-panel__center {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.notation-panel__diagram {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.notation-panel__properties {
  border-top: 1px solid var(--border);
  height: 240px;
  flex-shrink: 0;
  overflow: hidden;
}

.notation-panel__right {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  border-left: 1px solid var(--border);
  background: var(--surface);
}
</style>
