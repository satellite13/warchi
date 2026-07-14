<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import CollapseSection from './CollapseSection.vue'
import SearchableSelect from '@/components/forms/SearchableSelect.vue'
import MultiSelect from '@/components/forms/MultiSelect.vue'
import { createId } from '@/domain/attrs/notationAttrs'
import type { EditorComponent, EditorRelation, EditorRelationRule } from '../types'

const props = defineProps<{
  selectedItem: EditorComponent | EditorRelation | null
  allComponents?: EditorComponent[]
  allRelations?: EditorRelation[]
  nodeTypes?: Array<{ id: string; name: string }>
  linkTypes?: Array<{ id: string; name: string }>
  relationRules?: EditorRelationRule[]
  onMutateRelationRules?: (apply: (rules: EditorRelationRule[]) => void) => void
}>()

const { t } = useI18n()

const relationRulesExpanded = ref(false)
const UNTYPED_NAMES = new Set(['diagram only'])

const normalizeName = (value: string | undefined): string => value?.trim().toLowerCase() ?? ''
const isUntypedTypeName = (name: string | undefined): boolean => UNTYPED_NAMES.has(normalizeName(name))

const untypedNodeTypeIds = computed(
  () =>
    new Set(
      (props.nodeTypes ?? [])
        .filter(item => isUntypedTypeName(item.name))
        .map(item => item.id)
    )
)

const untypedLinkTypeIds = computed(
  () =>
    new Set(
      (props.linkTypes ?? [])
        .filter(item => isUntypedTypeName(item.name))
        .map(item => item.id)
    )
)

const isUntypedComponent = (component: EditorComponent): boolean =>
  untypedNodeTypeIds.value.has(component.nodeTypeId)

const isUntypedRelation = (relation: EditorRelation): boolean =>
  untypedLinkTypeIds.value.has(relation.linkTypeId)

const activeComponents = computed(() =>
  (props.allComponents ?? []).filter(item => !item._isDeleted && !isUntypedComponent(item))
)

const componentOptions = computed(() =>
  activeComponents.value.map(c => ({ id: c.id, label: c.name || t('common.unnamed') }))
)

const componentIconMap = computed(() => {
  const map = new Map<string, string>()
  for (const c of activeComponents.value) {
    const iconName = c.parsedAttrs.diagramStyle?.iconName?.trim()
    if (iconName) map.set(c.id, iconName)
  }
  return map
})

const buildIconUrl = (iconName: string): string => {
  if (iconName.startsWith('/')) return iconName
  if (iconName.toLowerCase().endsWith('.svg')) return `/icons/${iconName}`
  return `/icons/${iconName}.svg`
}

const activeRelations = computed(() =>
  (props.allRelations ?? []).filter(item => !item._isDeleted && !isUntypedRelation(item))
)

const relationOptions = computed(() =>
  activeRelations.value.map(r => ({ id: r.id, label: r.name || t('common.unnamed') }))
)

const selectedComponentRelationRules = computed(() => {
  if (!props.selectedItem || !props.relationRules) return []
  if ('linkTypeId' in props.selectedItem) return []
  if (isUntypedComponent(props.selectedItem)) return []
  return props.relationRules.filter(
    rule => rule.fromComponentId === props.selectedItem?.id && !rule._isDeleted
  )
})

const toggleRelationRulesCollapse = () => {
  relationRulesExpanded.value = !relationRulesExpanded.value
}

const setRelationRuleTarget = (rule: EditorRelationRule, targetId: string) => {
  const ruleId = rule.id
  const isNew = rule._isNew
  props.onMutateRelationRules?.(rules => {
    const r = rules.find(item => item.id === ruleId)
    if (!r) return
    r.toComponentId = targetId
    if (!isNew) r._isDirty = true
  })
}

const setRelationRuleRelations = (rule: EditorRelationRule, relationIds: string[]) => {
  const ruleId = rule.id
  const isNew = rule._isNew
  props.onMutateRelationRules?.(rules => {
    const r = rules.find(item => item.id === ruleId)
    if (!r) return
    r.allowedRelationIds = relationIds
    if (!isNew) r._isDirty = true
  })
}

const addRelationRule = () => {
  if (!props.selectedItem || !props.relationRules) return
  if ('linkTypeId' in props.selectedItem) return
  if (isUntypedComponent(props.selectedItem)) return
  const componentId = props.selectedItem.id
  const defaultTargetId =
    activeComponents.value.find(item => item.id !== componentId)?.id ?? componentId
  props.onMutateRelationRules?.(rules => {
    rules.push({
      id: createId(),
      fromComponentId: componentId,
      toComponentId: defaultTargetId,
      allowedRelationIds: [],
      _isNew: true,
    })
  })
  relationRulesExpanded.value = true
}

