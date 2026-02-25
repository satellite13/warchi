<script setup lang="ts">
/* eslint-disable vue/no-mutating-props -- editing shared draft objects in notation editor */
import {computed, reactive, ref, watch, onMounted, onBeforeUnmount} from "vue";
import { useI18n } from "vue-i18n";
import BaseModal from "../../../components/modals/BaseModal.vue";
import {createId, type CustomProperty, type CustomPropertyType} from "../notationAttrs";
import type {EditorComponent, EditorRelation, EditorRelationRule} from "../types";
import {useCustomProperties} from "../composables/useCustomProperties";

const props = defineProps<{
  selectedItem: EditorComponent | EditorRelation | null;
  nodeTypes?: Array<{ id: string; name: string }>;
  linkTypes?: Array<{ id: string; name: string }>;
  typeProperties?: CustomProperty[];
  allComponents?: EditorComponent[];
  allRelations?: EditorRelation[];
  relationRules?: EditorRelationRule[];
  isComponentTypeLocked?: boolean;
  isRelationTypeLocked?: boolean;
  onComponentTypeChange?: (componentId: string, nodeTypeId: string) => void;
  onRelationTypeChange?: (relationId: string, linkTypeId: string) => void;
  onCreateNodeType?: (componentId: string, nodeTypeName: string) => void;
  onCreateRelationType?: (relationId: string, linkTypeName: string) => void;
  onItemChanged?: (id: string) => void;
  onRelationRulesChanged?: () => void;
  onResetPanelSize?: () => void;
}>();

const selectedItemComputed = computed(() => props.selectedItem);
const { t } = useI18n();

const {
  addCustomProperty,
  addCustomPropertyFromType,
  removeCustomProperty,
  updateEnumValues,
  parseNumberInput,
  propertyErrors
} = useCustomProperties(selectedItemComputed, props.onItemChanged);

const parseTagsInput = (value: string) =>
  Array.from(
    new Set(
      value
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
    )
  );

const sameTags = (a: string[], b: string[]) =>
  a.length === b.length && a.every((tag, idx) => tag === b[idx]);

const tagsDraft = ref("");
const tagsExpanded = ref(false);
const paletteGroupExpanded = ref(false);
const labelTemplateExpanded = ref(false);
const propertiesExpanded = ref(false);

const ruleTargetSearchQuery = ref("");
const openRuleTargetDropdownId = ref<string | null>(null);

const activeComponents = computed(() =>
  (props.allComponents ?? []).filter((item) => !item._isDeleted)
);

const filteredRuleTargetComponents = computed(() => {
  const query = ruleTargetSearchQuery.value.trim().toLowerCase();
  if (!query) return activeComponents.value;
  return activeComponents.value.filter((c) => (c.name || "").toLowerCase().includes(query));
});

const toggleRuleTargetDropdown = (ruleId: string) => {
  if (openRuleTargetDropdownId.value === ruleId) {
    openRuleTargetDropdownId.value = null;
  } else {
    openRuleTargetDropdownId.value = ruleId;
    ruleTargetSearchQuery.value = "";
  }
};

const selectRuleTarget = (rule: EditorRelationRule, componentId: string) => {
  setRelationRuleTarget(rule, componentId);
  openRuleTargetDropdownId.value = null;
};

const handleClickOutsideRuleDropdown = (e: MouseEvent) => {
  if (!openRuleTargetDropdownId.value) return;
  const target = e.target as HTMLElement;
  if (!target.closest(".rule-target-dropdown")) {
    openRuleTargetDropdownId.value = null;
  }
};

onMounted(() => {
  document.addEventListener("click", handleClickOutsideRuleDropdown);
});

onBeforeUnmount(() => {
  document.removeEventListener("click", handleClickOutsideRuleDropdown);
});

watch(
  () => [props.selectedItem?.id, props.selectedItem?.parsedAttrs.tags.join("|") ?? ""],
  () => {
    tagsDraft.value = props.selectedItem?.parsedAttrs.tags.join(", ") ?? "";
  },
  {immediate: true}
);

const handleTagsInput = (value: string) => {
  tagsDraft.value = value;
};

const toggleTagsCollapse = () => {
  tagsExpanded.value = !tagsExpanded.value;
};

const togglePaletteGroupCollapse = () => {
  paletteGroupExpanded.value = !paletteGroupExpanded.value;
};

const toggleLabelTemplateCollapse = () => {
  labelTemplateExpanded.value = !labelTemplateExpanded.value;
};

const togglePropertiesCollapse = () => {
  propertiesExpanded.value = !propertiesExpanded.value;
};

const labelTemplateValue = computed(() => {
  if (!props.selectedItem) return "";
  return props.selectedItem.parsedAttrs.diagramStyle?.labelTemplate ?? "";
});

const labelTemplatePreview = computed(() => {
  const item = props.selectedItem;
  if (!item) return "";
  const template = item.parsedAttrs.diagramStyle?.labelTemplate;
  if (!template) return item.name;
  return template.replace(/\$\{(\w+)\}/g, (_match: string, key: string) => {
    if (key === "name") return item.name;
    const prop = item.parsedAttrs.customProperties.find((p) => p.name === key);
    if (prop) {
      const val = prop.defaultValue;
      return val != null ? String(val) : "";
    }
    return "";
  }).replace(/\\n/g, "\n");
});

const handleLabelTemplateInput = (value: string) => {
  if (!props.selectedItem) return;
  if (!props.selectedItem.parsedAttrs.diagramStyle) {
    props.selectedItem.parsedAttrs.diagramStyle = {};
  }
  if (value) {
    props.selectedItem.parsedAttrs.diagramStyle.labelTemplate = value;
  } else {
    delete props.selectedItem.parsedAttrs.diagramStyle.labelTemplate;
  }
  props.onItemChanged?.(props.selectedItem.id);
};

const applyTagsDraft = () => {
  if (!props.selectedItem) return;
  const nextTags = parseTagsInput(tagsDraft.value);
  const currentTags = props.selectedItem.parsedAttrs.tags ?? [];
  if (sameTags(currentTags, nextTags)) {
    tagsDraft.value = currentTags.join(", ");
    return;
  }
  props.selectedItem.parsedAttrs.tags = nextTags;
  tagsDraft.value = nextTags.join(", ");
  props.onItemChanged?.(props.selectedItem.id);
};

const removeTag = (tag: string) => {
  if (!props.selectedItem) return;
  props.selectedItem.parsedAttrs.tags = props.selectedItem.parsedAttrs.tags.filter((item) => item !== tag);
  tagsDraft.value = props.selectedItem.parsedAttrs.tags.join(", ");
  props.onItemChanged?.(props.selectedItem.id);
};

const handlePaletteGroupChange = (value: string) => {
  if (!props.selectedItem || "linkTypeId" in props.selectedItem) return;
  const num = parseInt(value, 10);
  if (Number.isInteger(num) && num >= 0) {
    props.selectedItem.parsedAttrs.paletteGroup = num;
  } else if (value === "" || value === "-") {
    delete props.selectedItem.parsedAttrs.paletteGroup;
  }
  props.onItemChanged?.(props.selectedItem.id);
};

