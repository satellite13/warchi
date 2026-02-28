<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ComponentResponse, RelationResponse } from '../../../types/api'
import type { EditorLink, EditorNode } from '../types'
import { parseEntityAttrs, type CustomProperty } from '../../notations/notationAttrs'

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
  onOpenNodeDocument?: (node: EditorNode) => void
}>()

const emit = defineEmits<{
  bindNodeComponent: [componentId: string]
  bindLinkRelation: [relationId: string]
  setNodeScopedValue: [key: string, value: unknown]
  setLinkScopedValue: [key: string, value: unknown]
}>()
const { t } = useI18n()

const selectedComponent = computed(
  () =>
    props.availableComponents.find(component => component.id === props.nodeBindingComponentId) ??
    null
)
const selectedRelation = computed(
  () =>
    props.availableRelations.find(relation => relation.id === props.linkBindingRelationId) ?? null
)

const nodeProperties = computed<CustomProperty[]>(() => {
  if (!selectedComponent.value) return []
  const props = parseEntityAttrs(selectedComponent.value.attrs ?? null).customProperties
  return props.filter(p => !p.system)
})
const linkProperties = computed<CustomProperty[]>(() => {
  if (!selectedRelation.value) return []
  const props = parseEntityAttrs(selectedRelation.value.attrs ?? null).customProperties
  return props.filter(p => !p.system)
})

const currentMode = computed<'node' | 'link' | 'empty'>(() => {
  if (props.selectedNode) return 'node'
  if (props.selectedLink) return 'link'
  return 'empty'
})

const coerceValue = (property: CustomProperty, raw: string, checked?: boolean): unknown => {
  if (property.type === 'boolean') return Boolean(checked)
  if (property.type === 'number') {
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : null
  }
  return raw
}
</script>

