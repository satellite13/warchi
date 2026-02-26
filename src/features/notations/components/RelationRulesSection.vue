<script setup lang="ts">
import {computed, ref} from "vue";
import {useI18n} from "vue-i18n";
import CollapseSection from "./CollapseSection.vue";
import SearchableSelect from "../../../components/forms/SearchableSelect.vue";
import {createId} from "../notationAttrs";
import type {EditorComponent, EditorRelation, EditorRelationRule} from "../types";

const props = defineProps<{
  selectedItem: EditorComponent | EditorRelation | null
  allComponents?: EditorComponent[]
  allRelations?: EditorRelation[]
  relationRules?: EditorRelationRule[]
  onMutateRelationRules?: (apply: (rules: EditorRelationRule[]) => void) => void
}>();

const {t} = useI18n();

const relationRulesExpanded = ref(false);

const activeComponents = computed(() =>
  (props.allComponents ?? []).filter((item) => !item._isDeleted)
);

const componentOptions = computed(() =>
  activeComponents.value.map((c) => ({ id: c.id, label: c.name || t("common.unnamed") }))
);

const selectedComponentRelationRules = computed(() => {
  if (!props.selectedItem || !props.relationRules) return [];
  if ("linkTypeId" in props.selectedItem) return [];
  return props.relationRules.filter((rule) => rule.fromComponentId === props.selectedItem?.id && !rule._isDeleted);
});

const toggleRelationRulesCollapse = () => {
  relationRulesExpanded.value = !relationRulesExpanded.value;
};

const setRelationRuleTarget = (rule: EditorRelationRule, targetId: string) => {
  const ruleId = rule.id;
  const isNew = rule._isNew;
  props.onMutateRelationRules?.((rules) => {
    const r = rules.find((item) => item.id === ruleId);
    if (!r) return;
    r.toComponentId = targetId;
    if (!isNew) r._isDirty = true;
  });
};

const addRelationRule = () => {
  if (!props.selectedItem || !props.relationRules) return;
  if ("linkTypeId" in props.selectedItem) return;
  const componentId = props.selectedItem.id;
  props.onMutateRelationRules?.((rules) => {
    rules.push({
      id: createId(),
      fromComponentId: componentId,
      toComponentId: componentId,
      allowedRelationIds: [],
      _isNew: true
    });
  });
  relationRulesExpanded.value = true;
};

const removeRelationRule = (rule: EditorRelationRule) => {
  if (!props.relationRules) return;
  const ruleId = rule.id;
  const isNew = rule._isNew;
  props.onMutateRelationRules?.((rules) => {
    const idx = rules.findIndex((item) => item.id === ruleId);
    if (idx === -1) return;
    if (isNew) {
      rules.splice(idx, 1);
    } else {
      rules[idx]!._isDeleted = true;
      rules[idx]!._isDirty = true;
    }
  });
};

const toggleRelationRuleRelation = (rule: EditorRelationRule, relationId: string, checked: boolean) => {
  const ruleId = rule.id;
  const isNew = rule._isNew;
  props.onMutateRelationRules?.((rules) => {
    const r = rules.find((item) => item.id === ruleId);
    if (!r) return;
    const next = new Set(r.allowedRelationIds);
    if (checked) {
      next.add(relationId);
    } else {
      next.delete(relationId);
    }
    r.allowedRelationIds = Array.from(next.values());
    if (!isNew) r._isDirty = true;
  });
};
</script>

<template>
  <CollapseSection
    v-if="selectedItem && !('linkTypeId' in selectedItem)"
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
        <span class="material-symbols-outlined">add</span>
      </button>
    </template>

    <div v-if="selectedComponentRelationRules.length === 0" class="rules-section__empty">
      {{ t("diagram.noRules") }}
    </div>
    <div v-else class="rules-section__list">
      <div
        v-for="rule in selectedComponentRelationRules"
        :key="rule.id"
        class="rules-section__card"
      >
        <div class="rules-section__card-header">
          <span class="rules-section__card-title">
            {{ selectedItem.name || 'A' }} →
            {{ allComponents?.find((item) => item.id === rule.toComponentId)?.name || 'B' }}
          </span>
          <button
            type="button"
            class="rules-section__remove-btn"
            @click="removeRelationRule(rule)"
          >
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <div class="rules-section__row">
          <label class="rules-section__row-label">{{ t("diagram.ruleTo") }}</label>
          <SearchableSelect
            :model-value="rule.toComponentId"
            :options="componentOptions"
            :placeholder="t('diagram.selectComponent')"
            :search-placeholder="t('diagram.searchComponent')"
            :empty-text="t('common.nothingFound')"
            @update:model-value="setRelationRuleTarget(rule, $event)"
          />
        </div>
        <div class="rules-section__row">
          <label class="rules-section__row-label">{{ t("diagram.links") }}</label>
          <div v-if="!allRelations || allRelations.length === 0" class="rules-section__empty">
            {{ t("diagram.noNotationLinks") }}
          </div>
          <div v-else class="rules-section__links">
            <label
              v-for="relation in allRelations.filter((item) => !item._isDeleted)"
              :key="`${rule.id}-${relation.id}`"
              class="rules-section__link-item"
            >
              <input
                type="checkbox"
                :checked="rule.allowedRelationIds.includes(relation.id)"
                @change="toggleRelationRuleRelation(rule, relation.id, ($event.target as HTMLInputElement).checked)"
              >
              <span>{{ relation.name || t("common.unnamed") }}</span>
            </label>
          </div>
        </div>
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
  gap: 8px;
}

.rules-section__card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--surface-strong);
  border: 1px solid var(--border);
}

.rules-section__card:hover {
  border-color: var(--border-strong);
}

.rules-section__card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.rules-section__card-title {
  font-size: 12px;
  font-weight: 500;
  color: var(--base-text);
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
  transition: background 0.15s ease, color 0.15s ease;
}

.rules-section__remove-btn .material-symbols-outlined {
  font-size: 16px;
}

.rules-section__remove-btn:hover {
  background: var(--danger-soft);
  color: var(--danger);
}

.rules-section__row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.rules-section__row-label {
  width: 46px;
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.8;
}

.rules-section__links {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
}

.rules-section__link-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--base-text);
  cursor: pointer;
}

.rules-section__link-item input {
  accent-color: var(--primary);
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
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-strong);
  color: var(--text-muted);
  text-decoration: none;
  transition: all 0.15s ease;
}

.link-btn--icon .material-symbols-outlined {
  font-size: 16px;
}

.link-btn--icon:hover {
  background: var(--primary-soft);
  border-color: var(--primary);
  color: var(--primary);
}
</style>