const selectedNodeTypeId = computed(() => {
  if (!props.selectedItem) return "";
  if ("linkTypeId" in props.selectedItem) return "";
  return props.selectedItem.nodeTypeId;
});

const selectedLinkTypeId = computed(() => {
  if (!props.selectedItem) return "";
  if ("linkTypeId" in props.selectedItem) return props.selectedItem.linkTypeId;
  return "";
});

const CREATE_NODE_TYPE_VALUE = "__create_node_type__";
const CREATE_RELATION_TYPE_VALUE = "__create_relation_type__";
const nodeTypeExpanded = ref(false);
const relationTypeExpanded = ref(false);
const showCreateNodeTypeDialog = ref(false);
const newNodeTypeName = ref("");
const newNodeTypeError = ref<string | null>(null);
const showCreateRelationTypeDialog = ref(false);
const newRelationTypeName = ref("");
const newRelationTypeError = ref<string | null>(null);

const toggleNodeTypeCollapse = () => {
  nodeTypeExpanded.value = !nodeTypeExpanded.value;
};

const toggleRelationTypeCollapse = () => {
  relationTypeExpanded.value = !relationTypeExpanded.value;
};

const openCreateNodeTypeDialog = () => {
  newNodeTypeName.value = "";
  newNodeTypeError.value = null;
  showCreateNodeTypeDialog.value = true;
};

const closeCreateNodeTypeDialog = () => {
  showCreateNodeTypeDialog.value = false;
  newNodeTypeName.value = "";
  newNodeTypeError.value = null;
};

const submitCreateNodeType = () => {
  if (!props.selectedItem || "linkTypeId" in props.selectedItem) return;
  const trimmedName = newNodeTypeName.value.trim();
  if (!trimmedName) {
    newNodeTypeError.value = t("types.enterNodeTypeName");
    return;
  }
  props.onCreateNodeType?.(props.selectedItem.id, trimmedName);
  closeCreateNodeTypeDialog();
};

const openCreateRelationTypeDialog = () => {
  newRelationTypeName.value = "";
  newRelationTypeError.value = null;
  showCreateRelationTypeDialog.value = true;
};

const closeCreateRelationTypeDialog = () => {
  showCreateRelationTypeDialog.value = false;
  newRelationTypeName.value = "";
  newRelationTypeError.value = null;
};

const submitCreateRelationType = () => {
  if (!props.selectedItem || !("linkTypeId" in props.selectedItem)) return;
  const trimmedName = newRelationTypeName.value.trim();
  if (!trimmedName) {
    newRelationTypeError.value = t("types.enterLinkTypeName");
    return;
  }
  props.onCreateRelationType?.(props.selectedItem.id, trimmedName);
  closeCreateRelationTypeDialog();
};

const handleComponentTypeChange = (nextNodeTypeId: string) => {
  if (!props.selectedItem || "linkTypeId" in props.selectedItem) return;
  if (nextNodeTypeId === CREATE_NODE_TYPE_VALUE) {
    openCreateNodeTypeDialog();
    return;
  }
  if (!nextNodeTypeId || nextNodeTypeId === props.selectedItem.nodeTypeId) return;
  props.onComponentTypeChange?.(props.selectedItem.id, nextNodeTypeId);
};

const handleRelationTypeChange = (nextLinkTypeId: string) => {
  if (!props.selectedItem || !("linkTypeId" in props.selectedItem)) return;
  if (nextLinkTypeId === CREATE_RELATION_TYPE_VALUE) {
    openCreateRelationTypeDialog();
    return;
  }
  if (!nextLinkTypeId || nextLinkTypeId === props.selectedItem.linkTypeId) return;
  props.onRelationTypeChange?.(props.selectedItem.id, nextLinkTypeId);
};

const relationRulesExpanded = ref(false);
const selectedComponentRelationRules = computed(() => {
  if (!props.selectedItem || !props.relationRules) return [];
  if ("linkTypeId" in props.selectedItem) return [];
  return props.relationRules.filter((rule) => rule.fromComponentId === props.selectedItem?.id && !rule._isDeleted);
});

const toggleRelationRulesCollapse = () => {
  relationRulesExpanded.value = !relationRulesExpanded.value;
};

const addRelationRule = () => {
  if (!props.selectedItem || !props.relationRules) return;
  if ("linkTypeId" in props.selectedItem) return;
  const componentId = props.selectedItem.id;
  props.relationRules.push({
    id: createId(),
    fromComponentId: componentId,
    toComponentId: componentId,
    allowedRelationIds: [],
    _isNew: true
  });
  relationRulesExpanded.value = true;
  props.onRelationRulesChanged?.();
};

const removeRelationRule = (rule: EditorRelationRule) => {
  if (!props.relationRules) return;
  const idx = props.relationRules.findIndex((item) => item.id === rule.id);
  if (idx === -1) return;
  if (rule._isNew) {
    props.relationRules.splice(idx, 1);
  } else {
    props.relationRules[idx]!._isDeleted = true;
    props.relationRules[idx]!._isDirty = true;
  }
  props.onRelationRulesChanged?.();
};

const setRelationRuleTarget = (rule: EditorRelationRule, targetId: string) => {
  rule.toComponentId = targetId;
  if (!rule._isNew) rule._isDirty = true;
  props.onRelationRulesChanged?.();
};

const toggleRelationRuleRelation = (rule: EditorRelationRule, relationId: string, checked: boolean) => {
  const next = new Set(rule.allowedRelationIds);
  if (checked) {
    next.add(relationId);
  } else {
    next.delete(relationId);
  }
  rule.allowedRelationIds = Array.from(next.values());
  if (!rule._isNew) rule._isDirty = true;
  props.onRelationRulesChanged?.();
};

const typeOptions: { value: CustomPropertyType; label: string }[] = [
  {value: "string", label: t("types.propertyTypeString")},
  {value: "number", label: t("types.propertyTypeNumber")},
  {value: "boolean", label: t("types.propertyTypeBoolean")},
  {value: "enum", label: t("types.propertyTypeEnum")}
];

const handleTypeChange = (property: CustomProperty, value: string) => {
  property.type = value as CustomPropertyType;
  property.defaultValue = undefined;
  property.enumDefault = undefined;
  if (props.selectedItem && props.onItemChanged) {
    props.onItemChanged(props.selectedItem.id);
  }
};

const handleNameChange = (property: CustomProperty, value: string) => {
  property.name = value;
  if (props.selectedItem && props.onItemChanged) {
    props.onItemChanged(props.selectedItem.id);
  }
};

const handleRequiredChange = (property: CustomProperty, checked: boolean) => {
  property.required = checked;
  if (props.selectedItem && props.onItemChanged) {
    props.onItemChanged(props.selectedItem.id);
  }
};