<template>
  <div class="mp">
    <!-- Empty state -->
    <div v-if="currentMode === 'empty'" class="mp-empty">
      <div class="mp-empty__graphic">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <rect
            x="10"
            y="14"
            width="12"
            height="10"
            rx="2.5"
            stroke="currentColor"
            stroke-width="1.4"
            opacity="0.25"
          />
          <rect
            x="26"
            y="24"
            width="12"
            height="10"
            rx="2.5"
            stroke="currentColor"
            stroke-width="1.4"
            opacity="0.25"
          />
          <path
            d="M22 22L26 26"
            stroke="currentColor"
            stroke-width="1.2"
            stroke-linecap="round"
            stroke-dasharray="3 2"
            opacity="0.18"
          />
          <circle cx="24" cy="24" r="2" fill="currentColor" opacity="0.15" />
        </svg>
      </div>
      <span class="mp-empty__text">{{ t('diagram.selectElement') }}</span>
      <span class="mp-empty__hint">{{ t('diagram.selectElementHint') }}</span>
    </div>

    <template v-else>
      <!-- Type badge -->
      <div class="mp-badge" :class="currentMode === 'link' ? 'mp-badge--link' : 'mp-badge--node'">
        <svg
          v-if="currentMode === 'link'"
          class="mp-badge__icon"
          width="15"
          height="15"
          viewBox="0 0 16 16"
          fill="none"
        >
          <circle cx="3" cy="13" r="2" stroke="currentColor" stroke-width="1.2" />
          <circle cx="13" cy="3" r="2" stroke="currentColor" stroke-width="1.2" />
          <path
            d="M4.5 11.5L11.5 4.5"
            stroke="currentColor"
            stroke-width="1.2"
            stroke-linecap="round"
          />
        </svg>
        <svg v-else class="mp-badge__icon" width="15" height="15" viewBox="0 0 16 16" fill="none">
          <rect x="2" y="4" width="12" height="8" rx="2" stroke="currentColor" stroke-width="1.2" />
        </svg>
        <span class="mp-badge__label">
          {{
            currentMode === 'link' ? t('diagram.link') : (selectedNode?.name ?? t('diagram.node'))
          }}
        </span>
      </div>

      <!-- Documentation button (node only) -->
      <button
        v-if="currentMode === 'node' && selectedNode"
        type="button"
        class="mp-doc-btn"
        @click="onOpenNodeDocument?.(selectedNode)"
      >
        <span class="material-symbols-outlined">description</span>
        {{ t('models.documentation') }}
        <span v-if="selectedNode.parsedAttrs.documentFileId" class="mp-doc-btn__badge">
          <span class="material-symbols-outlined">check_circle</span>
        </span>
      </button>

      <!-- Scrollable content -->
      <div class="mp-body">
        <!-- NODE binding -->
        <template v-if="currentMode === 'node' && selectedNode">
          <section class="mp-section">
            <span class="mp-section__title">{{ t('diagram.notationComponent') }}</span>
            <select
              class="mp-select"
              :disabled="!activeNotationId || availableComponents.length === 0"
              :value="nodeBindingComponentId || ''"
              @change="emit('bindNodeComponent', ($event.target as HTMLSelectElement).value)"
            >
              <option value="" disabled>{{ t('diagram.selectComponent') }}</option>
              <option
                v-for="component in availableComponents"
                :key="component.id"
                :value="component.id"
              >
                {{ component.name }}
              </option>
            </select>
          </section>

          <section v-if="nodeProperties.length > 0" class="mp-section">
            <span class="mp-section__title">{{ t('types.properties') }}</span>
            <div class="mp-fields">
              <div v-for="property in nodeProperties" :key="property.id" class="mp-field">
                <label class="mp-field__label">{{ property.name }}</label>
                <div v-if="property.type === 'boolean'" class="mp-toggle">
                  <button
                    type="button"
                    class="mp-toggle__track"
                    :class="{ 'mp-toggle__track--on': Boolean(nodeScopedValues[property.name]) }"
                    role="switch"
                    :aria-checked="Boolean(nodeScopedValues[property.name])"
                    @click="
                      emit(
                        'setNodeScopedValue',
                        property.name,
                        !Boolean(nodeScopedValues[property.name])
                      )
                    "
                  >
                    <span class="mp-toggle__thumb"></span>
                  </button>
                  <span class="mp-toggle__label">{{
                    Boolean(nodeScopedValues[property.name]) ? t('common.yes') : t('common.no')
                  }}</span>
                </div>
                <select
                  v-else-if="property.type === 'enum'"
                  class="mp-select"
                  :value="
                    String(
                      nodeScopedValues[property.name] ??
                        property.enumDefault ??
                        property.defaultValue ??
                        ''
                    )
                  "
                  @change="
                    emit(
                      'setNodeScopedValue',
                      property.name,
                      ($event.target as HTMLSelectElement).value
                    )
                  "
                >
                  <option value="">{{ t('diagram.selectValue') }}</option>
                  <option
                    v-for="enumValue in property.enumValues ?? []"
                    :key="`${property.id}-${enumValue}`"
                    :value="enumValue"
                  >
                    {{ enumValue }}
                  </option>
                </select>
                <input
                  v-else
                  class="mp-input"
                  :type="property.type === 'number' ? 'number' : 'text'"
                  :placeholder="property.name"
                  :value="String(nodeScopedValues[property.name] ?? '')"
                  @input="
                    emit(
                      'setNodeScopedValue',
                      property.name,
                      coerceValue(property, ($event.target as HTMLInputElement).value)
                    )
                  "
                />
              </div>
            </div>
          </section>

          <div v-else-if="nodeBindingComponentId" class="mp-hint">
            {{ t('diagram.noConfigurableProperties') }}
          </div>
        </template>

        <!-- LINK binding -->
        <template v-if="currentMode === 'link' && selectedLink">
          <section class="mp-section">
            <span class="mp-section__title">{{ t('diagram.notationRelation') }}</span>
            <select
              class="mp-select"
              :disabled="!activeNotationId || availableRelations.length === 0"
              :value="linkBindingRelationId || ''"
              @change="emit('bindLinkRelation', ($event.target as HTMLSelectElement).value)"
            >
              <option value="" disabled>{{ t('diagram.selectRelation') }}</option>
              <option
                v-for="relation in availableRelations"
                :key="relation.id"
                :value="relation.id"
              >
                {{ relation.name }}
              </option>
            </select>
          </section>

          <section v-if="linkProperties.length > 0" class="mp-section">
            <span class="mp-section__title">{{ t('types.properties') }}</span>
            <div class="mp-fields">
              <div v-for="property in linkProperties" :key="property.id" class="mp-field">
                <label class="mp-field__label">{{ property.name }}</label>
                <div v-if="property.type === 'boolean'" class="mp-toggle">
                  <button
                    type="button"
                    class="mp-toggle__track"
                    :class="{ 'mp-toggle__track--on': Boolean(linkScopedValues[property.name]) }"
                    role="switch"
                    :aria-checked="Boolean(linkScopedValues[property.name])"
                    @click="
                      emit(
                        'setLinkScopedValue',
                        property.name,
                        !Boolean(linkScopedValues[property.name])
                      )
                    "
                  >
                    <span class="mp-toggle__thumb"></span>
                  </button>
                  <span class="mp-toggle__label">{{
                    Boolean(linkScopedValues[property.name]) ? t('common.yes') : t('common.no')
                  }}</span>
                </div>
                <select
                  v-else-if="property.type === 'enum'"
                  class="mp-select"
                  :value="
                    String(
                      linkScopedValues[property.name] ??
                        property.enumDefault ??
                        property.defaultValue ??
                        ''
                    )
                  "
                  @change="
                    emit(
                      'setLinkScopedValue',
                      property.name,
                      ($event.target as HTMLSelectElement).value
                    )
                  "
                >
                  <option value="">{{ t('diagram.selectValue') }}</option>
                  <option
                    v-for="enumValue in property.enumValues ?? []"
                    :key="`${property.id}-${enumValue}`"
                    :value="enumValue"
                  >
                    {{ enumValue }}
                  </option>
                </select>
                <input
                  v-else
                  class="mp-input"
                  :type="property.type === 'number' ? 'number' : 'text'"
                  :placeholder="property.name"
                  :value="String(linkScopedValues[property.name] ?? '')"
                  @input="
                    emit(
                      'setLinkScopedValue',
                      property.name,
                      coerceValue(property, ($event.target as HTMLInputElement).value)
                    )
                  "
                />
              </div>
            </div>
          </section>

          <div v-else-if="linkBindingRelationId" class="mp-hint">
            {{ t('diagram.noConfigurableProperties') }}
          </div>
        </template>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* ========================================
   Model Properties Panel
   ======================================== */

