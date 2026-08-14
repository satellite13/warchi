<script setup lang="ts">
import LazyIconImg from '@/components/forms/LazyIconImg.vue'
import UiIcon from '@/components/ui/UiIcon.vue'

withDefaults(
  defineProps<{
    title: string
    subtitle?: string
    icon?: string
    iconId?: string
    active?: boolean
    checked?: boolean
    locked?: boolean
    lockTitle?: string
    showCheckbox?: boolean
    checkboxDisabled?: boolean
    tone?: 'primary' | 'accent'
    badge?: string
    isNew?: boolean
    newLabel?: string
    animationIndex?: number
    as?: 'li' | 'div'
  }>(),
  {
    subtitle: '',
    icon: '',
    iconId: '',
    active: false,
    checked: false,
    locked: false,
    lockTitle: '',
    showCheckbox: false,
    checkboxDisabled: false,
    tone: 'primary',
    badge: '',
    isNew: false,
    newLabel: '',
    animationIndex: 0,
    as: 'li',
  },
)

const emit = defineEmits<{
  click: []
}>()
</script>

<template>
  <component
    :is="as"
    class="sli"
    :class="{
      'sli--active': active,
      'sli--checked': checked,
      'sli--accent': tone === 'accent',
    }"
    :style="{ animationDelay: `${animationIndex * 30}ms` }"
    role="button"
    tabindex="0"
    @click="emit('click')"
    @keydown.enter.prevent="emit('click')"
    @keydown.space.prevent="emit('click')"
  >
    <input
      v-if="showCheckbox"
      type="checkbox"
      class="sli__checkbox"
      :checked="checked"
      :disabled="checkboxDisabled"
      tabindex="-1"
      @click.stop="emit('click')"
    >
    <slot name="icon">
      <LazyIconImg
        v-if="iconId"
        :icon-id="iconId"
        :alt="title"
        img-class="sli__icon sli__icon--svg"
        eager
      />
      <UiIcon v-else-if="icon" :name="icon" class="sli__icon" />
    </slot>
    <div class="sli__info">
      <span class="sli__title">{{ title }}</span>
      <span v-if="subtitle" class="sli__subtitle">{{ subtitle }}</span>
      <span v-else-if="badge" class="sli__subtitle">{{ badge }}</span>
    </div>
    <span v-if="isNew" class="sli__new">{{ newLabel }}</span>
    <span v-if="locked" class="sli__lock" :title="lockTitle">
      <UiIcon name="lock" />
    </span>
    <div v-if="$slots.trailing" class="sli__trailing" @click.stop>
      <slot name="trailing" />
    </div>
  </component>
</template>

<style scoped>
.sli {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 9px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition:
    background 0.15s ease,
    border-left-color 0.15s ease;
  border-left: 3px solid transparent;
  box-sizing: border-box;
  animation: sliFadeIn 0.25s ease both;
}

.sli:hover {
  background: var(--surface-strong);
}

.sli:not(.sli--active):hover {
  border-left-color: rgba(124, 92, 252, 0.3);
}

.sli--active,
.sli--checked {
  background: var(--primary-soft);
  border-left-color: var(--primary);
}

.sli--active:hover,
.sli--checked:hover {
  background: var(--primary-soft);
}

.sli--accent.sli--active,
.sli--accent.sli--checked {
  background: color-mix(in srgb, var(--accent) 16%, var(--surface));
  border-left-color: var(--accent);
}

.sli--accent.sli--active:hover,
.sli--accent.sli--checked:hover {
  background: color-mix(in srgb, var(--accent) 16%, var(--surface));
}

.sli--accent:not(.sli--active):hover {
  border-left-color: color-mix(in srgb, var(--accent) 65%, transparent);
}

.sli:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: -2px;
}

@keyframes sliFadeIn {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.sli__icon {
  width: 20px;
  height: 20px;
  color: var(--text-subtle);
  flex-shrink: 0;
}

.sli__icon--svg {
  object-fit: contain;
}

.sli--active .sli__icon {
  color: var(--primary);
}

.sli--accent .sli__icon {
  color: var(--accent);
}

.sli--accent.sli--active .sli__icon {
  color: var(--accent);
}

.sli__info {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  flex: 1;
}

.sli__title {
  font-size: 13px;
  font-weight: 500;
  color: var(--base-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sli__subtitle {
  font-size: 11px;
  color: var(--text-subtle);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sli__new {
  font-size: 10px;
  font-weight: 600;
  color: var(--accent);
  background: var(--accent-soft);
  padding: 2px 7px;
  border-radius: 4px;
  text-transform: uppercase;
  flex-shrink: 0;
  letter-spacing: 0.02em;
}

.sli__lock {
  color: var(--text-subtle);
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.sli__lock .ui-icon {
  width: 16px;
  height: 16px;
}

.sli__checkbox {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  accent-color: var(--primary);
  cursor: pointer;
  margin: 0;
}

.sli__checkbox:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.sli__trailing {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}
</style>
