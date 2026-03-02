<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue"
import { useI18n } from "vue-i18n"

const STORAGE_KEY = "warchi:model-editor:workspace"
type WorkspaceSettings = {
  leftCollapsed: boolean
  rightCollapsed: boolean
  leftWidth: number
  rightWidth: number
}

const MIN_SIDE_WIDTH = 260
const MAX_SIDE_WIDTH = 560
const { t } = useI18n()
type SideResizeTarget = "left" | "right"
let resizingSide: SideResizeTarget | null = null
let sideDragStartX = 0
let sideDragStartWidth = 0

function clampSideWidth(value: number): number {
  return Math.max(MIN_SIDE_WIDTH, Math.min(MAX_SIDE_WIDTH, value))
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
const leftWidth = ref(
  typeof savedSettings.leftWidth === "number" ? clampSideWidth(savedSettings.leftWidth) : 320
)
const rightWidth = ref(
  typeof savedSettings.rightWidth === "number" ? clampSideWidth(savedSettings.rightWidth) : 360
)

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

onBeforeUnmount(() => {
  stopSideResize()
})

watch([leftCollapsed, rightCollapsed, leftWidth, rightWidth], () => {
  persistWorkspaceSettings()
})
</script>

<template>
  <div class="model-panel-wrapper">
    <div class="model-panel" :style="{ gridTemplateColumns: gridColumns }">
      <aside class="model-panel__left" :class="{ 'model-panel__left--collapsed': leftCollapsed }">
        <slot name="left" />
      </aside>
      <section class="model-panel__center">
        <slot />
      </section>
      <aside class="model-panel__right" :class="{ 'model-panel__right--collapsed': rightCollapsed }">
        <slot name="right" />
      </aside>
      <div
        v-if="!leftCollapsed"
        class="model-panel__side-resizer model-panel__side-resizer--left"
        :style="leftResizerStyle"
        role="separator"
        aria-orientation="vertical"
        :title="t('models.resizeLeftPanelWidth')"
        @mousedown.prevent="startSideResize('left', $event)"
      >
        <span class="model-panel__side-resizer-handle"></span>
      </div>
      <div
        v-if="!rightCollapsed"
        class="model-panel__side-resizer model-panel__side-resizer--right"
        :style="rightResizerStyle"
        role="separator"
        aria-orientation="vertical"
        :title="t('models.resizeRightPanelWidth')"
        @mousedown.prevent="startSideResize('right', $event)"
      >
        <span class="model-panel__side-resizer-handle"></span>
      </div>
    </div>
    <button
      type="button"
      class="model-panel__collapse-btn model-panel__collapse-btn--left"
      :title="leftCollapsed ? t('models.showLeftPanel') : t('models.hideLeftPanel')"
      @click="leftCollapsed = !leftCollapsed"
    >
      <UiIcon :name="leftCollapsed ? 'chevron_right' : 'chevron_left'" />
    </button>
    <button
      type="button"
      class="model-panel__collapse-btn model-panel__collapse-btn--right"
      :title="rightCollapsed ? t('models.showRightPanel') : t('models.hideRightPanel')"
      @click="rightCollapsed = !rightCollapsed"
    >
      <UiIcon :name="rightCollapsed ? 'chevron_left' : 'chevron_right'" />
    </button>
  </div>
</template>

<style scoped>
.model-panel-wrapper {
  flex: 1;
  min-height: 0;
  position: relative;
}

.model-panel {
  width: 100%;
  height: 100%;
  display: grid;
  overflow: hidden;
  position: relative;
}

.model-panel__left,
.model-panel__right {
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  background: var(--surface-panel);
}

.model-panel__left {
  border-right: 1px solid var(--border);
}

.model-panel__right {
  border-left: 1px solid var(--border);
}

.model-panel__left--collapsed {
  border-right-color: transparent;
}

.model-panel__right--collapsed {
  border-left-color: transparent;
}

.model-panel__center {
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}

.model-panel__side-resizer {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 10px;
  display: flex;
  align-items: center;
  cursor: col-resize;
  z-index: 8;
}

.model-panel__side-resizer--left {
  justify-content: flex-start;
}

.model-panel__side-resizer--right {
  justify-content: flex-end;
}

.model-panel__side-resizer::before {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--border);
}

.model-panel__side-resizer--left::before {
  left: 0;
}

.model-panel__side-resizer--right::before {
  right: 0;
}

.model-panel__side-resizer-handle {
  width: 3px;
  height: 42px;
  border-radius: 999px;
  background: var(--text-subtle);
  opacity: 0.4;
  transition: opacity 0.15s ease, background 0.15s ease;
}

.model-panel__side-resizer:hover .model-panel__side-resizer-handle {
  opacity: 1;
  background: var(--primary);
}

.model-panel__collapse-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 20px;
  height: 40px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-subtle);
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 10;
}

.model-panel__collapse-btn .ui-icon {
  width: 16px;
  height: 16px;
}

.model-panel__collapse-btn:hover {
  color: var(--primary);
  background: var(--primary-soft);
  border-color: var(--primary);
}

.model-panel__collapse-btn--left {
  left: 0;
  border-radius: 0 6px 6px 0;
}

.model-panel__collapse-btn--right {
  right: 0;
  border-radius: 6px 0 0 6px;
}
</style>
