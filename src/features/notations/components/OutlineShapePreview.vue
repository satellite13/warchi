<script setup lang="ts">
import { computed } from 'vue'
import type { OutlineSegment } from '@/domain/attrs/notationAttrs'
import { customOutlineToSvgPath } from '@/utils/customOutlinePath'
import { parseOutlineSegmentsOrEmpty } from '@/features/notations/utils/outlinesEquivalent'

const props = withDefaults(
  defineProps<{
    outlineJson?: string | null
    segments?: OutlineSegment[]
    width?: number
    height?: number
    label?: string
  }>(),
  { width: 96, height: 72, outlineJson: null, segments: () => [], label: '' }
)

const pathD = computed(() => {
  const segments =
    props.segments && props.segments.length > 0
      ? props.segments
      : parseOutlineSegmentsOrEmpty(props.outlineJson)
  return customOutlineToSvgPath(segments, props.width, props.height)
})
</script>

<template>
  <div class="outline-shape-preview">
    <div v-if="label" class="outline-shape-preview__label">{{ label }}</div>
    <svg
      class="outline-shape-preview__svg"
      :width="width"
      :height="height"
      :viewBox="`0 0 ${width} ${height}`"
      aria-hidden="true"
    >
      <path
        v-if="pathD"
        :d="pathD"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      />
      <text
        v-else
        :x="width / 2"
        :y="height / 2"
        text-anchor="middle"
        dominant-baseline="middle"
        class="outline-shape-preview__empty"
      >
        —
      </text>
    </svg>
  </div>
</template>

<style scoped>
.outline-shape-preview {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  padding: 0.5rem;
  background: var(--surface-muted);
  border-radius: 6px;
}
.outline-shape-preview__label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}
.outline-shape-preview__svg {
  color: var(--base-text);
}
.outline-shape-preview__empty {
  fill: var(--text-subtle);
  font-size: 0.85rem;
}
</style>
