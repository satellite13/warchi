<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ComponentResponse, RelationResponse } from '@/types/api'
import type { EditorLink, EditorNode } from '../types'
import { parseEntityAttrs, type CustomProperty } from '@/domain/attrs/notationAttrs'
import type { DocumentWikiItem } from '@/composables/useWikiDocuments'
import { coercePropertyValue, regexTestProperty } from '@/utils/propertyUtils'
import SearchableSelect from '@/components/forms/SearchableSelect.vue'
import ToggleSwitch from '@/components/forms/ToggleSwitch.vue'

const props = withDefaults(
  defineProps<{
    activeNotationId: string | null
    selectedNode: EditorNode | null
    selectedLink: EditorLink | null
    nodeCustomProperties?: CustomProperty[]
    /** Схема свойств типа ноды; значения в `nodeTypeScopedValues` / attrs ноды `typeProperties` */
    nodeTypeCustomProperties?: CustomProperty[]
    nodeTypeScopedValues?: Record<string, unknown>
    nodeBindingComponentId: string | null
    linkBindingRelationId: string | null
    availableComponents: ComponentResponse[]
    availableRelations: RelationResponse[]
    nodeScopedValues: Record<string, unknown>
    linkScopedValues: Record<string, unknown>
    /** Diagrams for interactive property "diagram" (id + label with name and version) */
    diagrams?: { id: string; label: string }[]
    /** Documents already used in model for interactive property "document" */
    modelDocuments?: { fileId: string; label: string }[]
    /** Full wiki document list for document property dropdown (with search) */
    wikiDocuments?: DocumentWikiItem[]
    onOpenNodeDocument?: (node: EditorNode) => void
    readOnly?: boolean
  }>(),
  {
    readOnly: false,
    onOpenNodeDocument: undefined,
    diagrams: () => [],
    modelDocuments: () => [],
    wikiDocuments: () => [],
    nodeCustomProperties: () => [],
    nodeTypeCustomProperties: () => [],
    nodeTypeScopedValues: () => ({}),
  }
)

const emit = defineEmits<{
  bindNodeComponent: [componentId: string]
  bindLinkRelation: [relationId: string]
  setNodeTypePropertyValue: [key: string, value: unknown]
  setNodeScopedValue: [key: string, value: unknown]
  setLinkScopedValue: [key: string, value: unknown]
  createDocumentForProperty: [propertyName: string, scope?: 'nodeType' | 'notationComponent']
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
  if (props.nodeCustomProperties && props.nodeCustomProperties.length > 0) {
    return props.nodeCustomProperties
  }
  if (!selectedComponent.value) return []
  const customProperties = parseEntityAttrs(selectedComponent.value.attrs ?? null).customProperties
  return customProperties.filter(p => !p.system)
})
const linkProperties = computed<CustomProperty[]>(() => {
  if (!selectedRelation.value) return []
  const customProperties = parseEntityAttrs(selectedRelation.value.attrs ?? null).customProperties
  return customProperties.filter(p => !p.system)
})

const currentMode = computed<'node' | 'link' | 'empty'>(() => {
  if (props.selectedNode) return 'node'
  if (props.selectedLink) return 'link'
  return 'empty'
})

const coerceValue = coercePropertyValue
const regexTest = regexTestProperty

function documentDisplayLabel(item: DocumentWikiItem): string {
  const name =
    item.entityName ?? (item.entityType ? t('wiki.documentation') : item.label)
  if (item.parentName) return `${item.parentName} — ${name}`
  return name
}

const documentSelectOptions = computed(() => {
  const byId = new Map<string, string>()
  for (const d of props.wikiDocuments ?? []) {
    byId.set(d.fileId, documentDisplayLabel(d))
  }
  for (const d of props.modelDocuments ?? []) {
    if (!byId.has(d.fileId)) byId.set(d.fileId, d.label)
  }
  return Array.from(byId.entries(), ([id, label]) => ({ id, label }))
})

type NodePropSectionKey = 'node-type' | 'notation-component'

