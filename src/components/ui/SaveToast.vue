<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import UiIcon from '@/components/ui/UiIcon.vue'

const props = withDefaults(
  defineProps<{
    saving?: boolean
    success?: boolean
    error?: string | null
    progress?: string | null
  }>(),
  {
    saving: false,
    success: false,
    error: null,
    progress: null,
  },
)

const { t } = useI18n()

const mode = computed<'progress' | 'success' | 'error' | null>(() => {
  if (props.saving) return 'progress'
  if (props.success) return 'success'
  if (props.error) return 'error'
  return null
})

const message = computed(() => {
  if (mode.value === 'progress') return props.progress || t('common.saving')
  if (mode.value === 'success') return t('common.saved')
  if (mode.value === 'error') return props.error ?? ''
  return ''
})

const iconName = computed(() => {
  if (mode.value === 'progress') return 'sync'
  if (mode.value === 'success') return 'check_circle'
  return 'error'
})
</script>

<template>
  <Teleport to="body">
    <Transition name="toast">
      <div
        v-if="mode"
        :key="mode"
        class="save-toast"
        :class="`save-toast--${mode}`"
      >
        <UiIcon
          :name="iconName"
          class="save-toast__icon"
          :class="{ spin: mode === 'progress' }"
        />
        <span>{{ message }}</span>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.save-toast {
  position: fixed;
  bottom: 48px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: var(--radius-sm);
  font-size: 14px;
  font-weight: 500;
  z-index: 2100;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  pointer-events: none;
}

.save-toast--progress {
  background: var(--surface);
  color: var(--text-muted);
  border: 1px solid var(--border);
}

.save-toast--success {
  background: var(--accent-soft);
  color: var(--accent);
  border: 1px solid rgba(43, 184, 150, 0.2);
}

.save-toast--error {
  background: var(--danger-soft);
  color: var(--danger);
  border: 1px solid var(--danger-soft);
}

.save-toast__icon {
  width: 20px;
  height: 20px;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(-360deg);
  }
}

.toast-enter-active,
.toast-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(8px);
}
</style>
