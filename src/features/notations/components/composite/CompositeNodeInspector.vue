<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import StyleSection from '../StyleSection.vue'
import ContainerNodeProps from './props/ContainerNodeProps.vue'
import TextNodeProps from './props/TextNodeProps.vue'
import IconNodeProps from './props/IconNodeProps.vue'
import ShapeNodeProps from './props/ShapeNodeProps.vue'
import DividerNodeProps from './props/DividerNodeProps.vue'
import CComponentStyleProps from './props/CComponentStyleProps.vue'
import type { CompositeSerializedCComponent } from '../../notationAttrs'

defineProps<{
  selectedNode: CompositeSerializedCComponent | null
}>()

const emit = defineEmits<{
  (e: 'update:field', field: string, value: unknown): void
}>()
const { t } = useI18n()

const styleOpen = ref(false)

const TYPE_ICONS: Record<string, string> = {
  container: 'view_column',
  text: 'text_fields',
  icon: 'image',
  divider: 'horizontal_rule',
  shape: 'crop_square',
}

const TYPE_COLORS: Record<string, string> = {
  container: '#6366f1',
  text: '#0ea5e9',
  icon: '#f59e0b',
  divider: '#94a3b8',
  shape: '#10b981',
}
</script>

<template>
  <div class="inspector">
    <div v-if="!selectedNode" class="inspector__empty">
      {{ t('nodeStyle.compositeSelectNode') }}
    </div>

    <template v-else>
      <div class="inspector__header">
        <span
          class="inspector__type-badge"
          :style="{ background: TYPE_COLORS[selectedNode.type] ?? '#888' }"
        >
          <UiIcon :name="TYPE_ICONS[selectedNode.type] ?? 'help'" />
          {{ selectedNode.type }}
        </span>
        <input
          class="inspector__id-input"
          :value="selectedNode.id ?? ''"
          :placeholder="t('nodeStyle.compositeNodeId')"
          @change="emit('update:field', 'id', ($event.target as HTMLInputElement).value)"
        />
      </div>

      <div class="inspector__scroll">
        <div class="inspector__section">
          <div class="inspector__section-title">{{ t('nodeStyle.compositePropertiesTitle') }}</div>

          <ContainerNodeProps
            v-if="selectedNode.type === 'container'"
            :model-value="selectedNode"
            @update:field="(field: string, value: unknown) => emit('update:field', field, value)"
          />
          <TextNodeProps
            v-else-if="selectedNode.type === 'text'"
            :model-value="selectedNode"
            @update:field="(field: string, value: unknown) => emit('update:field', field, value)"
          />
          <IconNodeProps
            v-else-if="selectedNode.type === 'icon'"
            :model-value="selectedNode"
            @update:field="(field: string, value: unknown) => emit('update:field', field, value)"
          />
          <ShapeNodeProps
            v-else-if="selectedNode.type === 'shape'"
            :model-value="selectedNode"
            @update:field="(field: string, value: unknown) => emit('update:field', field, value)"
          />
          <DividerNodeProps
            v-else-if="selectedNode.type === 'divider'"
            :model-value="selectedNode"
            @update:field="(field: string, value: unknown) => emit('update:field', field, value)"
          />
        </div>

        <StyleSection
          :title="t('nodeStyle.compositeStyleSection')"
          :open="styleOpen"
          @toggle="styleOpen = !styleOpen"
        >
          <CComponentStyleProps
            :model-value="selectedNode"
            @update:field="(field: string, value: unknown) => emit('update:field', field, value)"
          />
        </StyleSection>
      </div>
    </template>
  </div>
</template>

<style scoped>
.inspector {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
}

.inspector__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-subtle);
  font-size: 12px;
}

.inspector__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.inspector__type-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 22px;
  padding: 0 8px;
  border-radius: 11px;
  font-size: 10px;
  font-weight: 600;
  color: white;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.inspector__type-badge :deep(.ui-icon) {
  width: 14px;
  height: 14px;
}

.inspector__id-input {
  flex: 1;
  min-width: 0;
  height: 24px;
  padding: 0 6px;
  font-size: 11px;
  font-family: inherit;
  color: var(--base-text);
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  outline: none;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.inspector__id-input:hover {
  border-color: var(--border);
  background: var(--surface-muted);
}

.inspector__id-input:focus {
  border-color: var(--primary);
  background: var(--surface-muted);
}

.inspector__scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0;
}

.inspector__section {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.inspector__section-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--base-text);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 2px;
}
</style>
