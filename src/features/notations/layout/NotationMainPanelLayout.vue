<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from "vue"

const props = withDefaults(defineProps<{
  propertiesHeight?: number
}>(), {
  propertiesHeight: 240
})

const emit = defineEmits<{
  (e: "update:propertiesHeight", value: number): void
}>()

const MIN_HEIGHT = 180
const MAX_HEIGHT = 520
const MIN_DIAGRAM_HEIGHT = 180
const RESIZER_HEIGHT = 10
let dragStartY = 0
let dragStartHeight = 240
let dragging = false
const centerRef = ref<HTMLElement | null>(null)
let centerResizeObserver: ResizeObserver | null = null

function getDynamicMaxHeight(): number {
  const centerHeight = centerRef.value?.clientHeight ?? 0
  if (centerHeight <= 0) return MAX_HEIGHT
  const byAvailableSpace = centerHeight - MIN_DIAGRAM_HEIGHT - RESIZER_HEIGHT
  return Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, byAvailableSpace))
}

function clampHeight(value: number): number {
  const dynamicMaxHeight = getDynamicMaxHeight()
  return Math.max(MIN_HEIGHT, Math.min(dynamicMaxHeight, value))
}

function enforceHeightBounds() {
  const current = props.propertiesHeight ?? 240
  const clamped = clampHeight(current)
  if (clamped !== current) {
    emit("update:propertiesHeight", clamped)
  }
}

function onMouseMove(event: MouseEvent) {
  if (!dragging) return
  const deltaY = event.clientY - dragStartY
  const nextHeight = clampHeight(dragStartHeight - deltaY)
  emit("update:propertiesHeight", nextHeight)
}

function stopDragging() {
  if (!dragging) return
  dragging = false
  window.removeEventListener("mousemove", onMouseMove)
  window.removeEventListener("mouseup", stopDragging)
}

function startDragging(event: MouseEvent) {
  dragging = true
  dragStartY = event.clientY
  dragStartHeight = clampHeight(props.propertiesHeight ?? 240)
  window.addEventListener("mousemove", onMouseMove)
  window.addEventListener("mouseup", stopDragging)
}

onMounted(() => {
  enforceHeightBounds()
  if (centerRef.value) {
    centerResizeObserver = new ResizeObserver(() => {
      enforceHeightBounds()
    })
    centerResizeObserver.observe(centerRef.value)
  }
})

watch(
  () => props.propertiesHeight,
  () => {
    enforceHeightBounds()
  }
)

onBeforeUnmount(() => {
  stopDragging()
  if (centerResizeObserver) {
    centerResizeObserver.disconnect()
    centerResizeObserver = null
  }
})
</script>

<template>
  <div class="notation-panel">
    <aside class="notation-panel__left">
      <slot name="left" />
    </aside>
    <section ref="centerRef" class="notation-panel__center">
      <div class="notation-panel__diagram">
        <slot />
      </div>
      <div
        class="notation-panel__resizer"
        role="separator"
        aria-orientation="horizontal"
        title="Потяните, чтобы изменить высоту панели свойств"
        @mousedown.prevent="startDragging"
      >
        <span class="notation-panel__resizer-handle"></span>
      </div>
      <div class="notation-panel__properties" :style="{ height: `${propertiesHeight}px` }">
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
  grid-template-columns: 280px 1fr 360px;
  overflow: hidden;
}

.notation-panel__left {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  border-right: 1px solid var(--border);
  background: var(--surface);
  position: relative;
  z-index: 1;
}

.notation-panel__center {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: visible;
  position: relative;
  z-index: 2;
}

.notation-panel__diagram {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.notation-panel__properties {
  border-top: 1px solid var(--border);
  flex-shrink: 0;
  overflow: visible;
  position: relative;
}

.notation-panel__resizer {
  height: 10px;
  margin-top: -5px;
  margin-bottom: -5px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: row-resize;
  z-index: 3;
  position: relative;
}

.notation-panel__resizer::before {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 1px;
  background: var(--border);
  transform: translateY(-50%);
}

.notation-panel__resizer-handle {
  width: 42px;
  height: 4px;
  border-radius: 999px;
  background: var(--text-subtle);
  opacity: 0.55;
  transition: opacity 0.15s ease, background 0.15s ease;
}

.notation-panel__resizer:hover .notation-panel__resizer-handle {
  opacity: 1;
  background: var(--primary);
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
