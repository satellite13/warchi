<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'

const props = withDefaults(
  defineProps<{
    title: string
    maxWidth?: string
    /** Optional fixed/min height for the dialog panel (e.g. `85vh`). */
    height?: string
    /** When false, modal body has no default padding. Default true. */
    bodyPadding?: boolean
    /** Extra class on `.modal-body`. */
    bodyClass?: string
    /** Extra class on `.modal`. */
    panelClass?: string
    /** Hide the default title+close header (use `#header` slot instead). */
    hideHeader?: boolean
  }>(),
  {
    bodyPadding: true,
    hideHeader: false,
  }
)

const emit = defineEmits<{
  close: []
}>()

const footerRef = ref<HTMLElement | null>(null)

let buttons: HTMLElement[] = []
let focusedIndex = 0

const panelStyle = computed(() => {
  const style: Record<string, string> = {
    maxWidth: props.maxWidth || '440px',
  }
  if (props.height) {
    style.height = props.height
  }
  return style
})

const getButtons = (): HTMLElement[] => {
  const footer = footerRef.value
  if (!footer) return []
  return Array.from(
    footer.querySelectorAll('.btn, button[type="button"], button[type="submit"]')
  ).filter((el): el is HTMLButtonElement => {
    const btnEl = el as HTMLButtonElement
    return btnEl.offsetParent !== null && !btnEl.disabled
  })
}

const focusButton = (index: number) => {
  buttons = getButtons()
  if (buttons.length === 0) return
  focusedIndex = Math.max(0, Math.min(index, buttons.length - 1))
  buttons[focusedIndex]?.focus()
}

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
    return
  }

  buttons = getButtons()
  if (buttons.length === 0) return

  const activeElement = document.activeElement
  const isTextInput =
    activeElement instanceof HTMLInputElement ||
    activeElement instanceof HTMLTextAreaElement ||
    activeElement instanceof HTMLSelectElement

  switch (event.key) {
    case 'ArrowRight': {
      if (isTextInput) return
      event.preventDefault()
      focusButton((focusedIndex + 1) % buttons.length)
      break
    }
    case 'ArrowLeft': {
      if (isTextInput) return
      event.preventDefault()
      focusButton(focusedIndex <= 0 ? buttons.length - 1 : focusedIndex - 1)
      break
    }
    case 'Enter': {
      if (activeElement && buttons.includes(activeElement as HTMLElement)) {
        event.preventDefault()
        ;(activeElement as HTMLElement).click()
      }
      break
    }
  }
}

const handleOverlayClick = () => {
  emit('close')
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
  setTimeout(() => {
    buttons = getButtons()
    if (buttons.length > 0) {
      const submitBtn = buttons.find((btn) => (btn as HTMLButtonElement).type === 'submit')
      const primaryBtn = buttons.find((btn) =>
        (btn as HTMLButtonElement).classList.contains('btn--primary')
      )
      const defaultBtn = submitBtn || primaryBtn || buttons[buttons.length - 1]
      const index = defaultBtn ? buttons.indexOf(defaultBtn) : 0
      focusButton(index)
    }
  }, 50)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div class="modal-overlay" @click.self="handleOverlayClick">
      <div class="modal" :class="panelClass" :style="panelStyle">
        <div v-if="!hideHeader || $slots.header" class="modal-header" :class="{ 'modal-header--custom': !!$slots.header }">
          <slot name="header">
            <h2>{{ title }}</h2>
            <button class="modal-close" type="button" @click="emit('close')">
              <UiIcon name="close" />
            </button>
          </slot>
        </div>
        <div
          class="modal-body"
          :class="[bodyClass, { 'modal-body--flush': !bodyPadding }]"
        >
          <slot />
        </div>
        <div v-if="$slots.footer" ref="footerRef" class="modal-footer">
          <slot name="footer" />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
  overflow-y: auto;
  animation: fadeIn 0.15s ease;
}

.modal {
  width: 100%;
  max-height: calc(100vh - 32px);
  max-height: calc(100dvh - 32px);
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-md);
  overflow: hidden;
  margin: auto;
  animation: slideUp 0.2s ease;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border);
  border-radius: var(--radius) var(--radius) 0 0;
  flex-shrink: 0;
}

.modal-header--custom {
  padding: 0;
  border-bottom: none;
}

.modal-header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--base-text);
  letter-spacing: -0.02em;
}

.modal-close {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-subtle);
  background: transparent;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease;
}

.modal-close svg {
  width: 20px;
  height: 20px;
}

.modal-close:hover {
  background: var(--surface-strong);
  color: var(--text-muted);
}

.modal-body {
  padding: 24px;
  overflow-x: hidden;
  overflow-y: auto;
  flex: 1 1 auto;
  min-height: 0;
}

.modal-body--flush {
  padding: 0;
  display: flex;
  flex-direction: column;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid var(--border);
  border-radius: 0 0 var(--radius) var(--radius);
  flex-shrink: 0;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