const nodePropertyDisplaySections = computed(() => {
  const sections: Array<{
    key: NodePropSectionKey
    titleKey: string
    properties: CustomProperty[]
    values: Record<string, unknown>
    docScope: 'nodeType' | 'notationComponent'
  }> = []
  const typeProps = props.nodeTypeCustomProperties ?? []
  if (typeProps.length > 0) {
    sections.push({
      key: 'node-type',
      titleKey: 'models.nodeTypeProperties',
      properties: typeProps,
      values: props.nodeTypeScopedValues ?? {},
      docScope: 'nodeType',
    })
  }
  if (
    props.activeNotationId &&
    nodeProperties.value.length > 0 &&
    props.nodeBindingComponentId
  ) {
    sections.push({
      key: 'notation-component',
      titleKey: 'models.notationComponentProperties',
      properties: nodeProperties.value,
      values: props.nodeScopedValues,
      docScope: 'notationComponent',
    })
  }
  return sections
})

function emitNodePropertyChange(
  sectionKey: NodePropSectionKey,
  key: string,
  value: unknown
): void {
  if (sectionKey === 'node-type') {
    emit('setNodeTypePropertyValue', key, value)
  } else {
    emit('setNodeScopedValue', key, value)
  }
}

function emitCreateDocForNodeProperty(sectionKey: NodePropSectionKey, propertyName: string): void {
  emit(
    'createDocumentForProperty',
    propertyName,
    sectionKey === 'node-type' ? 'nodeType' : 'notationComponent'
  )
}

/** Плейсхолдер для составной подписи на диаграмме */
function nodePropertyDiagramToken(sectionKey: NodePropSectionKey, propName: string): string {
  if (sectionKey === 'node-type') return '#' + '{' + propName + '}'
  return '$' + '{' + propName + '}'
}

type PropertiesSectionBlock = {
  kind: 'properties-section'
  section: {
    key: NodePropSectionKey
    titleKey: string
    properties: CustomProperty[]
    values: Record<string, unknown>
    docScope: 'nodeType' | 'notationComponent'
  }
}