const handleRegexChange = (property: CustomProperty, value: string) => {
  property.regex = value;
  if (props.selectedItem && props.onItemChanged) {
    props.onItemChanged(props.selectedItem.id);
  }
};

const handleMinChange = (property: CustomProperty, value: string) => {
  property.min = parseNumberInput(value);
  if (props.selectedItem && props.onItemChanged) {
    props.onItemChanged(props.selectedItem.id);
  }
};

const handleMaxChange = (property: CustomProperty, value: string) => {
  property.max = parseNumberInput(value);
  if (props.selectedItem && props.onItemChanged) {
    props.onItemChanged(props.selectedItem.id);
  }
};

const expandedIds = reactive(new Set<string>());

const toggleCollapse = (id: string) => {
  if (expandedIds.has(id)) {
    expandedIds.delete(id);
  } else {
    expandedIds.add(id);
  }
};

const typeLabel = (type: CustomPropertyType) =>
  typeOptions.find(o => o.value === type)?.label ?? type;

const handleMaxLengthChange = (property: CustomProperty, value: string) => {
  property.maxLength = parseNumberInput(value);
  if (props.selectedItem && props.onItemChanged) {
    props.onItemChanged(props.selectedItem.id);
  }
};

const handleEnumDefaultChange = (property: CustomProperty, value: string) => {
  const nextValue = value || undefined;
  property.defaultValue = nextValue;
  property.enumDefault = nextValue;
  if (props.selectedItem && props.onItemChanged) {
    props.onItemChanged(props.selectedItem.id);
  }
};

const handleDefaultStringChange = (property: CustomProperty, value: string) => {
  property.defaultValue = value;
  if (props.selectedItem && props.onItemChanged) {
    props.onItemChanged(props.selectedItem.id);
  }
};

const handleDefaultNumberChange = (property: CustomProperty, value: string) => {
  property.defaultValue = parseNumberInput(value) ?? undefined;
  if (props.selectedItem && props.onItemChanged) {
    props.onItemChanged(props.selectedItem.id);
  }
};

const handleDefaultBooleanChange = (property: CustomProperty, value: string) => {
  if (value === "true") {
    property.defaultValue = true;
  } else if (value === "false") {
    property.defaultValue = false;
  } else {
    property.defaultValue = undefined;
  }
  if (props.selectedItem && props.onItemChanged) {
    props.onItemChanged(props.selectedItem.id);
  }
};

// Regex tester
const regexTestValues = reactive(new Map<string, string>());

const getRegexTestValue = (id: string) => regexTestValues.get(id) ?? "";

const setRegexTestValue = (id: string, value: string) => {
  regexTestValues.set(id, value);
};

const regexTestResult = (property: CustomProperty): null | boolean => {
  const testVal = regexTestValues.get(property.id);
  if (testVal === undefined || testVal === "") return null;
  if (!property.regex) return null;
  try {
    return new RegExp(property.regex).test(testVal);
  } catch {
    return null;
  }
};

const showAddMenu = ref(false);
const addMenuRef = ref<HTMLElement | null>(null);

const sameStringArray = (a?: string[], b?: string[]) => {
  const aa = a ?? [];
  const bb = b ?? [];
  if (aa.length !== bb.length) return false;
  return aa.every((value, idx) => value === bb[idx]);
};

const isEquivalentProperty = (a: CustomProperty, b: CustomProperty) =>
  a.name === b.name &&
  a.type === b.type &&
  a.required === b.required &&
  (a.regex ?? "") === (b.regex ?? "") &&
  a.min === b.min &&
  a.max === b.max &&
  (a.maxLength ?? null) === (b.maxLength ?? null) &&
  sameStringArray(a.enumValues, b.enumValues) &&
  (a.defaultValue ?? "") === (b.defaultValue ?? "") &&
  (a.enumDefault ?? "") === (b.enumDefault ?? "");

const isEquivalentToTypeProperty = (property: CustomProperty) => {
  const typeProps = props.typeProperties ?? [];
  return typeProps.some((typeProp) => isEquivalentProperty(property, typeProp));
};

const missingTypeProperties = computed(() => {
  if (!props.selectedItem) return [];
  const current = props.selectedItem.parsedAttrs.customProperties;
  const typeProps = props.typeProperties ?? [];
  return typeProps.filter((typeProp) => !current.some((prop) => isEquivalentProperty(prop, typeProp)));
});

const toggleAddMenu = () => {
  showAddMenu.value = !showAddMenu.value;
};

const addNewProperty = () => {
  addCustomProperty();
  showAddMenu.value = false;
};

const addMissingTypeProperty = (property: CustomProperty) => {
  addCustomPropertyFromType(property);
  showAddMenu.value = false;
};

const closeAddMenuOnOutsideClick = (event: MouseEvent) => {
  if (!showAddMenu.value) return;
  const target = event.target as Node | null;
  if (!target) return;
  if (!addMenuRef.value?.contains(target)) {
    showAddMenu.value = false;
  }
};

const closeAddMenuOnEscape = (event: KeyboardEvent) => {
  if (event.key === "Escape") {
    showAddMenu.value = false;
  }
};

onMounted(() => {
  document.addEventListener("mousedown", closeAddMenuOnOutsideClick);
  document.addEventListener("keydown", closeAddMenuOnEscape);
});

onBeforeUnmount(() => {
  document.removeEventListener("mousedown", closeAddMenuOnOutsideClick);
  document.removeEventListener("keydown", closeAddMenuOnEscape);
});
</script>

