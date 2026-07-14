<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import SketchColorField from '../SketchColorField.vue'
import ToggleSwitch from '@/components/forms/ToggleSwitch.vue'
import type { CompositeSerializedCComponent } from '@/domain/attrs/notationAttrs'

type PropDef = {
  key: string
  label: string
  control: 'color' | 'number' | 'toggle' | 'select'
  options?: string[]
  min?: number
  max?: number
  step?: number
}

const OUTER_PROPS: PropDef[] = [
  { key: 'fillColor', label: 'fillColor', control: 'color' },
  { key: 'strokeColor', label: 'strokeColor', control: 'color' },
  { key: 'fillOpacity', label: 'fillOpacity', control: 'number', min: 0, max: 1, step: 0.05 },
  { key: 'strokeOpacity', label: 'strokeOpacity', control: 'number', min: 0, max: 1, step: 0.05 },
  { key: 'opacity', label: 'opacity', control: 'number', min: 0, max: 1, step: 0.05 },
  { key: 'strokeWidth', label: 'strokeWidth', control: 'number', min: 0, max: 20, step: 1 },
  { key: 'cornerRadius', label: 'cornerRadius', control: 'number', min: 0, max: 50, step: 1 },
]

const TEXT_PROPS: PropDef[] = [
  { key: 'color', label: 'color', control: 'color' },
  { key: 'fontWeight', label: 'fontWeight', control: 'select', options: ['normal', 'bold', '300', '500', '700'] },
  { key: 'fontSize', label: 'fontSize', control: 'number', min: 6, max: 72, step: 1 },
  { key: 'fontStyle', label: 'fontStyle', control: 'select', options: ['normal', 'italic'] },
  { key: 'style.visible', label: 'visible', control: 'toggle' },
  { key: 'style.opacity', label: 'opacity', control: 'number', min: 0, max: 1, step: 0.05 },
]

const ICON_PROPS: PropDef[] = [
  { key: 'fillColor', label: 'fillColor', control: 'color' },
  { key: 'backgroundColor', label: 'backgroundColor', control: 'color' },
  { key: 'style.visible', label: 'visible', control: 'toggle' },
  { key: 'style.opacity', label: 'opacity', control: 'number', min: 0, max: 1, step: 0.05 },
]

const SHAPE_PROPS: PropDef[] = [
  { key: 'borderColor', label: 'borderColor', control: 'color' },
  { key: 'backgroundColor', label: 'backgroundColor', control: 'color' },
  { key: 'borderWidth', label: 'borderWidth', control: 'number', min: 0, max: 20, step: 1 },
  { key: 'cornerRadius', label: 'cornerRadius', control: 'number', min: 0, max: 50, step: 1 },
  { key: 'style.visible', label: 'visible', control: 'toggle' },
  { key: 'style.opacity', label: 'opacity', control: 'number', min: 0, max: 1, step: 0.05 },
]

const DIVIDER_PROPS: PropDef[] = [
  { key: 'color', label: 'color', control: 'color' },
  { key: 'thickness', label: 'thickness', control: 'number', min: 1, max: 20, step: 1 },
  { key: 'style.visible', label: 'visible', control: 'toggle' },
  { key: 'style.opacity', label: 'opacity', control: 'number', min: 0, max: 1, step: 0.05 },
]

const CONTAINER_PROPS: PropDef[] = [
  { key: 'style.visible', label: 'visible', control: 'toggle' },
  { key: 'style.opacity', label: 'opacity', control: 'number', min: 0, max: 1, step: 0.05 },
]

const OUTER_TARGET = '__compositeOuter__'

const props = defineProps<{
  patch: Record<string, unknown>
  targetId: string
  treeNodes: Array<{ node: CompositeSerializedCComponent }>
}>()

const emit = defineEmits<{
  (e: 'update:patch', value: Record<string, unknown>): void
}>()
const { t } = useI18n()

const targetNodeType = computed(() => {
  if (props.targetId === OUTER_TARGET) return '__outer__'
  const entry = props.treeNodes.find((n) => n.node.id === props.targetId)
  return entry?.node.type ?? 'container'
})

const availableProps = computed<PropDef[]>(() => {
  switch (targetNodeType.value) {
    case '__outer__': return OUTER_PROPS
    case 'text': return TEXT_PROPS
    case 'icon': return ICON_PROPS
    case 'shape': return SHAPE_PROPS
    case 'divider': return DIVIDER_PROPS
    case 'container': return CONTAINER_PROPS
    default: return CONTAINER_PROPS
  }
})

/** Get value from patch using dot-notation key */
function getValue(key: string): unknown {
  const parts = key.split('.')
  let obj: unknown = props.patch
  for (const part of parts) {
    if (obj == null || typeof obj !== 'object') return undefined
    obj = (obj as Record<string, unknown>)[part]
  }
  return obj
}

/** Set value in patch using dot-notation key */
function setValue(key: string, value: unknown) {
  const next = JSON.parse(JSON.stringify(props.patch)) as Record<string, unknown>
  const parts = key.split('.')
  if (parts.length === 1) {
    next[key] = value
  } else {
    let target = next
    for (let i = 0; i < parts.length - 1; i++) {
      if (!target[parts[i]] || typeof target[parts[i]] !== 'object') {
        target[parts[i]] = {}
      }
      target = target[parts[i]] as Record<string, unknown>
    }
    target[parts[parts.length - 1]] = value
  }
  emit('update:patch', next)
}

