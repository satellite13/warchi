<script setup lang="ts">
import {computed, ref} from "vue";
import {useI18n} from "vue-i18n";
import CollapsibleSection from "@/components/ui/CollapsibleSection.vue";
import BaseModal from "@/components/modals/BaseModal.vue";
import SearchableSelect from "@/components/forms/SearchableSelect.vue";
import type {EditorComponent, EditorRelation} from "../types";

const props = defineProps<{
  selectedItem: EditorComponent | EditorRelation | null
  nodeTypes?: Array<{ id: string; name: string }>
  linkTypes?: Array<{ id: string; name: string }>
  isComponentTypeLocked?: boolean
  isRelationTypeLocked?: boolean
  onComponentTypeChange?: (componentId: string, nodeTypeId: string) => void
  onRelationTypeChange?: (relationId: string, linkTypeId: string) => void
  onCreateNodeType?: (componentId: string, nodeTypeName: string) => void
  onCreateRelationType?: (relationId: string, linkTypeName: string) => void
}>();

const {t} = useI18n();

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

const nodeTypeOptions = computed(() => [
  { id: CREATE_NODE_TYPE_VALUE, label: t("types.createNewType") },
  ...(props.nodeTypes ?? []).map((item) => ({ id: item.id, label: item.name }))
]);

const linkTypeOptions = computed(() => [
  { id: CREATE_RELATION_TYPE_VALUE, label: t("types.createNewLink") },
  ...(props.linkTypes ?? []).map((item) => ({ id: item.id, label: item.name }))
]);

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
</script>

<template>
  <div v-if="selectedItem" class="type-select-section">
    <CollapsibleSection
      v-if="!('linkTypeId' in selectedItem)"
      :title="t('types.nodeType')"
      :open="nodeTypeExpanded"
      @toggle="toggleNodeTypeCollapse"
    >
      <SearchableSelect
        :model-value="selectedNodeTypeId"
        :options="nodeTypeOptions"
        :disabled="props.isComponentTypeLocked"
        :placeholder="t('types.selectType')"
        :search-placeholder="t('common.search')"
        :empty-text="t('common.nothingFound')"
        @update:model-value="handleComponentTypeChange"
      />
      <div v-if="props.isComponentTypeLocked" class="type-select-section__hint">
        {{ t("types.componentTypeLockedHint") }}
      </div>
    </CollapsibleSection>

    <CollapsibleSection
      v-else
      :title="t('types.linkType')"
      :open="relationTypeExpanded"
      @toggle="toggleRelationTypeCollapse"
    >
      <SearchableSelect
        :model-value="selectedLinkTypeId"
        :options="linkTypeOptions"
        :disabled="props.isRelationTypeLocked"
        :placeholder="t('types.selectType')"
        :search-placeholder="t('common.search')"
        :empty-text="t('common.nothingFound')"
        @update:model-value="handleRelationTypeChange"
      />
      <div v-if="props.isRelationTypeLocked" class="type-select-section__hint">
        {{ t("types.relationTypeLockedHint") }}
      </div>
    </CollapsibleSection>
  </div>

  <BaseModal
    v-if="showCreateNodeTypeDialog"
    :title="t('types.createNodeTypeTitle')"
    max-width="420px"
    @close="closeCreateNodeTypeDialog"
  >
    <div class="type-select-section__dialog">
      <label class="type-select-section__dialog-label" for="new-node-type-name">
        {{ t("types.nodeTypeName") }}
      </label>
      <input
        id="new-node-type-name"
        class="form-input form-input--sm"
        :value="newNodeTypeName"
        :placeholder="t('types.nodeTypeNamePlaceholder')"
        @input="newNodeTypeName = ($event.target as HTMLInputElement).value"
        @keydown.enter.prevent="submitCreateNodeType"
      >
      <div v-if="newNodeTypeError" class="type-select-section__dialog-error">
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
    <div class="type-select-section__dialog">
      <label class="type-select-section__dialog-label" for="new-relation-type-name">
        {{ t("types.linkTypeName") }}
      </label>
      <input
        id="new-relation-type-name"
        class="form-input form-input--sm"
        :value="newRelationTypeName"
        :placeholder="t('types.linkTypeNamePlaceholder')"
        @input="newRelationTypeName = ($event.target as HTMLInputElement).value"
        @keydown.enter.prevent="submitCreateRelationType"
      >
      <div v-if="newRelationTypeError" class="type-select-section__dialog-error">
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
.type-select-section__hint {
  font-size: 12px;
  color: var(--warning);
}

.type-select-section__dialog {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.type-select-section__dialog-label {
  font-size: 12px;
  color: var(--text-muted);
  font-weight: 500;
}

.type-select-section__dialog-error {
  font-size: 12px;
  color: var(--danger);
}
</style>