.mp {
  --mp-h: 30px;
  --mp-radius: 6px;
  --mp-pad: 12px;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  font-size: 12px;
  color: var(--base-text);
}

/* ---- Empty state ---- */
.mp-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 48px 24px;
  flex: 1;
}

.mp-empty__graphic {
  color: var(--border-strong);
  opacity: 0.6;
}

.mp-empty__text {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-muted);
}

.mp-empty__hint {
  font-size: 11px;
  color: var(--text-subtle);
}

/* ---- Type badge ---- */
.mp-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px var(--mp-pad);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.mp-badge__icon {
  flex-shrink: 0;
}

.mp-badge__label {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mp-badge--node {
  color: var(--primary);
  background: var(--primary-soft);
}

.mp-badge--link {
  color: var(--accent);
  background: var(--accent-soft);
}

/* ---- Scrollable body ---- */
.mp-body {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
}

.mp-body::-webkit-scrollbar {
  width: 5px;
}

.mp-body::-webkit-scrollbar-track {
  background: transparent;
}

.mp-body::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 3px;
}

.mp-body::-webkit-scrollbar-thumb:hover {
  background: var(--border-strong);
}

/* ---- Sections ---- */
.mp-section {
  padding: var(--mp-pad);
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-bottom: 1px solid var(--border);
}

.mp-section__title {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-subtle);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

/* ---- Inputs & Selects ---- */
.mp-select,
.mp-input {
  width: 100%;
  height: var(--mp-h);
  box-sizing: border-box;
  border: 1px solid var(--border);
  border-radius: var(--mp-radius);
  background: var(--surface-muted);
  color: var(--base-text);
  font-size: 12px;
  font-family: inherit;
  padding: 0 8px;
  outline: none;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.mp-select:focus,
.mp-input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px var(--primary-soft);
}

.mp-select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ---- Fields list ---- */
.mp-fields {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mp-field {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.mp-field__label {
  font-size: 11px;
  color: var(--text-muted);
}

/* ---- Toggle switch (replaces checkbox) ---- */
.mp-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mp-toggle__track {
  position: relative;
  width: 34px;
  height: 18px;
  border-radius: 9px;
  border: none;
  background: var(--border-strong);
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
  transition: background 0.2s ease;
}

.mp-toggle__track--on {
  background: var(--primary);
}

.mp-toggle__thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: white;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.mp-toggle__track--on .mp-toggle__thumb {
  transform: translateX(16px);
}

.mp-toggle__label {
  font-size: 11px;
  color: var(--text-muted);
  user-select: none;
}

/* ---- Hint ---- */
.mp-hint {
  padding: 14px var(--mp-pad);
  font-size: 11px;
  color: var(--text-subtle);
}

/* ---- Documentation button ---- */
.mp-doc-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  width: calc(100% - var(--mp-pad) * 2);
  margin: 6px var(--mp-pad);
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  color: var(--text-muted);
  background: var(--surface-strong);
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
}
.mp-doc-btn:hover {
  background: var(--primary-soft);
  border-color: var(--primary);
  color: var(--primary);
}
.mp-doc-btn .material-symbols-outlined {
  font-size: 16px;
}
.mp-doc-btn__badge {
  margin-left: auto;
  display: flex;
  align-items: center;
  color: var(--success, #22c55e);
}
.mp-doc-btn__badge .material-symbols-outlined {
  font-size: 14px;
}
</style>
