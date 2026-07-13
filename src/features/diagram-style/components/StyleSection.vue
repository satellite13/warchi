<script setup lang="ts">
defineProps<{
  title: string;
  open: boolean;
  pill?: string | null;
}>();

const emit = defineEmits<{
  (e: "toggle"): void;
}>();
</script>

<template>
  <section class="sp-section">
    <button type="button" class="sp-section__toggle" @click="emit('toggle')">
      <UiIcon name="chevron_right" class="sp-section__arrow" :class="{ 'sp-section__arrow--closed': !open }" />
      <span class="sp-section__name">{{ title }}</span>
      <span v-if="pill" class="sp-section__pill">{{ pill }}</span>
    </button>
    <Transition name="sp-expand">
      <div v-if="open" class="sp-section__content">
        <slot />
      </div>
    </Transition>
  </section>
</template>

<style scoped>
.sp-section {
  border-bottom: 1px solid var(--border);
}

.sp-section__toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 32px;
  padding: 0 6px;
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.sp-section__toggle:hover {
  background: var(--surface-muted);
}

.sp-section__arrow {
  width: 16px;
  height: 16px;
  color: var(--text-subtle);
  transform: rotate(90deg);
  transition: transform 0.15s ease;
}

.sp-section__arrow--closed {
  transform: rotate(0deg);
}

.sp-section__name {
  font-size: 11px;
  font-weight: 600;
  color: var(--base-text);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.sp-section__pill {
  margin-left: auto;
  font-size: 10px;
  color: var(--text-subtle);
  background: var(--surface-muted);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 1px 6px;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sp-section__content {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0 6px 8px 6px;
}

.sp-expand-enter-active,
.sp-expand-leave-active {
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}

.sp-expand-enter-from,
.sp-expand-leave-to {
  opacity: 0;
  max-height: 0;
  transform: translateY(-4px);
}

.sp-expand-enter-to,
.sp-expand-leave-from {
  opacity: 1;
  max-height: 600px;
  transform: translateY(0);
}
</style>
