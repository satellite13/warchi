<script setup lang="ts">
import { computed } from "vue"
import type { ComponentResponse, RelationResponse } from "../../../types/api"
import type { EditorLink, EditorNode } from "../types"
import { parseEntityAttrs, type CustomProperty } from "../../notations/notationAttrs"

const props = defineProps<{
  activeNotationId: string | null
  selectedNode: EditorNode | null
  selectedLink: EditorLink | null
  nodeBindingComponentId: string | null
  linkBindingRelationId: string | null
  availableComponents: ComponentResponse[]
  availableRelations: RelationResponse[]
  nodeScopedValues: Record<string, unknown>
  linkScopedValues: Record<string, unknown>
}>()

const emit = defineEmits<{
  bindNodeComponent: [componentId: string]
  bindLinkRelation: [relationId: string]
  setNodeScopedValue: [key: string, value: unknown]
  setLinkScopedValue: [key: string, value: unknown]
}>()

const selectedComponent = computed(() =>
  props.availableComponents.find((component) => component.id === props.nodeBindingComponentId) ?? null
)
const selectedRelation = computed(() =>
  props.availableRelations.find((relation) => relation.id === props.linkBindingRelationId) ?? null
)

const nodeProperties = computed<CustomProperty[]>(() =>
  selectedComponent.value ? parseEntityAttrs(selectedComponent.value.attrs ?? null).customProperties : []
)
const linkProperties = computed<CustomProperty[]>(() =>
  selectedRelation.value ? parseEntityAttrs(selectedRelation.value.attrs ?? null).customProperties : []
)

const currentMode = computed<"node" | "link" | "empty">(() => {
  if (props.selectedNode) return "node"
  if (props.selectedLink) return "link"
  return "empty"
})

const coerceValue = (property: CustomProperty, raw: string, checked?: boolean): unknown => {
  if (property.type === "boolean") return Boolean(checked)
  if (property.type === "number") {
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : null
  }
  return raw
}
</script>

<template>
  <div class="props">
    <div class="props__header">
      <span class="material-symbols-outlined">tune</span>
      <h3>Свойства</h3>
    </div>

    <div v-if="currentMode === 'empty'" class="props__empty-state">
      <span class="material-symbols-outlined props__empty-icon">touch_app</span>
      <span class="props__empty-text">Выберите элемент</span>
      <span class="props__empty-hint">Нажмите на ноду или связь на диаграмме</span>
    </div>

    <template v-else-if="currentMode === 'node' && selectedNode">
      <div class="props__mode-badge props__mode-badge--node">
        <span class="material-symbols-outlined">category</span>
        <span>{{ selectedNode.name }}</span>
      </div>
      <div class="props__section">
        <label class="props__label">Компонент нотации</label>
        <select
          class="props__select"
          :disabled="!activeNotationId || availableComponents.length === 0"
          :value="nodeBindingComponentId || ''"
          @change="emit('bindNodeComponent', ($event.target as HTMLSelectElement).value)"
        >
          <option value="" disabled>Выберите компонент</option>
          <option v-for="component in availableComponents" :key="component.id" :value="component.id">
            {{ component.name }}
          </option>
        </select>
      </div>

      <div v-if="nodeProperties.length === 0" class="props__empty">
        Для выбранного компонента нет настраиваемых свойств
      </div>

      <div v-else class="props__section">
        <div v-for="property in nodeProperties" :key="property.id" class="props__field">
          <label class="props__field-label">{{ property.name }}</label>
          <input
            v-if="property.type !== 'boolean'"
            class="props__input"
            :type="property.type === 'number' ? 'number' : 'text'"
            :value="String(nodeScopedValues[property.name] ?? '')"
            @input="emit('setNodeScopedValue', property.name, coerceValue(property, ($event.target as HTMLInputElement).value))"
          >
          <label v-else class="props__checkbox">
            <input
              type="checkbox"
              :checked="Boolean(nodeScopedValues[property.name])"
              @change="emit('setNodeScopedValue', property.name, coerceValue(property, '', ($event.target as HTMLInputElement).checked))"
            >
            <span>Да</span>
          </label>
        </div>
      </div>
    </template>

    <template v-else-if="currentMode === 'link' && selectedLink">
      <div class="props__mode-badge props__mode-badge--link">
        <span class="material-symbols-outlined">link</span>
        <span>Связь</span>
      </div>
      <div class="props__section">
        <label class="props__label">Relation нотации</label>
        <select
          class="props__select"
          :disabled="!activeNotationId || availableRelations.length === 0"
          :value="linkBindingRelationId || ''"
          @change="emit('bindLinkRelation', ($event.target as HTMLSelectElement).value)"
        >
          <option value="" disabled>Выберите relation</option>
          <option v-for="relation in availableRelations" :key="relation.id" :value="relation.id">
            {{ relation.name }}
          </option>
        </select>
      </div>

      <div v-if="linkProperties.length === 0" class="props__empty">
        Для выбранной relation нет настраиваемых свойств
      </div>

      <div v-else class="props__section">
        <div v-for="property in linkProperties" :key="property.id" class="props__field">
          <label class="props__field-label">{{ property.name }}</label>
          <input
            v-if="property.type !== 'boolean'"
            class="props__input"
            :type="property.type === 'number' ? 'number' : 'text'"
            :value="String(linkScopedValues[property.name] ?? '')"
            @input="emit('setLinkScopedValue', property.name, coerceValue(property, ($event.target as HTMLInputElement).value))"
          >
          <label v-else class="props__checkbox">
            <input
              type="checkbox"
              :checked="Boolean(linkScopedValues[property.name])"
              @change="emit('setLinkScopedValue', property.name, coerceValue(property, '', ($event.target as HTMLInputElement).checked))"
            >
            <span>Да</span>
          </label>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
@keyframes fadeSlideIn {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.props {
  height: 100%;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
}

.props__header {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-bottom: 1px solid var(--border);
  padding: 10px 12px;
}

.props__header .material-symbols-outlined {
  font-size: 18px;
  color: var(--text-muted);
}

.props__header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.props__mode-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 500;
  border-bottom: 1px solid var(--border);
  animation: fadeIn 0.2s ease;
}

.props__mode-badge .material-symbols-outlined {
  font-size: 16px;
}

.props__mode-badge--node {
  background: var(--primary-soft);
  color: var(--primary);
}

.props__mode-badge--link {
  background: var(--accent-soft);
  color: var(--accent);
}

.props__section {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-bottom: 1px solid var(--border);
  animation: fadeSlideIn 0.25s ease both;
}

.props__label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-subtle);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.props__select,
.props__input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-muted);
  color: var(--base-text);
  font-size: 13px;
  font-family: inherit;
  padding: 8px 10px;
  outline: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.props__select:focus,
.props__input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-soft);
}

.props__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  animation: fadeSlideIn 0.2s ease both;
}

.props__field-label {
  font-size: 12px;
  color: var(--text-muted);
}

.props__checkbox {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}

.props__checkbox input {
  accent-color: var(--primary);
}

.props__empty {
  padding: 14px 12px;
  font-size: 12px;
  color: var(--text-subtle);
}

.props__empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 40px 16px;
  animation: fadeIn 0.4s ease;
}

.props__empty-icon {
  font-size: 36px;
  color: var(--border-strong);
  margin-bottom: 4px;
}

.props__empty-text {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-muted);
}

.props__empty-hint {
  font-size: 12px;
  color: var(--text-subtle);
}
</style>