<template>
  <div class="properties-panel">
    <div class="properties-panel__header">
      <h3 class="properties-panel__title">{{ t("types.properties") }}</h3>
      <span v-if="selectedItem" class="properties-panel__entity-name">{{ selectedItem.name }}</span>
      <div class="properties-panel__size-controls">
        <button
          type="button"
          class="properties-panel__size-btn"
          :title="t('types.resetPanelSize')"
          @click="props.onResetPanelSize?.()"
        >
          <span class="material-symbols-outlined">restart_alt</span>
        </button>
      </div>
    </div>

    <div v-if="!selectedItem" class="properties-panel__empty properties-panel__empty--centered">
      <span class="material-symbols-outlined properties-panel__empty-icon">edit_note</span>
      <span>{{ t("diagram.selectElementToEditProperties") }}</span>
    </div>

    <div v-else class="properties-panel__content">
      <div class="properties-panel__type">
        <div v-if="selectedItem && !('linkTypeId' in selectedItem)" class="properties-panel__type-label">
          <div
            class="properties-panel__type-header"
            role="button"
            tabindex="0"
            @click="toggleNodeTypeCollapse"
            @keydown.enter.prevent="toggleNodeTypeCollapse"
            @keydown.space.prevent="toggleNodeTypeCollapse"
          >
            <span
              class="material-symbols-outlined properties-panel__type-chevron"
              :class="{ 'properties-panel__type-chevron--collapsed': !nodeTypeExpanded }"
            >expand_more</span>
            <span class="properties-panel__type-collapse-label">{{ t("types.nodeType") }}</span>
          </div>
        </div>
        <template v-if="selectedItem && !('linkTypeId' in selectedItem) && nodeTypeExpanded">
          <select
            class="property-select properties-panel__type-select"
            :value="selectedNodeTypeId"
            :disabled="props.isComponentTypeLocked"
            @change="handleComponentTypeChange(($event.target as HTMLSelectElement).value)"
          >
            <option :value="CREATE_NODE_TYPE_VALUE">{{ t("types.createNewType") }}</option>
            <option
              v-for="typeItem in (props.nodeTypes ?? [])"
              :key="typeItem.id"
              :value="typeItem.id"
            >
              {{ typeItem.name }}
            </option>
          </select>
          <div v-if="props.isComponentTypeLocked" class="properties-panel__type-hint">
            {{ t("types.componentTypeLockedHint") }}
          </div>
        </template>
        <template v-else-if="selectedItem && 'linkTypeId' in selectedItem">
          <div
            class="properties-panel__type-header"
            role="button"
            tabindex="0"
            @click="toggleRelationTypeCollapse"
            @keydown.enter.prevent="toggleRelationTypeCollapse"
            @keydown.space.prevent="toggleRelationTypeCollapse"
          >
            <span
              class="material-symbols-outlined properties-panel__type-chevron"
              :class="{ 'properties-panel__type-chevron--collapsed': !relationTypeExpanded }"
            >expand_more</span>
            <span class="properties-panel__type-collapse-label">{{ t("types.linkType") }}</span>
          </div>
          <template v-if="relationTypeExpanded">
            <select
              class="property-select properties-panel__type-select"
              :value="selectedLinkTypeId"
              :disabled="props.isRelationTypeLocked"
              @change="handleRelationTypeChange(($event.target as HTMLSelectElement).value)"
            >
              <option :value="CREATE_RELATION_TYPE_VALUE">{{ t("types.createNewLink") }}</option>
              <option
                v-for="typeItem in (props.linkTypes ?? [])"
                :key="typeItem.id"
                :value="typeItem.id"
              >
                {{ typeItem.name }}
              </option>
            </select>
            <div v-if="props.isRelationTypeLocked" class="properties-panel__type-hint">
              {{ t("types.relationTypeLockedHint") }}
            </div>
          </template>
        </template>
      </div>

      <div v-if="selectedItem && !('linkTypeId' in selectedItem)" class="properties-panel__palette-group">
        <div
          class="properties-panel__palette-group-header"
          role="button"
          tabindex="0"
          @click="togglePaletteGroupCollapse"
          @keydown.enter.prevent="togglePaletteGroupCollapse"
          @keydown.space.prevent="togglePaletteGroupCollapse"
        >
          <span
            class="material-symbols-outlined properties-panel__palette-group-chevron"
            :class="{ 'properties-panel__palette-group-chevron--collapsed': !paletteGroupExpanded }"
          >expand_more</span>
          <span class="properties-panel__palette-group-label">{{ t("diagram.paletteGroup") }}</span>
        </div>
        <template v-if="paletteGroupExpanded">
          <input
            type="number"
            min="0"
            class="property-input properties-panel__palette-group-input"
            :value="selectedItem.parsedAttrs.paletteGroup ?? 0"
            placeholder="0"
            @input="handlePaletteGroupChange(($event.target as HTMLInputElement).value)"
          >
          <span class="properties-panel__palette-group-hint">{{ t("diagram.paletteGroupHint") }}</span>
        </template>
      </div>

      <div class="properties-panel__tags">
        <div
          class="properties-panel__tags-header"
          role="button"
          tabindex="0"
          @click="toggleTagsCollapse"
          @keydown.enter.prevent="toggleTagsCollapse"
          @keydown.space.prevent="toggleTagsCollapse"
        >
          <span
            class="material-symbols-outlined properties-panel__tags-chevron"
            :class="{ 'properties-panel__tags-chevron--collapsed': !tagsExpanded }"
          >expand_more</span>
          <label class="properties-panel__tags-label" for="entity-tags-input">{{ t("diagram.tags") }}</label>
        </div>
        <template v-if="tagsExpanded">
          <input
            id="entity-tags-input"
            class="properties-panel__tags-input"
            :value="tagsDraft"
            :placeholder="t('diagram.tagsPlaceholder')"
            @input="handleTagsInput(($event.target as HTMLInputElement).value)"
            @blur="applyTagsDraft"
            @keydown.enter.prevent="applyTagsDraft"
          >
          <div v-if="selectedItem.parsedAttrs.tags.length > 0" class="properties-panel__tags-list">
            <button
              v-for="tag in selectedItem.parsedAttrs.tags"
              :key="`tag-${tag}`"
              type="button"
              class="properties-panel__tag-chip"
              @click="removeTag(tag)"
            >
              {{ tag }}
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>
        </template>
      </div>

      <!-- Label template section (only for components) -->
      <div v-if="selectedItem && !('linkTypeId' in selectedItem)" class="properties-panel__label-template">
        <div
          class="properties-panel__label-template-header"
          role="button"
          tabindex="0"
          @click="toggleLabelTemplateCollapse"
          @keydown.enter.prevent="toggleLabelTemplateCollapse"
          @keydown.space.prevent="toggleLabelTemplateCollapse"
        >
          <span
            class="material-symbols-outlined properties-panel__label-template-chevron"
            :class="{ 'properties-panel__label-template-chevron--collapsed': !labelTemplateExpanded }"
          >expand_more</span>
          <span class="properties-panel__label-template-label">{{ t("diagram.compositeLabel") }}</span>
        </div>
        <template v-if="labelTemplateExpanded">
          <textarea
            class="properties-panel__label-template-input"
            :value="labelTemplateValue"
            :placeholder="t('diagram.compositeLabelPlaceholder')"
            rows="2"
            @input="handleLabelTemplateInput(($event.target as HTMLTextAreaElement).value)"
          ></textarea>
          <div v-if="labelTemplateValue" class="properties-panel__label-template-preview">
            <span class="properties-panel__label-template-preview-label">{{ t("diagram.resultLabel") }}:</span>
            <span class="properties-panel__label-template-preview-text">{{ labelTemplatePreview }}</span>
          </div>
        </template>
      </div>

      <div v-if="selectedItem && !('linkTypeId' in selectedItem)" class="properties-panel__rules">
        <div
          class="properties-panel__rules-header"
          role="button"
          tabindex="0"
          @click="toggleRelationRulesCollapse"
          @keydown.enter.prevent="toggleRelationRulesCollapse"
          @keydown.space.prevent="toggleRelationRulesCollapse"
        >
          <span
            class="material-symbols-outlined properties-panel__rules-chevron"
            :class="{ 'properties-panel__rules-chevron--collapsed': !relationRulesExpanded }"
          >expand_more</span>
          <span class="properties-panel__rules-label">{{ t("diagram.linkRules") }}</span>
          <button
            type="button"
            class="link-btn link-btn--icon"
            :title="t('diagram.addLinkRule')"
            :aria-label="t('diagram.addLinkRule')"
            @click.stop="addRelationRule"
          >
            <span class="material-symbols-outlined">add</span>
          </button>
        </div>
        <template v-if="relationRulesExpanded">
          <div v-if="selectedComponentRelationRules.length === 0" class="properties-panel__rules-empty">
            {{ t("diagram.noRules") }}
          </div>
          <div v-else class="properties-panel__rules-list">
            <div
              v-for="rule in selectedComponentRelationRules"
              :key="rule.id"
              class="properties-panel__rule-card"
            >
              <div class="properties-panel__rule-header">
                <span class="properties-panel__rule-title">
                  {{ selectedItem.name || 'A' }} →
                  {{ allComponents?.find((item) => item.id === rule.toComponentId)?.name || 'B' }}
                </span>
                <button
                  type="button"
                  class="property-remove-btn properties-panel__rule-remove"
                  @click="removeRelationRule(rule)"
                >
                  <span class="material-symbols-outlined">close</span>
                </button>
              </div>
              <div class="properties-panel__rule-row">
                <label class="properties-panel__rule-row-label">{{ t("diagram.ruleTo") }}</label>
                <div class="rule-target-dropdown">
                  <div class="rule-target-dropdown__control" @click.stop="toggleRuleTargetDropdown(rule.id)">
                    <span class="rule-target-dropdown__value">
                      {{ activeComponents.find((c) => c.id === rule.toComponentId)?.name || t("diagram.selectComponent") }}
                    </span>
                    <span class="material-symbols-outlined rule-target-dropdown__arrow">
                      {{ openRuleTargetDropdownId === rule.id ? 'expand_less' : 'expand_more' }}
                    </span>
                  </div>
                  <div v-if="openRuleTargetDropdownId === rule.id" class="rule-target-dropdown__panel">
                    <input
                      v-model="ruleTargetSearchQuery"
                      class="rule-target-dropdown__search"
                      type="text"
                      :placeholder="t('diagram.searchComponent')"
                      @click.stop
                    >
                    <div class="rule-target-dropdown__list">
                      <button
                        v-for="component in filteredRuleTargetComponents"
                        :key="component.id"
                        type="button"
                        class="rule-target-dropdown__item"
                        :class="{ 'rule-target-dropdown__item--active': rule.toComponentId === component.id }"
                        @click.stop="selectRuleTarget(rule, component.id)"
                      >
                        {{ component.name || t("common.unnamed") }}
                      </button>
                      <div v-if="filteredRuleTargetComponents.length === 0" class="rule-target-dropdown__empty">
                        {{ t("common.nothingFound") }}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div class="properties-panel__rule-row">
                <label class="properties-panel__rule-row-label">{{ t("diagram.links") }}</label>
                <div v-if="!allRelations || allRelations.length === 0" class="properties-panel__rules-empty">
                  {{ t("diagram.noNotationLinks") }}
                </div>
                <div v-else class="properties-panel__rule-links">
                  <label
                    v-for="relation in allRelations.filter((item) => !item._isDeleted)"
                    :key="`${rule.id}-${relation.id}`"
                    class="properties-panel__rule-link-item"
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
        </template>
      </div>

      <div class="properties-panel__custom">
        <div
          class="properties-panel__custom-header"
          role="button"
          tabindex="0"
          @click="togglePropertiesCollapse"
          @keydown.enter.prevent="togglePropertiesCollapse"
          @keydown.space.prevent="togglePropertiesCollapse"
        >
          <span
            class="material-symbols-outlined properties-panel__custom-chevron"
            :class="{ 'properties-panel__custom-chevron--collapsed': !propertiesExpanded }"
          >expand_more</span>
          <span class="properties-panel__custom-label">{{ t("types.properties") }}</span>
          <div
            ref="addMenuRef"
            class="properties-panel__add-wrapper"
            @click.stop
          >
            <button
              type="button"
              class="link-btn link-btn--icon"
              :title="t('types.addProperty')"
              :aria-label="t('types.addProperty')"
              @click="toggleAddMenu"
            >
              <span class="material-symbols-outlined">add</span>
            </button>
            <div v-if="showAddMenu" class="add-menu">
              <button type="button" class="add-menu__item" @click="addNewProperty">
                <span class="material-symbols-outlined">note_add</span>
                {{ t("types.newProperty") }}
              </button>
              <div class="add-menu__divider"></div>
              <div class="add-menu__section-title">{{ t("types.missingFromType") }}</div>
              <button
                v-for="prop in missingTypeProperties"
                :key="`missing-${prop.name}-${prop.type}`"
                type="button"
                class="add-menu__item"
                @click="addMissingTypeProperty(prop)"
              >
                <span class="material-symbols-outlined">linked_services</span>
                {{ prop.name }} ({{ typeLabel(prop.type) }})
              </button>
              <div v-if="missingTypeProperties.length === 0" class="add-menu__empty">
                {{ t("types.noMissingProperties") }}
              </div>
            </div>
          </div>
        </div>

        <template v-if="propertiesExpanded">
          <div
            v-if="selectedItem.parsedAttrs.customProperties.length === 0"
            class="properties-panel__empty"
          >
            {{ t("types.noProperties") }}
          </div>

          <div v-else class="properties-panel__list">
            <div
              v-for="property in selectedItem.parsedAttrs.customProperties"
              :key="property.id"
              class="property-row"
              :class="{ 'property-row--error': propertyErrors(property).length > 0 }"
            >
              <div class="property-row__header" role="button" tabindex="0" @click="toggleCollapse(property.id)" @keydown.enter="toggleCollapse(property.id)">
                <span
                  class="material-symbols-outlined property-row__chevron"
                  :class="{ 'property-row__chevron--collapsed': !expandedIds.has(property.id) }"
                >expand_more</span>
                <span class="property-row__name">{{ property.name || t("common.unnamed") }}</span>
                <span class="property-row__type-badge">{{ typeLabel(property.type) }}</span>
                <span
                  v-if="property._fromType || isEquivalentToTypeProperty(property)"
                  class="property-row__from-type-badge"
                  :title="t('types.inheritedFromType')"
                >
                  <span class="material-symbols-outlined property-row__from-type-icon">linked_services</span>
                  {{ t("types.typeShort") }}
                </span>
                <span v-if="property.required" class="property-row__required-badge">{{ t("types.requiredShort") }}</span>
                <button
                  type="button"
                  class="property-remove-btn"
                  :title="t('types.removeProperty')"
                  @click.stop="removeCustomProperty(property.id)"
                >
                  <span class="material-symbols-outlined">close</span>
                </button>
              </div>

              <template v-if="expandedIds.has(property.id)">
                <div class="property-row__body">
                  <div class="property-row__main">
                    <input
                      class="property-input property-input--name"
                      :value="property.name"
                      :placeholder="t('types.propertyNamePlaceholder')"
                      @input="handleNameChange(property, ($event.target as HTMLInputElement).value)"
                    >
                    <select
                      class="property-select"
                      :value="property.type"
                      @change="handleTypeChange(property, ($event.target as HTMLSelectElement).value)"
                    >
                      <option v-for="opt in typeOptions" :key="opt.value" :value="opt.value">
                        {{ opt.label }}
                      </option>
                    </select>
                    <label class="property-checkbox">
                      <input
                        type="checkbox"
                        :checked="property.required"
                        @change="handleRequiredChange(property, ($event.target as HTMLInputElement).checked)"
                      >
                      <span class="property-checkbox__label">{{ t("types.requiredShort") }}</span>
                    </label>
                  </div>

                  <div v-if="property.type === 'string'" class="property-row__extra">
                    <input
                      class="property-input property-input--sm"
                      :value="property.regex || ''"
                      :placeholder="t('types.regexOptional')"
                      @input="handleRegexChange(property, ($event.target as HTMLInputElement).value)"
                    >
                    <input
                      class="property-input property-input--num"
                      type="number"
                      :value="property.maxLength ?? ''"
                      :placeholder="t('types.maxLength')"
                      min="0"
                      @input="handleMaxLengthChange(property, ($event.target as HTMLInputElement).value)"
                    >
                  </div>
                  <div v-if="property.type === 'string' && property.regex" class="property-row__extra regex-test">
                    <input
                      class="property-input property-input--sm"
                      :value="getRegexTestValue(property.id)"
                      :placeholder="t('types.testValue')"
                      @input="setRegexTestValue(property.id, ($event.target as HTMLInputElement).value)"
                    >
                    <span
                      v-if="regexTestResult(property) !== null"
                      class="regex-result"
                      :class="regexTestResult(property) ? 'regex-result--pass' : 'regex-result--fail'"
                    >
                      <span class="material-symbols-outlined">
                        {{ regexTestResult(property) ? 'check_circle' : 'cancel' }}
                      </span>
                      {{ regexTestResult(property) ? t("types.regexMatch") : t("types.regexNoMatch") }}
                    </span>
                  </div>

                  <div v-if="property.type === 'number'" class="property-row__extra">
                    <input
                      class="property-input property-input--sm"
                      type="number"
                      :value="property.min ?? ''"
                      :placeholder="t('types.minValuePlaceholder')"
                      @input="handleMinChange(property, ($event.target as HTMLInputElement).value)"
                    >
                    <input
                      class="property-input property-input--sm"
                      type="number"
                      :value="property.max ?? ''"
                      :placeholder="t('types.maxValuePlaceholder')"
                      @input="handleMaxChange(property, ($event.target as HTMLInputElement).value)"
                    >
                  </div>

                  <div v-if="property.type === 'enum'" class="property-row__extra">
                    <input
                      class="property-input property-input--sm"
                      :value="(property.enumValues || []).join(', ')"
                      :placeholder="t('types.enumValuesPlaceholder')"
                      @change="updateEnumValues(property, ($event.target as HTMLInputElement).value)"
                    >
                  </div>
                  <div v-if="property.type === 'string' && property.required" class="property-row__extra">
                    <span class="property-row__label">{{ t("types.defaultValue") }}</span>
                    <input
                      class="property-input property-input--sm"
                      :value="typeof property.defaultValue === 'string' ? property.defaultValue : ''"
                      :placeholder="t('types.defaultStringValue')"
                      @input="handleDefaultStringChange(property, ($event.target as HTMLInputElement).value)"
                    >
                  </div>
                  <div v-if="property.type === 'number' && property.required" class="property-row__extra">
                    <span class="property-row__label">{{ t("types.defaultValue") }}</span>
                    <input
                      class="property-input property-input--sm"
                      type="number"
                      :value="typeof property.defaultValue === 'number' ? property.defaultValue : ''"
                      :placeholder="t('types.defaultNumberValue')"
                      @input="handleDefaultNumberChange(property, ($event.target as HTMLInputElement).value)"
                    >
                  </div>
                  <div v-if="property.type === 'boolean' && property.required" class="property-row__extra">
                    <span class="property-row__label">{{ t("types.defaultValue") }}</span>
                    <select
                      class="property-select"
                      :value="typeof property.defaultValue === 'boolean' ? String(property.defaultValue) : ''"
                      @change="handleDefaultBooleanChange(property, ($event.target as HTMLSelectElement).value)"
                    >
                      <option value="">{{ t("common.none") }}</option>
                      <option value="true">true</option>
                      <option value="false">false</option>
                    </select>
                  </div>
                  <div v-if="property.type === 'enum' && property.required && (property.enumValues || []).length > 0" class="property-row__extra">
                    <span class="property-row__label">{{ t("types.defaultValue") }}</span>
                    <select
                      class="property-select"
                      :value="typeof property.defaultValue === 'string' ? property.defaultValue : ''"
                      @change="handleEnumDefaultChange(property, ($event.target as HTMLSelectElement).value)"
                    >
                      <option value="">{{ t("common.none") }}</option>
                      <option v-for="val in property.enumValues" :key="val" :value="val">{{ val }}</option>
                    </select>
                  </div>

                  <div v-if="propertyErrors(property).length > 0" class="property-row__errors">
                    <span v-for="(err, i) in propertyErrors(property)" :key="i" class="property-error">
                      {{ err }}
                    </span>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>

  <BaseModal
    v-if="showCreateNodeTypeDialog"
    :title="t('types.createNodeTypeTitle')"
    max-width="420px"
    @close="closeCreateNodeTypeDialog"
  >
    <div class="properties-panel__relation-type-dialog">
      <label class="properties-panel__relation-type-label" for="new-node-type-name">
        {{ t("types.nodeTypeName") }}
      </label>
      <input
        id="new-node-type-name"
        class="property-input"
        :value="newNodeTypeName"
        :placeholder="t('types.nodeTypeNamePlaceholder')"
        @input="newNodeTypeName = ($event.target as HTMLInputElement).value"
        @keydown.enter.prevent="submitCreateNodeType"
      >
      <div v-if="newNodeTypeError" class="properties-panel__relation-type-error">
        {{ newNodeTypeError }}
      </div>
    </div>
    <template #footer>
      <button type="button" class="btn btn--secondary" @click="closeCreateNodeTypeDialog">
        {{ t("common.cancel") }}
      </button>
      <button type="button" class="btn btn--primary" @click="submitCreateNodeType">
        {{ t("common.create") }}
      </button>
    </template>
  </BaseModal>

  <BaseModal
    v-if="showCreateRelationTypeDialog"
    :title="t('types.createLinkTypeTitle')"
    max-width="420px"
    @close="closeCreateRelationTypeDialog"
  >
    <div class="properties-panel__relation-type-dialog">
      <label class="properties-panel__relation-type-label" for="new-relation-type-name">
        {{ t("types.linkTypeName") }}
      </label>
      <input
        id="new-relation-type-name"
        class="property-input"
        :value="newRelationTypeName"
        :placeholder="t('types.linkTypeNamePlaceholder')"
        @input="newRelationTypeName = ($event.target as HTMLInputElement).value"
        @keydown.enter.prevent="submitCreateRelationType"
      >
      <div v-if="newRelationTypeError" class="properties-panel__relation-type-error">
        {{ newRelationTypeError }}
      </div>
    </div>
    <template #footer>
      <button type="button" class="btn btn--secondary" @click="closeCreateRelationTypeDialog">
        {{ t("common.cancel") }}
      </button>
      <button type="button" class="btn btn--primary" @click="submitCreateRelationType">
        {{ t("common.create") }}
      </button>
    </template>
  </BaseModal>