const removeRelationRule = (rule: EditorRelationRule) => {
  if (!props.relationRules) return
  const ruleId = rule.id
  const isNew = rule._isNew
  props.onMutateRelationRules?.(rules => {
    const idx = rules.findIndex(item => item.id === ruleId)
    if (idx === -1) return
    if (isNew) {
      rules.splice(idx, 1)
    } else {
      rules[idx]!._isDeleted = true
      rules[idx]!._isDirty = true
    }
  })
}
</script>

<template>
  <CollapseSection
    v-if="selectedItem && !('linkTypeId' in selectedItem) && !isUntypedComponent(selectedItem)"
    :label="t('diagram.linkRules')"
    :expanded="relationRulesExpanded"
    @toggle="toggleRelationRulesCollapse"
  >
    <template #header-extra>
      <button
        type="button"
        class="link-btn link-btn--icon"
        :title="t('diagram.addLinkRule')"
        :aria-label="t('diagram.addLinkRule')"
        @click.stop="addRelationRule"
      >
        <UiIcon name="add" />
      </button>
    </template>

    <div v-if="selectedComponentRelationRules.length === 0" class="rules-section__empty">
      {{ t('diagram.noRules') }}
    </div>
    <div v-else class="rules-section__list">
      <div v-for="rule in selectedComponentRelationRules" :key="rule.id" class="rules-section__row">
        <SearchableSelect
          class="rules-section__target"
          :model-value="rule.toComponentId"
          :options="componentOptions"
          :placeholder="t('diagram.selectComponent')"
          :search-placeholder="t('diagram.searchComponent')"
          :empty-text="t('common.nothingFound')"
          @update:model-value="setRelationRuleTarget(rule, $event)"
        >
          <template #selected="{ option }">
            <span class="rules-section__icon-option">
              <img
                v-if="componentIconMap.get(option.id)"
                class="rules-section__icon"
                :src="buildIconUrl(componentIconMap.get(option.id)!)"
                :alt="option.label"
              />
              {{ option.label }}
            </span>
          </template>
          <template #option="{ option }">
            <span class="rules-section__icon-option">
              <img
                v-if="componentIconMap.get(option.id)"
                class="rules-section__icon"
                :src="buildIconUrl(componentIconMap.get(option.id)!)"
                :alt="option.label"
              />
              {{ option.label }}
            </span>
          </template>
        </SearchableSelect>
        <MultiSelect
          class="rules-section__relations"
          :model-value="rule.allowedRelationIds"
          :options="relationOptions"
          :placeholder="t('diagram.selectLinks')"
          :search-placeholder="t('diagram.searchLink')"
          :empty-text="t('diagram.noNotationLinks')"
          @update:model-value="setRelationRuleRelations(rule, $event)"
        />
        <button
          type="button"
          class="rules-section__remove-btn"
          :title="t('common.delete')"
          @click="removeRelationRule(rule)"
        >
          <UiIcon name="close" />
        </button>
      </div>
    </div>
  </CollapseSection>
</template>

<style scoped>
.rules-section__empty {
  font-size: 12px;
  color: var(--text-subtle);
}

.rules-section__list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.rules-section__row {
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 28px;
}

.rules-section__target {
  flex: 1;
  min-width: 0;
}

.rules-section__relations {
  flex: 1;
  min-width: 0;
}

.rules-section__remove-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-subtle);
  cursor: pointer;
  flex-shrink: 0;
  transition:
    background 0.15s ease,
    color 0.15s ease;
}

.rules-section__remove-btn .ui-icon {
  font-size: 14px;
}

.rules-section__remove-btn:hover {
  background: var(--danger-soft);
  color: var(--danger);
}

.link-btn {
  background: none;
  border: none;
  color: var(--primary);
  cursor: pointer;
  font-size: 13px;
  font-family: inherit;
  padding: 0;
  text-decoration: underline;
}

.link-btn:hover {
  color: var(--primary-hover);
}

.link-btn--icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-strong);
  color: var(--text-muted);
  text-decoration: none;
  transition: all 0.15s ease;
}

.link-btn--icon .ui-icon {
  width: 16px;
  height: 16px;
}

.link-btn--icon:hover {
  background: var(--primary-soft);
  border-color: var(--primary);
  color: var(--primary);
}

/* Compact overrides for SearchableSelect inside rows */
.rules-section__target :deep(.searchable-select__control) {
  padding: 3px 6px;
  font-size: 12px;
  min-height: 24px;
}

.rules-section__icon-option {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rules-section__icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  opacity: 0.7;
}
</style>
