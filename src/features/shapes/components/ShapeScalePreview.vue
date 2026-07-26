<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { OutlineSegment, ScaleSlice } from '@/domain/attrs/notationAttrs'
import { customOutlineToSvgPath } from '@/utils/customOutlinePath'

const props = withDefaults(
  defineProps<{
    outline: OutlineSegment[]
    scaleSlice?: ScaleSlice | null
    disabled?: boolean
    initialWidth?: number
    initialHeight?: number
  }>(),
  {
    scaleSlice: null,
    disabled: false,
    initialWidth: 180,
    initialHeight: 120,
  }
)

const { t } = useI18n()

const previewWidth = ref(props.initialWidth)
const previewHeight = ref(props.initialHeight)

watch(
  () => [props.initialWidth, props.initialHeight] as const,
  ([w, h]) => {
    previewWidth.value = w
    previewHeight.value = h
  }
)

const MIN_SIZE = 40
const MAX_SIZE = 480

const svgPath = computed(() =>
  customOutlineToSvgPath(
    props.outline,
    previewWidth.value,
    previewHeight.value,
    props.scaleSlice
  )
)

const viewPad = 16
const viewBox = computed(
  () =>
    `${-viewPad} ${-viewPad} ${previewWidth.value + viewPad * 2} ${previewHeight.value + viewPad * 2}`
)

type Handle = 'e' | 's' | 'se'
const dragging = ref<Handle | null>(null)
const dragStart = ref<{ x: number; y: number; w: number; h: number } | null>(null)

function onHandleDown(handle: Handle, e: PointerEvent) {
  if (props.disabled) return
  e.preventDefault()
  ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  dragging.value = handle
  dragStart.value = {
    x: e.clientX,
    y: e.clientY,
    w: previewWidth.value,
    h: previewHeight.value,
  }
}

function onHandleMove(e: PointerEvent) {
  if (!dragging.value || !dragStart.value) return
  const dx = e.clientX - dragStart.value.x
  const dy = e.clientY - dragStart.value.y
  if (dragging.value === 'e' || dragging.value === 'se') {
    previewWidth.value = Math.max(
      MIN_SIZE,
      Math.min(MAX_SIZE, Math.round(dragStart.value.w + dx))
    )
  }
  if (dragging.value === 's' || dragging.value === 'se') {
    previewHeight.value = Math.max(
      MIN_SIZE,
      Math.min(MAX_SIZE, Math.round(dragStart.value.h + dy))
    )
  }
}

function onHandleUp() {
  dragging.value = null
  dragStart.value = null
}
</script>

<template>
  <div class="scale-preview">
    <div class="scale-preview__meta">
      <span>{{ t('shapes.scalePreviewSize', { w: previewWidth, h: previewHeight }) }}</span>
    </div>
    <div
      class="scale-preview__stage"
      @pointermove="onHandleMove"
      @pointerup="onHandleUp"
      @pointercancel="onHandleUp"
    >
      <div
        class="scale-preview__node"
        :style="{ width: previewWidth + 'px', height: previewHeight + 'px' }"
      >
        <svg
          class="scale-preview__svg"
          :viewBox="viewBox"
          :width="previewWidth"
          :height="previewHeight"
          preserveAspectRatio="none"
        >
          <path
            v-if="svgPath"
            :d="svgPath"
            class="scale-preview__path"
          />
        </svg>
        <button
          type="button"
          class="scale-preview__handle scale-preview__handle--e"
          :disabled="disabled"
          :aria-label="t('shapes.scalePreviewResizeE')"
          @pointerdown="onHandleDown('e', $event)"
        />
        <button
          type="button"
          class="scale-preview__handle scale-preview__handle--s"
          :disabled="disabled"
          :aria-label="t('shapes.scalePreviewResizeS')"
          @pointerdown="onHandleDown('s', $event)"
        />
        <button
          type="button"
          class="scale-preview__handle scale-preview__handle--se"
          :disabled="disabled"
          :aria-label="t('shapes.scalePreviewResizeSe')"
          @pointerdown="onHandleDown('se', $event)"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.scale-preview {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  min-height: 0;
  height: 100%;
}

.scale-preview__meta {
  font-size: 12px;
  color: var(--text-muted);
}

.scale-preview__stage {
  flex: 1;
  min-height: 220px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background:
    linear-gradient(45deg, var(--surface-muted) 25%, transparent 25%),
    linear-gradient(-45deg, var(--surface-muted) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, var(--surface-muted) 75%),
    linear-gradient(-45deg, transparent 75%, var(--surface-muted) 75%);
  background-size: 16px 16px;
  background-position: 0 0, 0 8px, 8px -8px, -8px 0;
  background-color: var(--surface);
  overflow: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.scale-preview__node {
  position: relative;
  flex-shrink: 0;
}

.scale-preview__svg {
  display: block;
  overflow: visible;
}

.scale-preview__path {
  fill: var(--surface-muted);
  stroke: var(--base-text);
  stroke-width: 2;
  vector-effect: non-scaling-stroke;
}

.scale-preview__handle {
  position: absolute;
  width: 12px;
  height: 12px;
  padding: 0;
  border: 2px solid var(--surface);
  border-radius: 2px;
  background: var(--primary);
  cursor: pointer;
  z-index: 1;
}

.scale-preview__handle:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.scale-preview__handle--e {
  top: 50%;
  right: -6px;
  transform: translateY(-50%);
  cursor: ew-resize;
}

.scale-preview__handle--s {
  left: 50%;
  bottom: -6px;
  transform: translateX(-50%);
  cursor: ns-resize;
}

.scale-preview__handle--se {
  right: -6px;
  bottom: -6px;
  cursor: nwse-resize;
}
</style>