</template>

<style scoped>
.properties-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--surface);
}

.properties-panel__content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}

.properties-panel__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.properties-panel__title {
  margin: 0;
  font-size: var(--heading-font-size);
  font-weight: 600;
  color: var(--base-text);
  letter-spacing: var(--heading-letter-spacing);
}

.properties-panel__entity-name {
  font-size: 13px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.properties-panel__size-controls {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.properties-panel__size-btn {
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
  cursor: pointer;
  transition: all 0.15s ease;
}

.properties-panel__size-btn .material-symbols-outlined {
  font-size: 16px;
}

.properties-panel__size-btn:hover:not(:disabled) {
  background: var(--primary-soft);
  border-color: var(--primary);
  color: var(--primary);
}

.properties-panel__size-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.properties-panel__add-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: var(--surface-strong);
  color: var(--text-muted);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
  flex-shrink: 0;
}

.properties-panel__add-btn .material-symbols-outlined {
  font-size: 18px;
}

.properties-panel__add-btn:hover {
  background: var(--primary-soft);
  color: var(--primary);
}

.properties-panel__add-wrapper {
  position: relative;
  flex-shrink: 0;
}

.add-menu {
  position: absolute;
  top: auto;
  bottom: calc(100% + 6px);
  right: auto;
  left: 0;
  min-width: 240px;
  max-width: 320px;
  max-height: 280px;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14);
  z-index: 20;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.add-menu__item {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  border: none;
  background: transparent;
  color: var(--base-text);
  border-radius: 6px;
  padding: 7px 8px;
  cursor: pointer;
  text-align: left;
  font-size: 12px;
  font-family: inherit;
}

.add-menu__item:hover {
  background: var(--surface-strong);
}

.add-menu__item .material-symbols-outlined {
  font-size: 16px;
  color: var(--text-subtle);
  flex-shrink: 0;
}

.add-menu__divider {
  height: 1px;
  background: var(--border);
  margin: 4px 2px;
}

.add-menu__section-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-subtle);
  padding: 2px 8px 4px;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.add-menu__empty {
  font-size: 12px;
  color: var(--text-subtle);
  padding: 6px 8px 8px;
}

