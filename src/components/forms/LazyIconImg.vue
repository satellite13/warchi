<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useLibraryIcons } from '@/composables/useLibraryIcons'

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
  async () => {
    if (props.eager) {
      shouldLoad.value = true
      return
    }
    shouldLoad.value = false
    await nextTick()
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

const { srcFor, ensureLoaded } = useLibraryIcons()
void ensureLoaded()

const src = computed(() =>
  shouldLoad.value && props.iconId ? srcFor(props.iconId) : undefined
)

function onError(): void {
  // Browsers fire error for <img> without src; ignore until we intentionally load.
  if (!src.value) return
  emit('error', props.iconId)
}
</script>

<template>
  <!-- Placeholder keeps IntersectionObserver root before src is set (no error event). -->
  <span
    v-if="iconId && !src"
    ref="rootEl"
    :class="imgClass"
    class="lazy-icon-img__placeholder"
    aria-hidden="true"
  />
  <img
    v-else-if="iconId && src"
    :class="imgClass"
    :src="src"
    :alt="alt"
    loading="lazy"
    decoding="async"
    @error="onError"
  >
</template>

<style scoped>
.lazy-icon-img__placeholder {
  display: inline-block;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}
</style>