/** Порядок: свойства типа ноды → выбор компонента нотации → свойства компонента на диаграмме */
const nodeEditorBlocks = computed(
  (): Array<PropertiesSectionBlock | { kind: 'notation-picker' }> => {
    const sections = nodePropertyDisplaySections.value
    const blocks: Array<PropertiesSectionBlock | { kind: 'notation-picker' }> = []
    for (const s of sections) {
      if (s.key === 'node-type') blocks.push({ kind: 'properties-section', section: s })
    }
    blocks.push({ kind: 'notation-picker' })
    for (const s of sections) {
      if (s.key === 'notation-component') blocks.push({ kind: 'properties-section', section: s })
    }
    return blocks
  }
)
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

      <!-- Documentation button (node only); при read-only без привязанного файла не предлагаем «создать» -->
      <button
        v-if="
          currentMode === 'node' &&
          selectedNode &&
          (!readOnly || !!selectedNode.parsedAttrs.documentFileId)
        "
        type="button"
        class="mp-doc-btn"
        @click="onOpenNodeDocument?.(selectedNode)"
      >
        <UiIcon name="description" />
        {{ t('models.documentation') }}
        <span v-if="selectedNode.parsedAttrs.documentFileId" class="mp-doc-btn__badge">
          <UiIcon name="check_circle" />
        </span>
      </button>

      <!-- Scrollable content -->
      <div class="mp-body">
        <!-- NODE binding -->
        <template v-if="currentMode === 'node' && selectedNode">
          <template v-for="(block, blockIndex) in nodeEditorBlocks" :key="blockIndex">
            <section
              v-if="block.kind === 'notation-picker' && activeNotationId"
              class="mp-section"
            >
              <span class="mp-section__title">{{ t('diagram.notationComponent') }}</span>
              <select
                class="mp-select"
                :disabled="readOnly || !activeNotationId || availableComponents.length === 0"
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

            <section
              v-else-if="block.kind === 'properties-section'"
              class="mp-section"
            >
              <span class="mp-section__title">{{ t(block.section.titleKey) }}</span>
              <div class="mp-fields">
                <div
                  v-for="property in block.section.properties"
                  :key="`${block.section.key}-${property.id}`"
                  class="mp-field"
                >
                  <label class="mp-field__label mp-field__label--stacked">
                    <span class="mp-field__label-row">
                      <span class="mp-field__name">{{ property.name }}</span>
                      <span
                        class="mp-field__source-badge"
                        :class="
                          block.section.key === 'node-type'
                            ? 'mp-field__source-badge--type'
                            : 'mp-field__source-badge--component'
                        "
                      >
                        {{
                          block.section.key === 'node-type'
                            ? t('models.propertySourceBadgeType')
                            : t('models.propertySourceBadgeComponent')
                        }}
                      </span>
                    </span>
                    <span
                      class="mp-field__diagram-token"
                      :title="t('models.propertyDiagramLabelTokenHint')"
                    >
                      {{ nodePropertyDiagramToken(block.section.key, property.name) }}
                    </span>
                  </label>
                  <select
                    v-if="
                      property.interactive &&
                      property.interactiveKind === 'diagram' &&
                      property.type === 'string' &&
                      diagrams.length > 0
                    "
                    class="mp-select"
                    :disabled="readOnly"
                    :value="String(block.section.values[property.name] ?? '')"
                    @change="
                      !readOnly &&
                        emitNodePropertyChange(
                          block.section.key,
                          property.name,
                          ($event.target as HTMLSelectElement).value
                        )
                    "
                  >
                    <option value="">{{ t('diagram.selectDiagram') }}</option>
                    <option
                      v-for="d in diagrams"
                      :key="d.id"
                      :value="d.id"
                    >
                      {{ d.label }}
                    </option>
                  </select>
                  <div
                    v-else-if="
                      property.interactive &&
                      property.interactiveKind === 'document' &&
                      property.type === 'string'
                    "
                    class="mp-doc-pick"
                  >
                    <SearchableSelect
                      :model-value="String(block.section.values[property.name] ?? '')"
                      :options="documentSelectOptions"
                      :placeholder="t('diagram.selectDocument')"
                      :search-placeholder="t('common.search')"
                      :empty-text="t('wiki.empty')"
                      :disabled="readOnly"
                      allow-empty
                      :empty-label="t('diagram.selectDocument')"
                      class="mp-doc-pick__select"
                      @update:model-value="
                        !readOnly &&
                          emitNodePropertyChange(block.section.key, property.name, $event)
                      "
                    />
                    <button
                      type="button"
                      class="mp-btn mp-btn--small mp-doc-pick__btn"
                      :disabled="readOnly"
                      @click="emitCreateDocForNodeProperty(block.section.key, property.name)"
                    >
                      {{ t('diagram.newDocument') }}
                    </button>
                  </div>
                  <ToggleSwitch
                    v-else-if="property.type === 'boolean'"
                    :model-value="Boolean(block.section.values[property.name])"
                    :disabled="readOnly"
                    @update:model-value="
                      emitNodePropertyChange(block.section.key, property.name, $event)
                    "
                  >
                    {{ Boolean(block.section.values[property.name]) ? t('common.yes') : t('common.no') }}
                  </ToggleSwitch>
                  <select
                    v-else-if="property.type === 'enum'"
                    class="mp-select"
                    :disabled="readOnly"
                    :value="
                      String(
                        block.section.values[property.name] ??
                          property.enumDefault ??
                          property.defaultValue ??
                          ''
                      )
                    "
                    @change="
                      !readOnly &&
                        emitNodePropertyChange(
                          block.section.key,
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
                  <div v-else class="mp-field__input-wrap">
                    <input
                      class="mp-input"
                      :class="{
                        'mp-input--error':
                          property.type === 'string' &&
                          regexTest(
                            property,
                            String(block.section.values[property.name] ?? '')
                          ) === false,
                      }"
                      :type="property.type === 'number' ? 'number' : 'text'"
                      :placeholder="property.name"
                      :readonly="readOnly"
                      :value="String(block.section.values[property.name] ?? '')"
                      @input="
                        !readOnly &&
                          emitNodePropertyChange(
                            block.section.key,
                            property.name,
                            coerceValue(property, ($event.target as HTMLInputElement).value)
                          )
                      "
                    />
                    <span
                      v-if="
                        property.type === 'string' &&
                        regexTest(
                          property,
                          String(block.section.values[property.name] ?? '')
                        ) === false
                      "
                      class="mp-field__error"
                    >
                      {{ t('types.regexNoMatch') }}
                    </span>
                  </div>
                </div>
              </div>
            </section>
          </template>

          <div v-if="nodeBindingComponentId && nodeProperties.length === 0" class="mp-hint">
            {{ t('diagram.noConfigurableProperties') }}
          </div>
        </template>

        <!-- LINK binding -->
        <template v-if="currentMode === 'link' && selectedLink">
          <section class="mp-section">
            <span class="mp-section__title">{{ t('diagram.notationRelation') }}</span>
            <select
              class="mp-select"
              :disabled="readOnly || !activeNotationId || availableRelations.length === 0"
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
                <ToggleSwitch
                  v-if="property.type === 'boolean'"
                  :model-value="Boolean(linkScopedValues[property.name])"
                  :disabled="readOnly"
                  @update:model-value="emit('setLinkScopedValue', property.name, $event)"
                >
                  {{ Boolean(linkScopedValues[property.name]) ? t('common.yes') : t('common.no') }}
                </ToggleSwitch>
                <select
                  v-else-if="property.type === 'enum'"
                  class="mp-select"
                  :disabled="readOnly"
                  :value="
                    String(
                      linkScopedValues[property.name] ??
                        property.enumDefault ??
                        property.defaultValue ??
                        ''
                    )
                  "
                  @change="
                    !readOnly &&
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
                <div v-else class="mp-field__input-wrap">
                  <input
                    class="mp-input"
                    :class="{ 'mp-input--error': property.type === 'string' && regexTest(property, String(linkScopedValues[property.name] ?? '')) === false }"
                    :type="property.type === 'number' ? 'number' : 'text'"
                    :placeholder="property.name"
                    :readonly="readOnly"
                    :value="String(linkScopedValues[property.name] ?? '')"
                    @input="
                      !readOnly &&
                        emit(
                          'setLinkScopedValue',
                          property.name,
                          coerceValue(property, ($event.target as HTMLInputElement).value)
                        )
                    "
                  />
                  <span
                    v-if="property.type === 'string' && regexTest(property, String(linkScopedValues[property.name] ?? '')) === false"
                    class="mp-field__error"
                  >
                    {{ t('types.regexNoMatch') }}
                  </span>
                </div>
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