.properties-panel__empty {
  padding: 24px 16px;
  text-align: center;
  font-size: 13px;
  color: var(--text-subtle);
}

.properties-panel__empty--centered {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: center;
}

.properties-panel__empty-icon {
  font-size: 24px;
  color: var(--border-strong);
}

.properties-panel__palette-group {
  padding: 10px 12px 8px;
  border-bottom: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.properties-panel__palette-group-header {
  display: flex;
  align-items: center;
  gap: 4px;
  user-select: none;
  cursor: pointer;
}

.properties-panel__palette-group-chevron {
  font-size: 18px;
  color: var(--text-subtle);
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

.properties-panel__palette-group-chevron--collapsed {
  transform: rotate(-90deg);
}

.properties-panel__palette-group-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-subtle);
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.properties-panel__palette-group-input {
  width: 80px;
}

.properties-panel__palette-group-hint {
  font-size: 10px;
  color: var(--text-subtle);
}

.properties-panel__tags {
  padding: 10px 12px 8px;
  border-bottom: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.properties-panel__type {
  padding: 10px 12px 8px;
  border-bottom: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.properties-panel__type-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-subtle);
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.properties-panel__type-select {
  width: 100%;
}

.properties-panel__type-header {
  display: flex;
  align-items: center;
  gap: 4px;
  user-select: none;
  cursor: pointer;
}

.properties-panel__type-chevron {
  font-size: 18px;
  color: var(--text-subtle);
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

.properties-panel__type-chevron--collapsed {
  transform: rotate(-90deg);
}

.properties-panel__type-collapse-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-subtle);
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.properties-panel__type-hint {
  font-size: 12px;
  color: var(--warning);
}

.properties-panel__relation-type-dialog {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.properties-panel__relation-type-label {
  font-size: 12px;
  color: var(--text-muted);
  font-weight: 500;
}

.properties-panel__relation-type-error {
  font-size: 12px;
  color: var(--danger);
}

.properties-panel__tags-header {
  display: flex;
  align-items: center;
  gap: 4px;
  user-select: none;
  cursor: pointer;
}

.properties-panel__tags-chevron {
  font-size: 18px;
  color: var(--text-subtle);
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

.properties-panel__tags-chevron--collapsed {
  transform: rotate(-90deg);
}

.properties-panel__tags-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-subtle);
  letter-spacing: 0.02em;
  text-transform: uppercase;
  cursor: inherit;
}

.properties-panel__tags-input {
  width: 100%;
  box-sizing: border-box;
  height: 34px;
  padding: 7px 10px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface-muted);
  color: var(--base-text);
  font-size: 13px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
}

.properties-panel__tags-input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(124, 92, 252, 0.12);
  background: var(--surface);
}

