<script setup lang="ts">
defineProps<{
  title: string
  subtitle?: string
}>()
</script>

<template>
  <div class="admin-page-header">
    <div class="admin-page-header__titles">
      <h1 class="admin-page-header__heading">{{ title }}</h1>
      <p v-if="subtitle" class="admin-page-header__sub">{{ subtitle }}</p>
    </div>
    <div v-if="$slots.toolbar || $slots.badge" class="admin-page-header__toolbar">
      <slot name="badge" />
      <slot name="toolbar" />
    </div>
  </div>
</template>

<style scoped>
.admin-page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.admin-page-header__titles {
  min-width: 0;
}

.admin-page-header__heading {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  color: var(--base-text);
  letter-spacing: -0.02em;
}

.admin-page-header__sub {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--text-muted);
  line-height: 1.45;
}

.admin-page-header__toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
</style>
