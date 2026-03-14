<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from "vue"

const props = withDefaults(
  defineProps<{
    storageKey: string
    defaultLeftWidth?: number
    defaultRightWidth?: number
    minSideWidth?: number
    maxSideWidth?: number
    leftResizerTitle?: string
    rightResizerTitle?: string
    collapseLeftTitle?: string
    expandLeftTitle?: string
    collapseRightTitle?: string
    expandRightTitle?: string
  }>(),
  {
    defaultLeftWidth: 320,
    defaultRightWidth: 360,
    minSideWidth: 260,
    maxSideWidth: 560,
    leftResizerTitle: '',
    rightResizerTitle: '',
    collapseLeftTitle: '',
    expandLeftTitle: '',
    collapseRightTitle: '',
    expandRightTitle: '',
  }
)

type WorkspaceSettings = {
  leftCollapsed: boolean
  rightCollapsed: boolean
  leftWidth: number
  rightWidth: number
}

function readWorkspaceSettings(): Partial<WorkspaceSettings> {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(props.storageKey)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Partial<WorkspaceSettings>
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

function persistWorkspaceSettings(): void {
  if (typeof window === "undefined") return
  const next: WorkspaceSettings = {
    leftCollapsed: leftCollapsed.value,
    rightCollapsed: rightCollapsed.value,
    leftWidth: leftWidth.value,
    rightWidth: rightWidth.value,
  }
  try {
    window.localStorage.setItem(props.storageKey, JSON.stringify(next))
  } catch {
    // ignore quota/storage access errors
  }
}

function clampSideWidth(value: number): number {
  return Math.max(props.minSideWidth, Math.min(props.maxSideWidth, value))
}

const savedSettings = readWorkspaceSettings()
const leftCollapsed = ref(
  typeof savedSettings.leftCollapsed === "boolean" ? savedSettings.leftCollapsed : false
)
const rightCollapsed = ref(
  typeof savedSettings.rightCollapsed === "boolean" ? savedSettings.rightCollapsed : false
)
const leftWidth = ref(
  typeof savedSettings.leftWidth === "number"
    ? clampSideWidth(savedSettings.leftWidth)
    : props.defaultLeftWidth
)
const rightWidth = ref(
  typeof savedSettings.rightWidth === "number"
    ? clampSideWidth(savedSettings.rightWidth)
    : props.defaultRightWidth
)

defineExpose({ leftCollapsed, rightCollapsed, leftWidth, rightWidth })

const gridColumns = computed(() => {
  const left = leftCollapsed.value ? "0px" : `${leftWidth.value}px`
  const right = rightCollapsed.value ? "0px" : `${rightWidth.value}px`
  return `${left} minmax(0, 1fr) ${right}`
})

const leftResizerStyle = computed(() =>
  leftCollapsed.value ? undefined : ({ left: `calc(${leftWidth.value}px - 3px)` } as const)
)

const rightResizerStyle = computed(() =>
  rightCollapsed.value ? undefined : ({ right: `calc(${rightWidth.value}px - 3px)` } as const)
)

type SideResizeTarget = "left" | "right"
let resizingSide: SideResizeTarget | null = null
let sideDragStartX = 0
let sideDragStartWidth = 0

function onSideResizeMove(event: MouseEvent) {
  if (!resizingSide) return
  const deltaX = event.clientX - sideDragStartX
  if (resizingSide === "left") {
    leftWidth.value = clampSideWidth(sideDragStartWidth + deltaX)
  } else {
    rightWidth.value = clampSideWidth(sideDragStartWidth - deltaX)
  }
}

function stopSideResize() {
  if (!resizingSide) return
  resizingSide = null
  document.body.style.cursor = ""
  document.body.style.userSelect = ""
  window.removeEventListener("mousemove", onSideResizeMove)
  window.removeEventListener("mouseup", stopSideResize)
}

function startSideResize(target: SideResizeTarget, event: MouseEvent) {
  resizingSide = target
  sideDragStartX = event.clientX
  sideDragStartWidth = target === "left" ? leftWidth.value : rightWidth.value
  document.body.style.cursor = "col-resize"
  document.body.style.userSelect = "none"
  window.addEventListener("mousemove", onSideResizeMove)
  window.addEventListener("mouseup", stopSideResize)
}

watch([leftCollapsed, rightCollapsed, leftWidth, rightWidth], () => {
  persistWorkspaceSettings()
})

onBeforeUnmount(() => {
  stopSideResize()
})
</script>

<template>
  <div class="rpl-wrapper">
    <div class="rpl" :style="{ gridTemplateColumns: gridColumns }">
      <aside class="rpl__left" :class="{ 'rpl__left--collapsed': leftCollapsed }">
        <slot name="left" />
      </aside>
      <section class="rpl__center">
        <slot />
      </section>
      <aside class="rpl__right" :class="{ 'rpl__right--collapsed': rightCollapsed }">
        <slot name="right" />
      </aside>
      <div
        v-if="!leftCollapsed"
        class="rpl__side-resizer rpl__side-resizer--left"
        :style="leftResizerStyle"
        role="separator"
        aria-orientation="vertical"
        :title="leftResizerTitle"
        @mousedown.prevent="startSideResize('left', $event)"
      >
        <span class="rpl__side-resizer-handle"></span>
      </div>
      <div
        v-if="!rightCollapsed"
        class="rpl__side-resizer rpl__side-resizer--right"
        :style="rightResizerStyle"
        role="separator"
        aria-orientation="vertical"
        :title="rightResizerTitle"
        @mousedown.prevent="startSideResize('right', $event)"
      >
        <span class="rpl__side-resizer-handle"></span>
      </div>
    </div>
    <button
      type="button"
      class="rpl__collapse-btn rpl__collapse-btn--left"
      :title="leftCollapsed ? expandLeftTitle : collapseLeftTitle"
      @click="leftCollapsed = !leftCollapsed"
    >
      <UiIcon :name="leftCollapsed ? 'chevron_right' : 'chevron_left'" />
    </button>
    <button
      type="button"
      class="rpl__collapse-btn rpl__collapse-btn--right"
      :title="rightCollapsed ? expandRightTitle : collapseRightTitle"
      @click="rightCollapsed = !rightCollapsed"
    >
      <UiIcon :name="rightCollapsed ? 'chevron_left' : 'chevron_right'" />
    </button>
  </div>
</template>

<style scoped>
.rpl-wrapper {
  flex: 1;
  min-height: 0;
  position: relative;
  overflow: hidden;
}

.rpl {
  width: 100%;
  height: 100%;
  display: grid;
  overflow: hidden;
  position: relative;
}

.rpl__left,
.rpl__right {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  background: var(--surface-panel);
}

.rpl__left {
  border-right: 1px solid var(--border);
}

.rpl__right {
  border-left: 1px solid var(--border);
}

.rpl__left--collapsed {
  border-right-color: transparent;
}

.rpl__right--collapsed {
  border-left-color: transparent;
}

.rpl__center {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  position: relative;
}

.rpl__side-resizer {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 10px;
  display: flex;
  align-items: center;
  cursor: col-resize;
  z-index: 8;
}

.rpl__side-resizer--left {
  justify-content: flex-start;
}

.rpl__side-resizer--right {
  justify-content: flex-end;
}

.rpl__side-resizer::before {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--border);
}

.rpl__side-resizer--left::before {
  left: 0;
}

.rpl__side-resizer--right::before {
  right: 0;
}

.rpl__side-resizer-handle {
  width: 3px;
  height: 42px;
  border-radius: 999px;
  background: var(--text-subtle);
  opacity: 0.4;
  transition: opacity 0.15s ease, background 0.15s ease;
}

.rpl__side-resizer:hover .rpl__side-resizer-handle {
  opacity: 1;
  background: var(--primary);
}

.rpl__collapse-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 40px;
  padding: 0;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-subtle);
  cursor: pointer;
  z-index: 10;
  transition: color 0.15s ease, background 0.15s ease;
}

.rpl__collapse-btn .ui-icon {
  font-size: 16px;
  width: 16px;
  height: 16px;
}

.rpl__collapse-btn:hover {
  color: var(--primary);
  background: var(--primary-soft);
  border-color: var(--primary);
}

.rpl__collapse-btn--left {
  left: 0;
  border-radius: 0 6px 6px 0;
}

.rpl__collapse-btn--right {
  right: 0;
  border-radius: 6px 0 0 6px;
}
</style>
