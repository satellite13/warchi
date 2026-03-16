<script setup lang="ts">
defineProps<{
  count?: number;
}>();
</script>

<template>
  <div v-for="n in (count || 1)" :key="'skeleton-' + n" class="card-skeleton">
    <div class="skeleton-gradient" />
    <div class="skeleton-content">
      <div class="skeleton-line skeleton-line--title" />
      <div class="skeleton-line skeleton-line--short" />
      <div class="skeleton-line skeleton-line--short" />
    </div>
  </div>
</template>

<style scoped>
.card-skeleton {
  display: flex;
  flex-direction: column;
  width: 320px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--surface);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}

.skeleton-gradient {
  height: 82px;
  margin: -1px -1px 0;
  background: linear-gradient(90deg, var(--surface-muted) 25%, var(--surface-strong) 50%, var(--surface-muted) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}

.skeleton-content {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.skeleton-line {
  height: 14px;
  background: linear-gradient(90deg, var(--surface-muted) 25%, var(--surface-strong) 50%, var(--surface-muted) 75%);
  background-size: 200% 100%;
  border-radius: 6px;
  animation: shimmer 1.5s infinite;
}

.skeleton-line--title {
  width: 70%;
  height: 18px;
}

.skeleton-line--short {
  width: 50%;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
</style>
