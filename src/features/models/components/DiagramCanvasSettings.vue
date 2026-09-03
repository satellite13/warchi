<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import UiIcon from '@/components/ui/UiIcon.vue'
import type { ToolbarButton } from '@/components/layout/IconToolbar.vue'
import type { EdgePathType } from '../composables/useModelToolbarState'

const props = withDefaults(
  defineProps<{
    buttons: ToolbarButton[]
    linkTypes: { value: EdgePathType; label: string; icon: string }[]
    defaultEdgeType: EdgePathType
    disabled?: boolean
  }>(),
  {
    disabled: false,
  }
)

const emit = defineEmits<{
  action: [event: string]
  'update:defaultEdgeType': [value: EdgePathType]
}>()

const { t } = useI18n()
const open = ref(false)
const rootRef = ref<HTMLElement | null>(null)

function toggle(): void {
  if (props.disabled) return
  open.value = !open.value
}

function onDocumentPointerDown(event: PointerEvent): void {
  const root = rootRef.value
  if (!root || !(event.target instanceof Node) || root.contains(event.target)) {
    return
  }
  open.value = false
}

function onDocumentKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    open.value = false
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown)
  document.addEventListener('keydown', onDocumentKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  document.removeEventListener('keydown', onDocumentKeydown)
})
</script>

<template>
  <div ref="rootRef" class="diagram-canvas-settings">
    <AppTooltip :text="t('models.showDiagramSettings')" placement="bottom">
      <button
        type="button"
        class="diagram-canvas-settings__toggle"
        :class="{ 'diagram-canvas-settings__toggle--open': open }"
        :disabled="disabled"
        :aria-expanded="open"
        aria-haspopup="true"
        @click="toggle"
      >
        <UiIcon name="tune" />
      </button>
    </AppTooltip>
    <div v-if="open" class="diagram-canvas-settings__panel" role="menu">
      <div class="diagram-canvas-settings__title">{{ t('common.settings') }}</div>
      <button
        v-for="button in buttons"
        :key="button.event"
        type="button"
        class="diagram-canvas-settings__item"
        :class="{ 'diagram-canvas-settings__item--active': button.active }"
        :title="button.title"
        :disabled="button.disabled"
        @click="emit('action', button.event)"
      >
        <UiIcon :name="button.icon" />
        <span>{{ button.title }}</span>
      </button>
      <div class="diagram-canvas-settings__row">
        <span class="diagram-canvas-settings__label">{{ t('models.defaultLinkType') }}</span>
        <div class="diagram-canvas-settings__link-types">
          <button
            v-for="opt in linkTypes"
            :key="opt.value"
            type="button"
            class="diagram-canvas-settings__item"
            :class="{ 'diagram-canvas-settings__item--active': defaultEdgeType === opt.value }"
            :title="opt.label"
            :disabled="disabled"
            @click="emit('update:defaultEdgeType', opt.value)"
          >
            <UiIcon :name="opt.icon" />
            <span>{{ opt.label }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.diagram-canvas-settings {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.diagram-canvas-settings__toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}

.diagram-canvas-settings__toggle :deep(.ui-icon) {
  width: 20px;
  height: 20px;
}

.diagram-canvas-settings__toggle:hover:not(:disabled) {
  background: var(--surface);
  color: var(--base-text);
}

.diagram-canvas-settings__toggle--open,
.diagram-canvas-settings__toggle:hover:not(:disabled) {
  color: var(--primary);
}

.diagram-canvas-settings__toggle--open {
  background: var(--primary-soft);
}

.diagram-canvas-settings__toggle:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.diagram-canvas-settings__panel {
  position: absolute;
  top: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 30;
  width: 220px;
  padding: 8px 6px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.diagram-canvas-settings__title {
  padding: 2px 8px 4px;
  color: var(--text-muted);
  font-size: 10px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.diagram-canvas-settings__item {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--base-text);
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  padding: 7px 8px;
  font-size: 12px;
  cursor: pointer;
}

.diagram-canvas-settings__item:hover:not(:disabled) {
  border-color: var(--primary);
  background: var(--primary-soft);
}

.diagram-canvas-settings__item--active {
  border-color: var(--primary);
  background: var(--primary-soft);
  color: var(--primary);
}

.diagram-canvas-settings__item:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.diagram-canvas-settings__item :deep(.ui-icon) {
  width: 14px;
  height: 14px;
}

.diagram-canvas-settings__row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-top: 4px;
}

.diagram-canvas-settings__label {
  padding: 0 8px;
  font-size: 12px;
  color: var(--text-muted);
}

.diagram-canvas-settings__link-types {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
</style>