.properties-panel__tags-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.properties-panel__tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid var(--border);
  background: var(--surface-strong);
  color: var(--text-muted);
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 12px;
  line-height: 1.2;
  font-family: inherit;
  cursor: pointer;
}

.properties-panel__tag-chip .material-symbols-outlined {
  font-size: 14px;
}

.properties-panel__tag-chip:hover {
  color: var(--danger);
  border-color: rgba(220, 53, 69, 0.35);
  background: rgba(220, 53, 69, 0.08);
}

.properties-panel__label-template {
  padding: 10px 12px 8px;
  border-bottom: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.properties-panel__label-template-header {
  display: flex;
  align-items: center;
  gap: 4px;
  user-select: none;
  cursor: pointer;
}

.properties-panel__label-template-chevron {
  font-size: 18px;
  color: var(--text-subtle);
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

.properties-panel__label-template-chevron--collapsed {
  transform: rotate(-90deg);
}

.properties-panel__label-template-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-subtle);
  letter-spacing: 0.02em;
  text-transform: uppercase;
  cursor: inherit;
}

.properties-panel__label-template-input {
  width: 100%;
  box-sizing: border-box;
  min-height: 48px;
  padding: 7px 10px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface-muted);
  color: var(--base-text);
  font-size: 13px;
  font-family: monospace;
  outline: none;
  resize: vertical;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
}

