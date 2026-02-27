<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

defineProps<{
  title: string;
  maxWidth?: string;
}>();

const emit = defineEmits<{
  close: [];
}>();

const footerRef = ref<HTMLElement | null>(null)

let buttons: HTMLElement[] = []
let focusedIndex = 0

const getButtons = (): HTMLElement[] => {
  const footer = footerRef.value
  if (!footer) return []
  return Array.from(footer.querySelectorAll('.btn, button[type="button"], button[type="submit"]')).filter((el): el is HTMLButtonElement => {
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
  buttons = getButtons()
  if (buttons.length === 0) return

  // Don't handle navigation if user is typing in an input
  const activeElement = document.activeElement
  const isTextInput =
    activeElement instanceof HTMLInputElement ||
    activeElement instanceof HTMLTextAreaElement ||
    activeElement instanceof HTMLSelectElement

  switch (event.key) {
    case 'ArrowRight': {
      if (isTextInput) return
      event.preventDefault()
      const nextIndex = (focusedIndex + 1) % buttons.length
      focusButton(nextIndex)
      break
    }

    case 'ArrowLeft': {
      if (isTextInput) return
      event.preventDefault()
      const prevIndex = focusedIndex <= 0 ? buttons.length - 1 : focusedIndex - 1
      focusButton(prevIndex)
      break
    }

    case 'Enter': {
      // If a button is focused, click it
      if (activeElement && buttons.includes(activeElement as HTMLElement)) {
        event.preventDefault()
        ;(activeElement as HTMLElement).click()
      }
      break
    }

    case 'Escape': {
      // For text inputs with content, require Shift+Escape to close
      if (isTextInput) {
        const input = activeElement as HTMLInputElement | HTMLTextAreaElement
        if (input.value.length > 0 && !event.shiftKey) {
          return
        }
      }
      event.preventDefault()
      emit('close')
      break
    }
  }
}

const handleOverlayClick = () => {
  emit("close");
};

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
  
  // Focus first button after modal opens
  setTimeout(() => {
    buttons = getButtons()
    if (buttons.length > 0) {
      // Try to find primary/submit button, otherwise last button
      const submitBtn = buttons.find(btn => (btn as HTMLButtonElement).type === 'submit')
      const primaryBtn = buttons.find(btn => (btn as HTMLButtonElement).classList.contains('btn--primary'))
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
      <div class="modal" :style="{ maxWidth: maxWidth || '440px' }">
        <div class="modal-header">
          <h2>{{ title }}</h2>
          <button class="modal-close" type="button" @click="emit('close')">
            <span class="material-symbols-outlined">cancel</span>
          </button>
        </div>
        <div class="modal-body">
          <slot/>
        </div>
        <div v-if="$slots.footer" ref="footerRef" class="modal-footer">
          <slot name="footer"/>
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
  animation: fadeIn 0.15s ease;
}

.modal {
  width: 100%;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-md);
  overflow: visible;
  margin: 16px;
  animation: slideUp 0.2s ease;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border);
  border-radius: var(--radius) var(--radius) 0 0;
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
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid var(--border);
  border-radius: 0 0 var(--radius) var(--radius);
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
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