/** Remove a key from patch */
function removeKey(key: string) {
  const next = JSON.parse(JSON.stringify(props.patch)) as Record<string, unknown>
  const parts = key.split('.')
  if (parts.length === 1) {
    delete next[key]
  } else {
    let target = next
    for (let i = 0; i < parts.length - 1; i++) {
      if (!target[parts[i]] || typeof target[parts[i]] !== 'object') return
      target = target[parts[i]] as Record<string, unknown>
    }
    delete target[parts[parts.length - 1]]
    // Clean up empty style object
    if (parts[0] === 'style' && Object.keys(next.style as object ?? {}).length === 0) {
      delete next.style
    }
  }
  emit('update:patch', next)
}

/** Keys currently in the patch */
const activeKeys = computed(() => {
  const keys: string[] = []
  for (const key of Object.keys(props.patch)) {
    if (key === 'style' && typeof props.patch.style === 'object' && props.patch.style) {
      for (const subKey of Object.keys(props.patch.style as Record<string, unknown>)) {
        keys.push(`style.${subKey}`)
      }
    } else {
      keys.push(key)
    }
  }
  return keys
})

/** Properties available to add (not already in the patch) */
const addableProps = computed(() =>
  availableProps.value.filter((p) => !activeKeys.value.includes(p.key)),
)

function addProperty(key: string) {
  const def = availableProps.value.find((p) => p.key === key)
  if (!def) return
  const defaultValue = def.control === 'color' ? '#333333'
    : def.control === 'toggle' ? true
    : def.control === 'number' ? (def.min ?? 0)
    : def.options?.[0] ?? ''
  setValue(key, defaultValue)
}

/** Get PropDef for a key (may be unknown if user added via JSON) */
function getPropDef(key: string): PropDef | undefined {
  return availableProps.value.find((p) => p.key === key)
}
</script>

<template>
  <div class="ppe">
    <div v-for="key in activeKeys" :key="key" class="ppe__row">
      <span class="ppe__label">{{ getPropDef(key)?.label ?? key }}</span>
      <div class="ppe__control">
        <!-- Color -->
        <SketchColorField
          v-if="getPropDef(key)?.control === 'color'"
          :model-value="String(getValue(key) ?? '#333333')"
          @update:model-value="setValue(key, $event)"
        />
        <!-- Toggle -->
        <ToggleSwitch
          v-else-if="getPropDef(key)?.control === 'toggle'"
          :model-value="getValue(key) !== false"
          @update:model-value="setValue(key, $event)"
        />
        <!-- Number -->
        <input
          v-else-if="getPropDef(key)?.control === 'number'"
          type="number"
          class="ppe__input"
          :value="getValue(key) ?? getPropDef(key)?.min ?? 0"
          :min="getPropDef(key)?.min"
          :max="getPropDef(key)?.max"
          :step="getPropDef(key)?.step"
          @input="setValue(key, Number(($event.target as HTMLInputElement).value))"
        />
        <!-- Select -->
        <select
          v-else-if="getPropDef(key)?.control === 'select'"
          class="ppe__select"
          :value="getValue(key) ?? ''"
          @change="setValue(key, ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="opt in getPropDef(key)?.options" :key="opt" :value="opt">{{ opt }}</option>
        </select>
        <!-- Unknown (fallback text input) -->
        <input
          v-else
          type="text"
          class="ppe__input"
          :value="JSON.stringify(getValue(key) ?? '')"
          @blur="setValue(key, (() => { try { return JSON.parse(($event.target as HTMLInputElement).value) } catch { return ($event.target as HTMLInputElement).value } })())"
        />
      </div>
      <button type="button" class="ppe__remove" @click="removeKey(key)">
        <UiIcon name="close" />
      </button>
    </div>

    <select
      v-if="addableProps.length > 0"
      class="ppe__add"
      @change="addProperty(($event.target as HTMLSelectElement).value); ($event.target as HTMLSelectElement).value = ''"
    >
      <option value="">{{ t('nodeStyle.patchAddProperty') }}</option>
      <option v-for="prop in addableProps" :key="prop.key" :value="prop.key">
        {{ prop.label }}
      </option>
    </select>
  </div>
</template>

<style scoped>
.ppe {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ppe__row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ppe__label {
  font-size: 10px;
  color: var(--text-subtle);
  min-width: 70px;
  flex-shrink: 0;
}

.ppe__control {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
}

.ppe__input {
  width: 100%;
  height: 26px;
  padding: 0 6px;
  font-size: 11px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--surface-muted);
  color: var(--base-text);
}

.ppe__input:focus {
  border-color: var(--primary);
  outline: none;
}

.ppe__select {
  width: 100%;
  height: 26px;
  padding: 0 6px;
  font-size: 11px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--surface-muted);
  color: var(--base-text);
}

.ppe__remove {
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  color: var(--text-subtle);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  flex-shrink: 0;
  transition: color 0.15s ease, background 0.15s ease;
}

.ppe__remove:hover {
  color: var(--danger);
  background: color-mix(in srgb, var(--danger) 8%, transparent);
}

.ppe__remove :deep(.ui-icon) {
  width: 12px;
  height: 12px;
}

.ppe__add {
  height: 26px;
  padding: 0 6px;
  font-size: 11px;
  border: 1px dashed var(--border);
  border-radius: 5px;
  background: var(--surface);
  color: var(--text-subtle);
  cursor: pointer;
}
</style>
