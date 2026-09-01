<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ComponentResponse } from '@/types/api'
import { parseEntityAttrs } from '@/domain/attrs/notationAttrs'
import { resolvePaletteIconName } from '@/utils/paletteIcon'
import { useLibraryIcons } from '@/composables/useLibraryIcons'

const props = defineProps<{
  hasActiveDiagram: boolean
  readOnly: boolean
  navigationOnlyMode: boolean
  paletteVisible: boolean
  activeNotationId: string | null
  components: ComponentResponse[]
  remotePointerStyle: { left: string; top: string } | null
}>()

const emit = defineEmits<{
  paletteVisibleChange: [visible: boolean]
}>()

const { t } = useI18n()
const { srcFor, ensureLoaded: ensureLibraryIcons } = useLibraryIcons()
void ensureLibraryIcons()

// Expose prop mirrors used by template bindings copied from ModelDiagramCanvas.
const hasActiveDiagram = computed(() => props.hasActiveDiagram)
const readOnly = computed(() => props.readOnly)
const paletteVisible = computed(() => props.paletteVisible)
const activeNotationId = computed(() => props.activeNotationId)
const remotePointerStyle = computed(() => props.remotePointerStyle)

const onDragComponentStart = (event: DragEvent, componentId: string) => {
  event.dataTransfer?.setData('application/x-notation-component-id', componentId)
  event.dataTransfer?.setData('text/plain', `component:${componentId}`)
  event.dataTransfer?.setDragImage(event.currentTarget as Element, 10, 10)
}

const onDragNoteStart = (event: DragEvent) => {
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'
  event.dataTransfer?.setData('application/x-model-diagram-note', 'note')
  event.dataTransfer?.setData('text/plain', 'note')
  event.dataTransfer?.setDragImage(event.currentTarget as Element, 10, 10)
}

const onDragContainerStart = (event: DragEvent) => {
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'
  event.dataTransfer?.setData('application/x-model-diagram-container', 'container')
  event.dataTransfer?.setData('text/plain', 'container')
  event.dataTransfer?.setDragImage(event.currentTarget as Element, 10, 10)
}

// ── Palette ──
const paletteItems = computed(() => {
  const notationId = props.activeNotationId
  if (!notationId) return []
  return props.components
    .filter(component => component.notationId === notationId)
    .map(component => {
      const parsedAttrs = parseEntityAttrs(component.attrs ?? null)
      const fillColor = parsedAttrs.diagramStyle?.fillColor?.trim()
      const paletteGroup =
        typeof parsedAttrs.paletteGroup === 'number' && parsedAttrs.paletteGroup >= 0
          ? parsedAttrs.paletteGroup
          : 0
      return {
        ...component,
        paletteIconName: resolvePaletteIconName(parsedAttrs, 'component'),
        paletteFillColor: fillColor && fillColor.length > 0 ? fillColor : 'var(--accent)',
        paletteGroup,
      }
    })
})

type PaletteEntry =
  | { kind: 'divider' }
  | { kind: 'item'; component: (typeof paletteItems.value)[number] }

const paletteEntries = computed((): PaletteEntry[] => {
  const items = paletteItems.value
  if (items.length === 0) return []

  const byGroup = new Map<number, typeof items>()
  for (const item of items) {
    const group = item.paletteGroup
    if (!byGroup.has(group)) byGroup.set(group, [])
    byGroup.get(group)!.push(item)
  }

  const sortedGroups = Array.from(byGroup.keys()).sort((a, b) => a - b)
  const entries: PaletteEntry[] = []

  for (let i = 0; i < sortedGroups.length; i++) {
    const groupKey = sortedGroups[i]
    if (groupKey === undefined) continue
    if (i > 0 || groupKey > 0) entries.push({ kind: 'divider' })
    const groupItems = byGroup.get(groupKey)!
    groupItems.sort((a, b) => a.name.localeCompare(b.name, 'ru', { sensitivity: 'base' }))
    for (const comp of groupItems) {
      entries.push({ kind: 'item', component: comp })
    }
  }

  return entries
})

const buildIconUrl = (iconName: string): string => {
  const normalized = iconName.trim()
  if (!normalized) return '/icons/component.svg'
  return srcFor(normalized) || '/icons/component.svg'
}

const handlePaletteIconError = (event: Event, iconName: string) => {
  const img = event.target as HTMLImageElement | null
  if (!img) return
  const triedAltPath = img.dataset.iconFallbackTried === '1'
  if (!triedAltPath) {
    img.dataset.iconFallbackTried = '1'
    const normalized = iconName.trim()
    img.src = normalized.toLowerCase().endsWith('.svg')
      ? `/icon/${normalized}`
      : `/icon/${normalized}.svg`
    return
  }
  img.src = '/icons/component.svg'
}

const setPaletteVisible = (visible: boolean) => {
  if (props.paletteVisible === visible) return
  emit('paletteVisibleChange', visible)
}

</script>

