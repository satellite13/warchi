<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

type Placement = 'top' | 'bottom' | 'left' | 'right'

/**
 * Всплывающая подсказка с настраиваемой задержкой.
 *
 * Оборачивает любой элемент (кнопку, иконку) в slot:
 * <AppTooltip :text="t('types.openFullscreen')" placement="bottom">
 *   <button ...>...</button>
 * </AppTooltip>
 *
 * Заменяет нативный атрибут title: показ управляется приложением,
 * а не браузером/ОС, поэтому появляется заметно быстрее.
 *
 * Пузырь рендерится в body (Teleport) с position: fixed, поэтому
 * не подрезается overflow-контейнерами и не прячется за соседними
 * элементами, у которых свой stacking context (transform, opacity).
 * При нехватке места у края вьюпорта направление подбирается
 * автоматически (flip).
 */
const props = withDefaults(
  defineProps<{
    /** Текст подсказки. Пустая строка — подсказка не показывается. */
    text?: string
    /** Задержка до показа, мс. */
    showDelay?: number
    /** Задержка до скрытия, мс (щелчок от входа курсора обратно). */
    hideDelay?: number
    /** Базовое расположение подсказки. */
    placement?: Placement
  }>(),
  {
    text: '',
    showDelay: 150,
    hideDelay: 100,
    placement: 'bottom',
  },
)

const GAP = 8
const VIEWPORT_MARGIN = 4

const wrapperEl = ref<HTMLElement | null>(null)
const bubbleEl = ref<HTMLElement | null>(null)
const visible = ref(false)
const ready = ref(false)
const resolvedPlacement = ref<Placement>(props.placement)
const position = ref({ top: 0, left: 0, transform: 'translateX(-50%)' })

let showTimer: number | undefined
let hideTimer: number | undefined
let pendingFrame = 0

function clearTimers() {
  window.clearTimeout(showTimer)
  window.clearTimeout(hideTimer)
  showTimer = undefined
  hideTimer = undefined
}

function computePosition() {
  const el = wrapperEl.value
  const bubble = bubbleEl.value
  if (!el || !bubble) return
  const rect = el.getBoundingClientRect()
  const b = bubble.getBoundingClientRect()
  let placement = props.placement
  if (placement === 'top' && rect.top - GAP - b.height < VIEWPORT_MARGIN) placement = 'bottom'
  else if (
    placement === 'bottom' &&
    rect.bottom + GAP + b.height > window.innerHeight - VIEWPORT_MARGIN
  )
    placement = 'top'
  if (placement === 'left' && rect.left - GAP - b.width < VIEWPORT_MARGIN) placement = 'right'
  else if (
    placement === 'right' &&
    rect.right + GAP + b.width > window.innerWidth - VIEWPORT_MARGIN
  )
    placement = 'left'
  resolvedPlacement.value = placement
  let top: number
  let left: number
  let transform: string
  if (placement === 'top') {
    top = rect.top - GAP
    left = rect.left + rect.width / 2
    transform = 'translate(-50%, -100%)'
  } else if (placement === 'bottom') {
    top = rect.bottom + GAP
    left = rect.left + rect.width / 2
    transform = 'translateX(-50%)'
  } else if (placement === 'left') {
    top = rect.top + rect.height / 2
    left = rect.left - GAP
    transform = 'translate(-100%, -50%)'
  } else {
    top = rect.top + rect.height / 2
    left = rect.right + GAP
    transform = 'translateY(-50%)'
  }
  position.value = { top, left, transform }
  ready.value = true
}

function detachListeners() {
  window.removeEventListener('scroll', scheduleReposition, true)
  window.removeEventListener('resize', scheduleReposition)
}

function scheduleReposition() {
  if (pendingFrame || !visible.value) return
  pendingFrame = requestAnimationFrame(() => {
    pendingFrame = 0
    if (visible.value) computePosition()
  })
}

function show() {
  visible.value = true
  void nextTick(() => {
    if (bubbleEl.value) {
      computePosition()
      return
    }
    void nextTick(computePosition)
  })
  window.addEventListener('scroll', scheduleReposition, true)
  window.addEventListener('resize', scheduleReposition)
}

function hide() {
  visible.value = false
  ready.value = false
  detachListeners()
}

function scheduleShow() {
  clearTimers()
  if (visible.value) return
  showTimer = window.setTimeout(() => {
    showTimer = undefined
    show()
  }, props.showDelay)
}

function scheduleHide() {
  clearTimers()
  if (!visible.value) return
  hideTimer = window.setTimeout(() => {
    hideTimer = undefined
    hide()
  }, props.hideDelay)
}

function onFocusin() {
  clearTimers()
  if (!visible.value) show()
}

function onFocusout() {
  clearTimers()
  if (visible.value) hide()
}

watch(
  () => props.text,
  () => {
    if (!props.text) hide()
  },
)

onBeforeUnmount(() => {
  clearTimers()
  detachListeners()
  if (pendingFrame) cancelAnimationFrame(pendingFrame)
})
</script>

<template>
  <span
    ref="wrapperEl"
    class="app-tooltip"
    @mouseenter="scheduleShow"
    @mouseleave="scheduleHide"
    @focusin="onFocusin"
    @focusout="onFocusout"
  >
    <slot />
    <Teleport to="body">
      <span
        v-if="props.text && visible"
        ref="bubbleEl"
        role="tooltip"
        :class="['app-tooltip__bubble', `app-tooltip__bubble--${resolvedPlacement}`]"
        :style="{
          top: `${position.top}px`,
          left: `${position.left}px`,
          transform: position.transform,
          opacity: ready ? undefined : 0,
        }"
      >
        {{ props.text }}
      </span>
    </Teleport>
  </span>
</template>

<style scoped>
.app-tooltip {
  display: inline-flex;
  align-items: center;
}

.app-tooltip__bubble {
  position: fixed;
  z-index: 3000;
  max-width: 280px;
  padding: 5px 9px;
  border-radius: var(--radius-xs);
  border: 1px solid var(--border);
  background: var(--surface);
  box-shadow: var(--shadow-md);
  color: var(--base-text);
  font-size: 12px;
  line-height: 1.35;
  pointer-events: none;
  white-space: nowrap;
  animation: app-tooltip-in 0.14s ease;
}

@keyframes app-tooltip-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style>