.properties-panel__label-template-input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(124, 92, 252, 0.12);
  background: var(--surface);
}

.properties-panel__label-template-preview {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 12px;
}

.properties-panel__label-template-preview-label {
  color: var(--text-subtle);
  flex-shrink: 0;
}

.properties-panel__label-template-preview-text {
  color: var(--base-text);
  word-break: break-all;
}

.properties-panel__rules {
  padding: 10px 12px 8px;
  border-bottom: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.properties-panel__rules-header {
  display: flex;
  align-items: center;
  gap: 4px;
  user-select: none;
  cursor: pointer;
}

.properties-panel__rules-chevron {
  font-size: 18px;
  color: var(--text-subtle);
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

.properties-panel__rules-chevron--collapsed {
  transform: rotate(-90deg);
}

.properties-panel__rules-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-subtle);
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.properties-panel__rules-empty {
  font-size: 12px;
  color: var(--text-subtle);
}

.properties-panel__rules-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.properties-panel__custom {
  padding: 10px 12px 8px;
  border-bottom: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.properties-panel__custom-header {
  display: flex;
  align-items: center;
  gap: 4px;
  user-select: none;
  cursor: pointer;
}

.properties-panel__custom-chevron {
  font-size: 18px;
  color: var(--text-subtle);
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

.properties-panel__custom-chevron--collapsed {
  transform: rotate(-90deg);
}

.properties-panel__custom-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-subtle);
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.properties-panel__rule-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--surface-strong);
  border: 1px solid var(--border);
}

.properties-panel__rule-card:hover {
  border-color: var(--border-strong);
}

.properties-panel__rule-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.properties-panel__rule-title {
  font-size: 12px;
  font-weight: 500;
  color: var(--base-text);
}

.properties-panel__rule-remove {
  opacity: 1;
}

.properties-panel__rule-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.properties-panel__rule-row-label {
  width: 46px;
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.8;
}

.properties-panel__rule-links {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
}

.properties-panel__rule-link-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--base-text);
  cursor: pointer;
}

.properties-panel__rule-link-item input {
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

.properties-panel__list {
  overflow: visible;
  padding: 8px 0 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.property-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--surface-muted);
  border: 1px solid transparent;
  transition: border-color 0.15s ease;
}

.property-row--error {
  border-color: rgba(220, 53, 69, 0.3);
}

.property-row__header {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
}

.property-row__chevron {
  font-size: 18px;
  color: var(--text-subtle);
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

.property-row__chevron--collapsed {
  transform: rotate(-90deg);
}

.property-row__name {
  font-size: 13px;
  font-weight: 500;
  color: var(--base-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.property-row__type-badge {
  font-size: 11px;
  font-weight: 500;
  color: var(--primary);
  background: var(--primary-soft);
  padding: 1px 7px;
  border-radius: 6px;
  white-space: nowrap;
  flex-shrink: 0;
}

.property-row__from-type-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  font-weight: 500;
  color: var(--accent);
  background: var(--accent-soft);
  padding: 1px 7px;
  border-radius: 6px;
  white-space: nowrap;
  flex-shrink: 0;
}

.property-row__from-type-icon {
  font-size: 13px;
}

.property-row__required-badge {
  font-size: 11px;
  font-weight: 500;
  color: var(--warning);
  background: var(--warning-soft);
  padding: 1px 7px;
  border-radius: 6px;
  white-space: nowrap;
  flex-shrink: 0;
}

.property-row__body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-top: 6px;
}

.property-row__main {
  display: flex;
  align-items: center;
  gap: 6px;
}

.property-input {
  padding: 5px 8px;
  font-size: 13px;
  font-family: inherit;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--base-text);
  outline: none;
  transition: border-color 0.15s ease;
  box-sizing: border-box;
}

.property-input:focus {
  border-color: var(--primary);
}

.property-input--name {
  flex: 1;
  min-width: 0;
}

.property-input--sm {
  flex: 1;
  min-width: 0;
}

.property-select {
  padding: 5px 8px;
  font-size: 13px;
  font-family: inherit;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--base-text);
  cursor: pointer;
  outline: none;
}

.property-select:focus {
  border-color: var(--primary);
}

.property-checkbox {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  flex-shrink: 0;
}

.property-checkbox input {
  accent-color: var(--primary);
}

.property-checkbox__label {
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
}

.property-remove-btn {
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

.property-remove-btn .material-symbols-outlined {
  font-size: 16px;
}

.property-remove-btn:hover {
  background: var(--danger-soft);
  color: var(--danger);
}

.property-row__extra {
  display: flex;
  gap: 6px;
  align-items: center;
}

.property-row__label {
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
  flex-shrink: 0;
}

.property-input--num {
  width: 100px;
  flex: 0 0 100px;
}

.regex-test {
  align-items: center;
}

.regex-result {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  flex-shrink: 0;
}

.regex-result .material-symbols-outlined {
  font-size: 16px;
}

.regex-result--pass {
  color: var(--success);
}

.regex-result--fail {
  color: var(--danger);
}

.property-row__errors {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.property-error {
  font-size: 11px;
  color: var(--danger);
}

/* Rule target searchable dropdown */
.rule-target-dropdown {
  position: relative;
  flex: 1;
  min-width: 0;
}

.rule-target-dropdown__control {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  padding: 5px 8px;
  font-size: 13px;
  font-family: inherit;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--base-text);
  cursor: pointer;
  transition: border-color 0.15s ease;
}

.rule-target-dropdown__control:hover {
  border-color: var(--primary);
}

.rule-target-dropdown__value {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rule-target-dropdown__arrow {
  font-size: 18px;
  color: var(--text-subtle);
  flex-shrink: 0;
}

.rule-target-dropdown__panel {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: var(--shadow-md);
  z-index: 100;
  overflow: hidden;
}

.rule-target-dropdown__search {
  width: 100%;
  padding: 8px 10px;
  font-size: 13px;
  font-family: inherit;
  border: none;
  border-bottom: 1px solid var(--border);
  outline: none;
  background: var(--surface);
  color: var(--base-text);
  box-sizing: border-box;
}

.rule-target-dropdown__search::placeholder {
  color: var(--text-subtle);
}

.rule-target-dropdown__list {
  max-height: 180px;
  overflow-y: auto;
  padding: 4px;
}

.rule-target-dropdown__item {
  display: block;
  width: 100%;
  padding: 6px 8px;
  font-size: 13px;
  font-family: inherit;
  text-align: left;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--base-text);
  cursor: pointer;
  transition: background 0.12s ease;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rule-target-dropdown__item:hover {
  background: var(--surface-strong);
}

.rule-target-dropdown__item--active {
  background: var(--primary-soft);
  color: var(--primary);
  font-weight: 500;
}

.rule-target-dropdown__item--active:hover {
  background: var(--primary-soft);
}

.rule-target-dropdown__empty {
  padding: 10px 8px;
  font-size: 13px;
  color: var(--text-subtle);
  text-align: center;
}
</style>
