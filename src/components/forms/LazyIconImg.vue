<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    iconId: string
    alt?: string
    /** Load immediately (selected value in closed control). */
    eager?: boolean
    imgClass?: string
  }>(),
  { alt: '', eager: false, imgClass: '' }
)

const emit = defineEmits<{ error: [iconId: string] }>()

const rootEl = ref<HTMLElement | null>(null)
const shouldLoad = ref(props.eager)

let observer: IntersectionObserver | null = null

function disconnectObserver(): void {
  observer?.disconnect()
  observer = null
}

function setupObserver(): void {
  disconnectObserver()
  if (shouldLoad.value || !props.iconId) return

  const el = rootEl.value
  if (!el) return

  const scrollRoot = el.closest('.searchable-select__list')
  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        shouldLoad.value = true
        disconnectObserver()
      }
    },
    {
      root: scrollRoot instanceof Element ? scrollRoot : null,
      rootMargin: '48px',
    }
  )
  observer.observe(el)
}

onMounted(setupObserver)
onBeforeUnmount(disconnectObserver)

watch(
  () => props.iconId,
  () => {
    if (props.eager) {
      shouldLoad.value = true
      return
    }
    shouldLoad.value = false
    setupObserver()
  }
)

watch(
  () => props.eager,
  (eager) => {
    if (eager) {
      shouldLoad.value = true
      disconnectObserver()
    }
  }
)

const src = computed(() =>
  shouldLoad.value && props.iconId ? `/icons/${props.iconId}.svg` : undefined
)
</script>

<template>
  <img
    v-if="iconId"
    ref="rootEl"
    :class="imgClass"
    :src="src"
    :alt="alt"
    loading="lazy"
    decoding="async"
    @error="emit('error', iconId)"
  >
</template>
