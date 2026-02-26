<script setup lang="ts">
import {computed, reactive, ref, watch, onMounted, onBeforeUnmount} from "vue";
import { useI18n } from "vue-i18n";
import PropertyRow from "../../types/components/PropertyRow.vue";
import CollapseSection from "./CollapseSection.vue";
import TypeSelectSection from "./TypeSelectSection.vue";
import RelationRulesSection from "./RelationRulesSection.vue";
import type {CustomProperty, CustomPropertyType} from "../notationAttrs";
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
  onMutateItem?: (id: string, apply: (item: EditorComponent | EditorRelation) => void) => void;
  onMutateRelationRules?: (apply: (rules: EditorRelationRule[]) => void) => void;
}>();

const selectedItemComputed = computed(() => props.selectedItem);
const { t } = useI18n();

const {
  addCustomProperty,
  addCustomPropertyFromType,
  removeCustomProperty,
  propertyErrors
} = useCustomProperties(selectedItemComputed, props.onMutateItem);

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
  props.onMutateItem?.(props.selectedItem.id, (item) => {
    if (!item.parsedAttrs.diagramStyle) {
      item.parsedAttrs.diagramStyle = {};
    }
    if (value) {
      item.parsedAttrs.diagramStyle.labelTemplate = value;
    } else {
      delete item.parsedAttrs.diagramStyle.labelTemplate;
    }
  });
};

const applyTagsDraft = () => {
  if (!props.selectedItem) return;
  const nextTags = parseTagsInput(tagsDraft.value);
  const currentTags = props.selectedItem.parsedAttrs.tags ?? [];
  if (sameTags(currentTags, nextTags)) {
    tagsDraft.value = currentTags.join(", ");
    return;
  }
  tagsDraft.value = nextTags.join(", ");
  props.onMutateItem?.(props.selectedItem.id, (item) => {
    item.parsedAttrs.tags = nextTags;
  });
};

const removeTag = (tag: string) => {
  if (!props.selectedItem) return;
  const nextTags = props.selectedItem.parsedAttrs.tags.filter((item) => item !== tag);
  tagsDraft.value = nextTags.join(", ");
  props.onMutateItem?.(props.selectedItem.id, (item) => {
    item.parsedAttrs.tags = nextTags;
  });
};

const handlePaletteGroupChange = (value: string) => {
  if (!props.selectedItem || "linkTypeId" in props.selectedItem) return;
  const num = parseInt(value, 10);
  props.onMutateItem?.(props.selectedItem.id, (item) => {
    if (Number.isInteger(num) && num >= 0) {
      item.parsedAttrs.paletteGroup = num;
    } else if (value === "" || value === "-") {
      delete item.parsedAttrs.paletteGroup;
    }
  });
};

const expandedIds = reactive(new Set<string>());

const toggleCollapse = (id: string) => {
  if (expandedIds.has(id)) {
    expandedIds.delete(id);
  } else {
    expandedIds.add(id);
  }
};

const createMutator = (propertyId: string) => {
  return (apply: (p: CustomProperty) => void) => {
    if (!props.selectedItem) return;
    props.onMutateItem?.(props.selectedItem.id, (item) => {
      const p = item.parsedAttrs.customProperties.find(cp => cp.id === propertyId);
      if (p) apply(p);
    });
  };
};

const typeOptions: { value: CustomPropertyType; label: string }[] = [
  {value: "string", label: t("types.propertyTypeString")},
  {value: "number", label: t("types.propertyTypeNumber")},
  {value: "boolean", label: t("types.propertyTypeBoolean")},
  {value: "enum", label: t("types.propertyTypeEnum")}
];

const typeLabel = (type: CustomPropertyType) =>
  typeOptions.find(o => o.value === type)?.label ?? type;

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
    </div>

    <div v-if="!selectedItem" class="properties-panel__empty properties-panel__empty--centered">
      <span class="material-symbols-outlined properties-panel__empty-icon">edit_note</span>
      <span>{{ t("diagram.selectElementToEditProperties") }}</span>
    </div>

    <div v-else class="properties-panel__content">
      <TypeSelectSection
        :selected-item="selectedItem"
        :node-types="nodeTypes"
        :link-types="linkTypes"
        :is-component-type-locked="isComponentTypeLocked"
        :is-relation-type-locked="isRelationTypeLocked"
        :on-component-type-change="onComponentTypeChange"
        :on-relation-type-change="onRelationTypeChange"
        :on-create-node-type="onCreateNodeType"
        :on-create-relation-type="onCreateRelationType"
      />

      <CollapseSection
        v-if="selectedItem && !('linkTypeId' in selectedItem)"
        :label="t('diagram.paletteGroup')"
        :expanded="paletteGroupExpanded"
        @toggle="paletteGroupExpanded = !paletteGroupExpanded"
      >
        <input
          type="number"
          min="0"
          class="form-input form-input--sm properties-panel__palette-group-input"
          :value="selectedItem.parsedAttrs.paletteGroup ?? 0"
          placeholder="0"
          @input="handlePaletteGroupChange(($event.target as HTMLInputElement).value)"
        >
        <span class="properties-panel__palette-group-hint">{{ t("diagram.paletteGroupHint") }}</span>
      </CollapseSection>

      <CollapseSection
        :label="t('diagram.tags')"
        :expanded="tagsExpanded"
        @toggle="tagsExpanded = !tagsExpanded"
      >
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
      </CollapseSection>

      <!-- Label template section (only for components) -->
      <CollapseSection
        v-if="selectedItem && !('linkTypeId' in selectedItem)"
        :label="t('diagram.compositeLabel')"
        :expanded="labelTemplateExpanded"
        @toggle="labelTemplateExpanded = !labelTemplateExpanded"
      >
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
      </CollapseSection>

      <RelationRulesSection
        :selected-item="selectedItem"
        :all-components="allComponents"
        :all-relations="allRelations"
        :relation-rules="relationRules"
        :on-mutate-relation-rules="onMutateRelationRules"
      />

      <CollapseSection
        :label="t('types.properties')"
        :expanded="propertiesExpanded"
        @toggle="propertiesExpanded = !propertiesExpanded"
      >
        <template #header-extra>
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
        </template>

        <div
          v-if="selectedItem.parsedAttrs.customProperties.length === 0"
          class="properties-panel__empty"
        >
          {{ t("types.noProperties") }}
        </div>

        <div v-else class="properties-panel__list">
          <PropertyRow
            v-for="property in selectedItem.parsedAttrs.customProperties"
            :key="property.id"
            :property="property"
            :expanded="expandedIds.has(property.id)"
            :on-mutate-property="createMutator(property.id)"
            size="sm"
            :errors="propertyErrors(property)"
            :from-type="property._fromType"
            :is-equivalent-to-type="isEquivalentToTypeProperty(property)"
            @toggle="toggleCollapse(property.id)"
            @remove="removeCustomProperty(property.id)"
          />
        </div>
      </CollapseSection>
    </div>
  </div>
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

.properties-panel__palette-group-input {
  width: 80px;
}

.properties-panel__palette-group-hint {
  font-size: 10px;
  color: var(--text-subtle);
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
</style>
