<script setup lang="ts">
import UiIcon from '@/components/ui/UiIcon.vue'

withDefaults(
  defineProps<{
    title: string
    open: boolean
    variant?: 'panel' | 'style' | 'aside'
    pill?: string | null
  }>(),
  {
    variant: 'panel',
    pill: null,
  },
)

const emit = defineEmits<{
  toggle: []
}>()
</script>

<template>
  <component
    :is="variant === 'style' ? 'section' : 'div'"
    class="cs"
    :class="`cs--${variant}`"
  >
    <button
      v-if="variant === 'style'"
      type="button"
      class="cs__toggle"
      @click="emit('toggle')"
    >
      <UiIcon
        name="chevron_right"
        class="cs__chevron"
        :class="{ 'cs__chevron--closed': !open }"
      />
      <span class="cs__title">{{ title }}</span>
      <span v-if="pill" class="cs__pill">{{ pill }}</span>
    </button>

    <div
      v-else
      class="cs__toggle"
      role="button"
      tabindex="0"
      @click="emit('toggle')"
      @keydown.enter.prevent="emit('toggle')"
      @keydown.space.prevent="emit('toggle')"
    >
      <UiIcon
        name="expand_more"
        class="cs__chevron"
        :class="{ 'cs__chevron--closed': !open }"
      />
      <slot name="header-leading" />
      <span class="cs__title">{{ title }}</span>
      <slot name="header-extra" />
    </div>

    <template v-if="variant === 'style'">
      <Transition name="cs-expand">
        <div v-if="open" class="cs__body">
          <slot />
        </div>
      </Transition>
    </template>
    <template v-else>
      <div v-if="open" class="cs__body">
        <slot />
      </div>
    </template>
  </component>
</template>

<style scoped>
.cs--panel {
  padding: 10px 12px 8px;
  border-bottom: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cs--panel .cs__toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  user-select: none;
  cursor: pointer;
}

.cs--panel .cs__chevron {
  width: 18px;
  height: 18px;
  color: var(--text-subtle);
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

.cs--panel .cs__chevron--closed {
  transform: rotate(-90deg);
}

.cs--panel .cs__title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-subtle);
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.cs--panel .cs__body {
  display: contents;
}

.cs--style {
  border-bottom: 1px solid var(--border);
}

.cs--style .cs__toggle {
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
  font-family: inherit;
}

.cs--style .cs__toggle:hover {
  background: var(--surface-muted);
}

.cs--style .cs__chevron {
  width: 16px;
  height: 16px;
  color: var(--text-subtle);
  transform: rotate(90deg);
  transition: transform 0.15s ease;
}

.cs--style .cs__chevron--closed {
  transform: rotate(0deg);
}

.cs--style .cs__title {
  font-size: 11px;
  font-weight: 600;
  color: var(--base-text);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.cs--style .cs__pill {
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

.cs--style .cs__body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0 6px 8px;
}

.cs-expand-enter-active,
.cs-expand-leave-active {
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}

.cs-expand-enter-from,
.cs-expand-leave-to {
  opacity: 0;
  max-height: 0;
  transform: translateY(-4px);
}

.cs-expand-enter-to,
.cs-expand-leave-from {
  opacity: 1;
  max-height: 600px;
  transform: translateY(0);
}

.cs--aside {
  background: var(--surface);
  border-radius: 12px;
  padding: 14px 16px;
  box-shadow: var(--shadow-sm);
  border: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cs--aside .cs__toggle {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
  padding: 2px 0;
  border-radius: 6px;
  transition: color 0.15s ease;
}

.cs--aside .cs__toggle:hover {
  color: var(--base-text);
}

.cs--aside .cs__chevron {
  width: 18px;
  height: 18px;
  color: inherit;
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

.cs--aside .cs__chevron--closed {
  transform: rotate(-90deg);
}

.cs--aside .cs__title {
  font-size: inherit;
  font-weight: inherit;
  color: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
}
</style>