<template>
<div
      v-if="remotePointerStyle && hasActiveDiagram"
      class="diagram-canvas__remote-pointer"
      :style="remotePointerStyle"
      aria-hidden="true"
    />

    <div v-if="!hasActiveDiagram" class="diagram-canvas__placeholder">
      <UiIcon name="draw" class="diagram-canvas__placeholder-icon" />
      <span class="diagram-canvas__placeholder-text">{{ t('diagram.openOrCreateDiagram') }}</span>
      <span class="diagram-canvas__placeholder-hint">{{ t('diagram.selectDiagramInTree') }}</span>
    </div>

    <template v-if="hasActiveDiagram">
      <template v-if="!readOnly">
        <AppTooltip
          v-if="!paletteVisible"
          class="canvas-palette-toggle-wrap"
          :text="t('diagram.showNotationPalette')"
          placement="bottom"
        >
          <button type="button" class="canvas-palette-toggle" @click="setPaletteVisible(true)">
            <UiIcon name="palette" />
          </button>
        </AppTooltip>

        <div v-if="paletteVisible" class="canvas-palette" :key="activeNotationId ?? 'none'">
        <div class="canvas-palette__header">
          <UiIcon name="palette" />
          <span>{{ t('diagram.palette') }}</span>
          <AppTooltip :text="t('diagram.hidePalette')" placement="bottom">
            <button type="button" class="canvas-palette__hide" @click="setPaletteVisible(false)">
              <UiIcon name="chevron_right" />
            </button>
          </AppTooltip>
        </div>
        <div v-if="paletteItems.length === 0" class="canvas-palette__empty">
          {{ t('diagram.noNotationComponents') }}
        </div>
        <div class="canvas-palette__list">
          <AppTooltip :text="t('diagram.note')" placement="bottom">
            <button
              type="button"
              class="canvas-palette__item canvas-palette__item--note"
              :draggable="!props.readOnly && !props.navigationOnlyMode"
              @dragstart="onDragNoteStart"
            >
              <UiIcon name="note" class="canvas-palette__note-icon" />
            </button>
          </AppTooltip>
          <AppTooltip :text="t('diagram.container')" placement="bottom">
            <button
              type="button"
              class="canvas-palette__item canvas-palette__item--container"
              :draggable="!props.readOnly && !props.navigationOnlyMode"
              @dragstart="onDragContainerStart"
            >
              <UiIcon name="crop_free" class="canvas-palette__note-icon" />
            </button>
          </AppTooltip>
          <template
            v-for="(entry, index) in paletteEntries"
            :key="entry.kind === 'item' ? entry.component.id : `divider-${index}`"
          >
            <div v-if="entry.kind === 'divider'" class="canvas-palette__divider" />
            <AppTooltip v-else :text="entry.component.name" placement="bottom">
              <button
                type="button"
                class="canvas-palette__item"
                :style="{ '--palette-item-fill': entry.component.paletteFillColor }"
                :draggable="!props.readOnly && !props.navigationOnlyMode"
                @dragstart="onDragComponentStart($event, entry.component.id)"
              >
                <img
                  class="canvas-palette__icon"
                  :src="buildIconUrl(entry.component.paletteIconName)"
                  :alt="entry.component.name"
                  draggable="false"
                  @error="handlePaletteIconError($event, entry.component.paletteIconName)"
                />
              </button>
            </AppTooltip>
          </template>
        </div>
      </div>
      </template>
    </template>
  
</template>

<style scoped>
.diagram-canvas__remote-pointer {
  position: absolute;
  width: 14px;
  height: 14px;
  margin-left: -7px;
  margin-top: -7px;
  border-radius: 50%;
  background: var(--primary);
  border: 2px solid #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
  pointer-events: none;
  z-index: 20;
}

.diagram-canvas__placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  animation: fadeIn 0.4s ease;
}

.diagram-canvas__placeholder-icon {
  width: 48px;
  height: 48px;
  color: var(--border-strong);
  margin-bottom: 4px;
}

.diagram-canvas__placeholder-text {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-muted);
}

.diagram-canvas__placeholder-hint {
  font-size: 13px;
  color: var(--text-subtle);
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.canvas-palette-toggle-wrap {
  position: absolute;
  right: 15px;
  top: 10px;
  z-index: 6;
}

.canvas-palette-toggle {
  width: 30px;
  height: 30px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text-muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.canvas-palette-toggle:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-soft);
}

.canvas-palette {
  position: absolute;
  right: 15px;
  top: 10px;
  bottom: 12px;
  width: 120px;
  padding: 8px 6px 8px 6px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 6;
  margin-bottom: 12px;
}

.canvas-palette__header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  color: var(--text-muted);
  font-size: 10px;
  text-transform: uppercase;
}

.canvas-palette__header .ui-icon {
  font-size: 14px;
}

.canvas-palette__hide {
  position: absolute;
  right: -1px;
  top: -1px;
  width: 20px;
  height: 20px;
  border: 1px solid var(--border);
  border-radius: 0 10px 0 8px;
  background: var(--surface);
  color: var(--text-subtle);
  padding: 0;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.canvas-palette__hide .ui-icon {
  font-size: 16px;
}

.canvas-palette__list {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  overflow: auto;
  align-content: start;
}

.canvas-palette__list > .app-tooltip {
  width: 100%;
}

.canvas-palette__divider {
  grid-column: 1 / -1;
  height: 1px;
  background: var(--border);
  margin: 2px 0;
}

.canvas-palette__item {
  --palette-item-bg: color-mix(in srgb, var(--palette-item-fill) 18%, var(--surface));
  width: 100%;
  height: 34px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--palette-item-bg);
  color: var(--base-text);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
  transition: all 0.15s ease;
}

.canvas-palette__item:hover {
  border-color: var(--palette-item-fill, var(--accent));
  background: color-mix(in srgb, var(--palette-item-fill) 28%, var(--surface));
}

.canvas-palette__item--note {
  --palette-item-fill: #f1c40f;
}

.canvas-palette__item--container {
  --palette-item-fill: transparent;
  border: 1px dashed #8a8a8a;
}

.canvas-palette__item--container .canvas-palette__note-icon {
  color: #5c5c5c;
}

.canvas-palette__note-icon {
  width: 18px;
  height: 18px;
  color: #7a5a00;
}

.canvas-palette__icon {
  width: 18px;
  height: 18px;
  object-fit: contain;
  pointer-events: none;
}

.canvas-palette__empty {
  font-size: 11px;
  color: var(--text-subtle);
  text-align: center;
  line-height: 1.3;
}

</style>
