<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from "vue"
import { useI18n } from "vue-i18n"

const { t } = useI18n()

const STORAGE_KEY = "warchi:notation-editor:workspace"
type WorkspaceSettings = {
  leftCollapsed: boolean
  rightCollapsed: boolean
  leftWidth: number
  rightWidth: number
}

function readWorkspaceSettings(): Partial<WorkspaceSettings> {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
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
    rightWidth: rightWidth.value
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // ignore quota/storage access errors
  }
}

const savedSettings = readWorkspaceSettings()
const leftCollapsed = ref(typeof savedSettings.leftCollapsed === "boolean" ? savedSettings.leftCollapsed : false)
const rightCollapsed = ref(typeof savedSettings.rightCollapsed === "boolean" ? savedSettings.rightCollapsed : false)
const leftWidth = ref(320)
const rightWidth = ref(420)

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

function toggleRight() {
  rightCollapsed.value = !rightCollapsed.value
}

function toggleLeft() {
  leftCollapsed.value = !leftCollapsed.value
}

const MIN_SIDE_WIDTH = 260
const MAX_SIDE_WIDTH = 560
type SideResizeTarget = "left" | "right"
let resizingSide: SideResizeTarget | null = null
let sideDragStartX = 0
let sideDragStartWidth = 0

function clampSideWidth(value: number): number {
  return Math.max(MIN_SIDE_WIDTH, Math.min(MAX_SIDE_WIDTH, value))
}

leftWidth.value =
  typeof savedSettings.leftWidth === "number" ? clampSideWidth(savedSettings.leftWidth) : leftWidth.value
rightWidth.value =
  typeof savedSettings.rightWidth === "number" ? clampSideWidth(savedSettings.rightWidth) : rightWidth.value

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
  <div class="notation-panel-wrapper">
    <div class="notation-panel" :style="{ gridTemplateColumns: gridColumns }">
      <aside class="notation-panel__left" :class="{ 'notation-panel__left--collapsed': leftCollapsed }">
        <slot name="left" />
      </aside>
      <section class="notation-panel__center">
        <slot />
      </section>
      <aside class="notation-panel__right" :class="{ 'notation-panel__right--collapsed': rightCollapsed }">
        <slot name="right" />
      </aside>
      <div
        v-if="!leftCollapsed"
        class="notation-panel__side-resizer notation-panel__side-resizer--left"
        :style="leftResizerStyle"
        role="separator"
        aria-orientation="vertical"
        :title="t('notations.resizeElementsPanelWidth')"
        @mousedown.prevent="startSideResize('left', $event)"
      >
        <span class="notation-panel__side-resizer-handle"></span>
      </div>
      <div
        v-if="!rightCollapsed"
        class="notation-panel__side-resizer notation-panel__side-resizer--right"
        :style="rightResizerStyle"
        role="separator"
        aria-orientation="vertical"
        :title="t('notations.resizeStylesPanelWidth')"
        @mousedown.prevent="startSideResize('right', $event)"
      >
        <span class="notation-panel__side-resizer-handle"></span>
      </div>
    </div>
    <button
      type="button"
      class="notation-panel__collapse-btn notation-panel__collapse-btn--left"
      :title="leftCollapsed ? t('notations.showElementsPanel') : t('notations.hideElementsPanel')"
      @click="toggleLeft"
    >
      <span class="material-symbols-outlined">{{ leftCollapsed ? 'chevron_right' : 'chevron_left' }}</span>
    </button>
    <button
      type="button"
      class="notation-panel__collapse-btn notation-panel__collapse-btn--right"
      :title="rightCollapsed ? t('notations.showStylesPanel') : t('notations.hideStylesPanel')"
      @click="toggleRight"
    >
      <span class="material-symbols-outlined">{{ rightCollapsed ? 'chevron_left' : 'chevron_right' }}</span>
    </button>
  </div>
</template>

<style scoped>
.notation-panel-wrapper {
  flex: 1;
  min-height: 0;
  position: relative;
  overflow: hidden;
}

.notation-panel {
  width: 100%;
  height: 100%;
  display: grid;
  overflow: hidden;
  position: relative;
}

.notation-panel__left {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  border-right: 1px solid var(--border);
  background: var(--surface-panel);
}

.notation-panel__left--collapsed {
  border-right-color: transparent;
}

.notation-panel__center {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  position: relative;
}

.notation-panel__side-resizer {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 10px;
  display: flex;
  align-items: center;
  cursor: col-resize;
  z-index: 8;
}

.notation-panel__side-resizer--left {
  justify-content: flex-start;
}

.notation-panel__side-resizer--right {
  justify-content: flex-end;
}

.notation-panel__side-resizer::before {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--border);
}

.notation-panel__side-resizer--left::before {
  left: 0;
}

.notation-panel__side-resizer--right::before {
  right: 0;
}

.notation-panel__side-resizer-handle {
  width: 3px;
  height: 42px;
  border-radius: 999px;
  background: var(--text-subtle);
  opacity: 0.4;
  transition: opacity 0.15s ease, background 0.15s ease;
}

.notation-panel__side-resizer:hover .notation-panel__side-resizer-handle {
  opacity: 1;
  background: var(--primary);
}

.notation-panel__right {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  border-left: 1px solid var(--border);
  background: var(--surface-panel);
}

.notation-panel__right--collapsed {
  border-left-color: transparent;
}

.notation-panel__collapse-btn {
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

.notation-panel__collapse-btn .material-symbols-outlined {
  font-size: 16px;
}

.notation-panel__collapse-btn:hover {
  color: var(--primary);
  background: var(--primary-soft);
  border-color: var(--primary);
}

.notation-panel__collapse-btn--left {
  left: 0;
  border-radius: 0 6px 6px 0;
}

.notation-panel__collapse-btn--right {
  right: 0;
  border-radius: 6px 0 0 6px;
}
</style>