.mp-field__label--stacked {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
}

.mp-field__label-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.mp-field__name {
  font-weight: 500;
  color: var(--base-text);
}

.mp-field__source-badge {
  font-size: 10px;
  font-weight: 600;
  line-height: 1.2;
  padding: 2px 6px;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.mp-field__source-badge--type {
  color: var(--primary);
  background: var(--primary-soft);
}

.mp-field__source-badge--component {
  color: var(--text-muted);
  background: var(--surface-muted);
  border: 1px solid var(--border);
}

.mp-field__diagram-token {
  font-family: ui-monospace, monospace;
  font-size: 10px;
  color: var(--text-subtle);
  user-select: all;
}

.mp-field__input-wrap {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.mp-input--error {
  border-color: var(--danger);
}

.mp-field__error {
  font-size: 11px;
  color: var(--danger);
}

.mp-doc-pick {
  display: flex;
  gap: 6px;
  align-items: center;
}

.mp-doc-pick__select {
  flex: 1;
  min-width: 0;
}

.mp-doc-pick__btn {
  flex-shrink: 0;
}

.mp-btn {
  height: var(--mp-h);
  padding: 0 10px;
  border-radius: var(--mp-radius);
  border: 1px solid var(--border);
  background: var(--surface-muted);
  color: var(--base-text);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
}

.mp-btn:hover:not(:disabled) {
  border-color: var(--primary);
  color: var(--primary);
}

.mp-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.mp-btn--small {
  padding: 0 8px;
  font-size: 11px;
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
.mp-doc-btn .ui-icon {
  font-size: 16px;
}
.mp-doc-btn__badge {
  margin-left: auto;
  display: flex;
  align-items: center;
  color: var(--success, #22c55e);
}
.mp-doc-btn__badge .ui-icon {
  font-size: 14px;
}
</style>
