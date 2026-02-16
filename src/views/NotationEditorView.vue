<script setup lang="ts">
import {ref, computed, watch, onMounted, onBeforeUnmount} from "vue";
import {onBeforeRouteLeave, useRouter} from "vue-router";

const router = useRouter();
import MainLayout from "../layouts/MainLayout.vue";
import AppFooter from "../components/layout/AppFooter.vue";
import BaseModal from "../components/modals/BaseModal.vue";
import NotationMainPanelLayout from "../features/notations/layout/NotationMainPanelLayout.vue";
import NotationAppHeader from "../features/notations/layout/NotationAppHeader.vue";
import NotationComponentList from "../features/notations/layout/NotationComponentList.vue";
import NotationDiagram from "../features/notations/components/NotationDiagram.vue";
import NotationEntityModal from "../features/notations/components/NotationEntityModal.vue";
import CustomPropertiesPanel from "../features/notations/components/CustomPropertiesPanel.vue";
import NodeStylePanel from "../features/notations/components/NodeStylePanel.vue";
import {useNotationEditor} from "../features/notations/composables/useNotationEditor";
import {useNotationEntity, appendTagValue} from "../features/notations/composables/useNotationEntity";
import type {DiagramStyle} from "../features/notations/notationAttrs";
import {createId, parseEntityAttrs, parseTypeAttrs, serializeEntityAttrs, serializeTypeAttrs} from "../features/notations/notationAttrs";
import type {
  NotationEditorState,
  EditorNodeType,
  EditorLinkType,
  EditorComponent,
  EditorRelation,
  EditorRelationRule
} from "../features/notations/types";

const {
  notation,
  state,
  isLoading,
  isSaving,
  saveError,
  saveSuccess,
  saveProgress,
  hasUnsavedChanges,
  loadNotation,
  saveChanges
} = useNotationEditor();

const {
  selectedEntity,
  showComponentModal,
  componentName,
  componentTags,
  componentVersion,
  componentTypeSelection,
  componentNewTypeName,
  componentStylePreset,
  componentFormError,
  componentTagSuggestions,
  showRelationModal,
  relationName,
  relationTags,
  relationVersion,
  relationTypeSelection,
  relationNewTypeName,
  relationStylePreset,
  relationFormError,
  relationTagSuggestions,
  componentStylePresets,
  relationStylePresets,
  selectedItem,
  openComponentModal,
  closeComponentModal,
  addComponent,
  openRelationModal,
  closeRelationModal,
  addRelation,
  selectComponent,
  selectRelation,
  markComponentDirty,
  markRelationDirty,
  removeComponent,
  removeRelation
} = useNotationEntity(state);

const NEW_TYPE_VALUE = "__new__";

const diagramRef = ref<InstanceType<typeof NotationDiagram> | null>(null);

const selectedEntityId = computed(() => selectedEntity.value?.id ?? null);
const selectedItemTypeProperties = computed(() => {
  const entity = selectedEntity.value;
  if (!entity) return [];
  if (entity.kind === "component") {
    const item = state.value.components.find((c) => c.id === entity.id);
    if (!item) return [];
    const nodeType = state.value.nodeTypes.find((t) => t.id === item.nodeTypeId);
    return nodeType?.parsedAttrs.customProperties ?? [];
  }
  const item = state.value.relations.find((r) => r.id === entity.id);
  if (!item) return [];
  const linkType = state.value.linkTypes.find((t) => t.id === item.linkTypeId);
  return linkType?.parsedAttrs.customProperties ?? [];
});

// Compute the diagram element ID for the selected entity (for the style panel)
// Components use node ID, relations use edge ID
const selectedDiagramElementId = computed(() => {
  const entity = selectedEntity.value;
  if (!entity) return null;
  if (entity.kind === "relation") {
    return `relation-edge-${entity.id}`;
  }
  return `component-${entity.id}`;
});

const interactionManager = computed(() => diagramRef.value?.interactionManagerRef ?? null);
const diagramRenderer = computed(() => diagramRef.value?.rendererRef ?? null);

// Toggle states
const gridVisible = ref(true);
const miniMapVisible = ref(true);
const snapEnabled = ref(false);
const PROPERTIES_PANEL_DEFAULT_HEIGHT = 240;
const propertiesPanelHeight = ref(PROPERTIES_PANEL_DEFAULT_HEIGHT);

const resetPropertiesPanelHeight = () => {
  propertiesPanelHeight.value = PROPERTIES_PANEL_DEFAULT_HEIGHT;
};

watch(interactionManager, (im) => {
  if (!im) return;
  // Keep interaction managers in sync with toolbar state.
  im.drag.setSnapToGrid(snapEnabled.value);
  im.resize.setSnapToGrid(snapEnabled.value);
}, { immediate: true });

// JSON attrs dialog
const showAttrsJson = ref(false);
const attrsJsonContent = ref("");
const importNotationInputRef = ref<HTMLInputElement | null>(null);

type NotationExportPayloadV1 = {
  format: "warchi-notation-export";
  version: 1;
  exportedAt: string;
  notation: {
    id: string;
    name: string;
    version: string;
  };
  state: NotationEditorState;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toStringOr = (value: unknown, fallback: string): string =>
  typeof value === "string" && value.trim().length > 0 ? value : fallback;

const toObjectArray = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter(isRecord) : [];

const cloneJson = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const sanitizeFileName = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9а-яё_-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

const exportNotation = () => {
  const currentNotation = notation.value;
  const fallbackNotationId = state.value.notationId || "notation";

  const payload: NotationExportPayloadV1 = {
    format: "warchi-notation-export",
    version: 1,
    exportedAt: new Date().toISOString(),
    notation: {
      id: currentNotation?.id ?? fallbackNotationId,
      name: currentNotation?.name ?? "Notation",
      version: currentNotation?.version ?? "1.0.0"
    },
    state: cloneJson(state.value)
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8"
  });
  const url = URL.createObjectURL(blob);
  const fileNameBase = sanitizeFileName(currentNotation?.name ?? fallbackNotationId) || "notation";
  const fileName = `${fileNameBase}-export.json`;
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const normalizeImportedState = (raw: unknown): NotationEditorState => {
  const source = isRecord(raw) && isRecord(raw.state) ? raw.state : raw;
  if (!isRecord(source)) {
    throw new Error("Некорректный формат файла импорта");
  }

  const baseOwnerId = state.value.ownerId;
  const baseNotationId = state.value.notationId;

  const nodeTypeIdMap = new Map<string, string>();
  const linkTypeIdMap = new Map<string, string>();
  const componentIdMap = new Map<string, string>();
  const relationIdMap = new Map<string, string>();

  const nodeTypes: EditorNodeType[] = toObjectArray(source.nodeTypes).map((item) => {
    const importedId = toStringOr(item.id, createId());
    const id = createId();
    nodeTypeIdMap.set(importedId, id);
    return {
      id,
      name: toStringOr(item.name, "Новый тип узла"),
      ownerId: toStringOr(item.ownerId, baseOwnerId),
      createdAt: null,
      updatedAt: null,
      parsedAttrs: parseTypeAttrs(JSON.stringify(item.parsedAttrs ?? {})),
      _isNew: true
    };
  });

  const linkTypes: EditorLinkType[] = toObjectArray(source.linkTypes).map((item) => {
    const importedId = toStringOr(item.id, createId());
    const id = createId();
    linkTypeIdMap.set(importedId, id);
    return {
      id,
      name: toStringOr(item.name, "Новый тип связи"),
      ownerId: toStringOr(item.ownerId, baseOwnerId),
      createdAt: null,
      updatedAt: null,
      parsedAttrs: parseTypeAttrs(JSON.stringify(item.parsedAttrs ?? {})),
      _isNew: true
    };
  });

  if (nodeTypes.length === 0) {
    nodeTypes.push({
      id: createId(),
      name: "Новый тип узла",
      ownerId: baseOwnerId,
      parsedAttrs: {},
      _isNew: true
    });
  }
  if (linkTypes.length === 0) {
    linkTypes.push({
      id: createId(),
      name: "Новый тип связи",
      ownerId: baseOwnerId,
      parsedAttrs: {},
      _isNew: true
    });
  }

  const nodeTypeIds = new Set(nodeTypes.map((item) => item.id));
  const linkTypeIds = new Set(linkTypes.map((item) => item.id));
  const defaultNodeTypeId = nodeTypes[0]!.id;
  const defaultLinkTypeId = linkTypes[0]!.id;

  const components: EditorComponent[] = toObjectArray(source.components).map((item) => {
    const importedComponentId = toStringOr(item.id, createId());
    const importedNodeTypeId = toStringOr(item.nodeTypeId, defaultNodeTypeId);
    const mappedNodeTypeId = nodeTypeIdMap.get(importedNodeTypeId) ?? importedNodeTypeId;
    const id = createId();
    componentIdMap.set(importedComponentId, id);
    return {
      id,
      name: toStringOr(item.name, "Новый компонент"),
      version: toStringOr(item.version, "1.0.0"),
      notationId: baseNotationId,
      ownerId: toStringOr(item.ownerId, baseOwnerId),
      nodeTypeId: nodeTypeIds.has(mappedNodeTypeId) ? mappedNodeTypeId : defaultNodeTypeId,
      createdAt: null,
      updatedAt: null,
      parsedAttrs: parseEntityAttrs(JSON.stringify(item.parsedAttrs ?? {})),
      _isNew: true,
      _isDirty: false,
      _isDeleted: false
    };
  });

  const relations: EditorRelation[] = toObjectArray(source.relations).map((item) => {
    const importedRelationId = toStringOr(item.id, createId());
    const importedLinkTypeId = toStringOr(item.linkTypeId, defaultLinkTypeId);
    const mappedLinkTypeId = linkTypeIdMap.get(importedLinkTypeId) ?? importedLinkTypeId;
    const id = createId();
    relationIdMap.set(importedRelationId, id);
    return {
      id,
      name: toStringOr(item.name, "Новая связь"),
      version: toStringOr(item.version, "1.0.0"),
      notationId: baseNotationId,
      ownerId: toStringOr(item.ownerId, baseOwnerId),
      linkTypeId: linkTypeIds.has(mappedLinkTypeId) ? mappedLinkTypeId : defaultLinkTypeId,
      createdAt: null,
      updatedAt: null,
      parsedAttrs: parseEntityAttrs(JSON.stringify(item.parsedAttrs ?? {})),
      _isNew: true,
      _isDirty: false,
      _isDeleted: false
    };
  });

  const relationRules: EditorRelationRule[] = toObjectArray(source.relationRules).reduce<EditorRelationRule[]>(
    (acc, item) => {
      const importedFromId = toStringOr(item.fromComponentId, "");
      const importedToId = toStringOr(item.toComponentId, "");
      const fromComponentId = componentIdMap.get(importedFromId);
      const toComponentId = componentIdMap.get(importedToId);
      if (!fromComponentId || !toComponentId) return acc;

      const rawRelationIds = Array.isArray(item.allowedRelationIds)
        ? item.allowedRelationIds
        : Array.isArray(item.allowedLinkTypeIds)
          ? item.allowedLinkTypeIds
          : [];

      const allowedRelationIds = Array.from(
        new Set(
          rawRelationIds
            .filter((relationId): relationId is string => typeof relationId === "string")
            .map((relationId) => relationIdMap.get(relationId) ?? relationId)
            .filter((relationId) => relations.some((relation) => relation.id === relationId))
        )
      );

      acc.push({
        id: createId(),
        fromComponentId,
        toComponentId,
        allowedRelationIds,
        _isNew: true,
        _isDirty: false,
        _isDeleted: false
      });
      return acc;
    },
    []
  );

  return {
    notationId: baseNotationId,
    ownerId: baseOwnerId,
    nodeTypes,
    linkTypes,
    components,
    relations,
    relationRules
  };
};

const triggerNotationImport = () => {
  const input = importNotationInputRef.value;
  if (!input) return;
  input.value = "";
  const inputWithShowPicker = input as HTMLInputElement & { showPicker?: () => void };
  if (typeof inputWithShowPicker.showPicker === "function") {
    inputWithShowPicker.showPicker();
    return;
  }
  input.click();
};

const resetImportInput = () => {
  if (importNotationInputRef.value) {
    importNotationInputRef.value.value = "";
  }
};

const handleNotationImportChange = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text) as unknown;
    state.value = normalizeImportedState(parsed);
    saveError.value = null;
    saveSuccess.value = false;
  } catch (error) {
    saveError.value =
      error instanceof Error
        ? `Ошибка импорта: ${error.message}`
        : "Ошибка импорта: не удалось прочитать файл";
  } finally {
    resetImportInput();
  }
};

const openAttrsJson = () => {
  const entity = selectedEntity.value;
  if (!entity) {
    // Show full state summary
    const data = {
      nodeTypes: state.value.nodeTypes.map(t => ({
        id: t.id, name: t.name,
        attrs: JSON.parse(serializeTypeAttrs(t.parsedAttrs))
      })),
      linkTypes: state.value.linkTypes.map(t => ({
        id: t.id, name: t.name,
        attrs: JSON.parse(serializeTypeAttrs(t.parsedAttrs))
      })),
      components: state.value.components.filter(c => !c._isDeleted).map(c => ({
        id: c.id, name: c.name,
        attrs: JSON.parse(serializeEntityAttrs(c.parsedAttrs))
      })),
      relations: state.value.relations.filter(r => !r._isDeleted).map(r => ({
        id: r.id, name: r.name,
        attrs: JSON.parse(serializeEntityAttrs(r.parsedAttrs))
      }))
    };
    attrsJsonContent.value = JSON.stringify(data, null, 2);
  } else if (entity.kind === "component") {
    const item = state.value.components.find(c => c.id === entity.id);
    if (item) {
      attrsJsonContent.value = serializeEntityAttrs(item.parsedAttrs);
      // Pretty print
      attrsJsonContent.value = JSON.stringify(JSON.parse(attrsJsonContent.value), null, 2);
    }
  } else {
    const item = state.value.relations.find(r => r.id === entity.id);
    if (item) {
      attrsJsonContent.value = serializeEntityAttrs(item.parsedAttrs);
      attrsJsonContent.value = JSON.stringify(JSON.parse(attrsJsonContent.value), null, 2);
    }
  }
  showAttrsJson.value = true;
};

const copyAttrsJson = () => {
  navigator.clipboard.writeText(attrsJsonContent.value);
};

const handleStyleChange = (style: DiagramStyle) => {
  const entity = selectedEntity.value;
  if (!entity) return;

  if (entity.kind === "component") {
    const item = state.value.components.find(c => c.id === entity.id);
    if (item) {
      item.parsedAttrs.diagramStyle = style;
      markComponentDirty(entity.id);
    }
  } else {
    const item = state.value.relations.find(r => r.id === entity.id);
    if (item) {
      item.parsedAttrs.diagramStyle = style;
      markRelationDirty(entity.id);
    }
  }
};

const handleItemChanged = (id: string) => {
  if (selectedEntity.value?.kind === "component") {
    markComponentDirty(id);
  } else if (selectedEntity.value?.kind === "relation") {
    markRelationDirty(id);
  }
};

const handleRelationRulesChanged = () => {
  state.value.relationRules.forEach((rule) => {
    if (!rule._isNew) {
      rule._isDirty = true;
    }
  });
};

const handleSelect = (kind: "component" | "relation", id: string) => {
  if (kind === "component") {
    selectComponent(id);
  } else {
    selectRelation(id);
  }
};

const handleDiagramSelect = (id: string, kind: "component" | "relation") => {
  handleSelect(kind, id);
};

// Remove item confirmation
const showRemoveDialog = ref(false);
const pendingRemove = ref<{ kind: "component" | "relation"; id: string; name: string } | null>(null);

const handleRemoveItem = (kind: "component" | "relation", id: string) => {
  const item = kind === "component"
    ? state.value.components.find(c => c.id === id)
    : state.value.relations.find(r => r.id === id);
  pendingRemove.value = { kind, id, name: item?.name || "" };
  showRemoveDialog.value = true;
};

const confirmRemove = () => {
  if (pendingRemove.value) {
    const { kind, id } = pendingRemove.value;
    if (kind === "component") {
      removeComponent(id);
    } else {
      removeRelation(id);
    }
  }
  showRemoveDialog.value = false;
  pendingRemove.value = null;
};

const cancelRemove = () => {
  showRemoveDialog.value = false;
  pendingRemove.value = null;
};

// Toolbar actions
const handleToolbarAction = async (event: string) => {
  const im = interactionManager.value;
  const renderer = diagramRenderer.value;

  switch (event) {
    case "save":
      await saveChanges(false);
      break;
    case "undo":
      im?.history.undo();
      break;
    case "redo":
      im?.history.redo();
      break;
    case "zoom-in":
      if (renderer) {
        const center = {x: renderer.width / 2, y: renderer.height / 2};
        im?.navigation.setZoom(renderer.zoom * 1.2, center);
      }
      break;
    case "zoom-out":
      if (renderer) {
        const center = {x: renderer.width / 2, y: renderer.height / 2};
        im?.navigation.setZoom(renderer.zoom / 1.2, center);
      }
      break;
    case "fit-screen":
      diagramRef.value?.fitToView();
      break;
    case "zoom-selection":
      im?.zoomToSelection();
      break;
    case "auto-layout-components":
      diagramRef.value?.autoLayoutComponents();
      break;
    case "reset-view":
      diagramRef.value?.resetView();
      break;
    case "toggle-grid": {
      gridVisible.value = !gridVisible.value;
      const overlay = diagramRef.value?.gridOverlayRef;
      overlay?.setEnabled(gridVisible.value);
      renderer?.markDirty();
      break;
    }
    case "toggle-minimap": {
      miniMapVisible.value = !miniMapVisible.value;
      const overlay = diagramRef.value?.miniMapRef;
      overlay?.setEnabled(miniMapVisible.value);
      renderer?.markDirty();
      break;
    }
    case "toggle-snap": {
      snapEnabled.value = !snapEnabled.value;
      im?.drag.setSnapToGrid(snapEnabled.value);
      im?.resize.setSnapToGrid(snapEnabled.value);
      break;
    }
    case "show-attrs-json":
      openAttrsJson();
      break;
    case "export-notation":
      exportNotation();
      break;
    case "import-notation":
      triggerNotationImport();
      break;
  }
};

// Unsaved changes confirmation dialog
const showLeaveDialog = ref(false);
const allowLeave = ref(false);
let pendingRoute: ReturnType<typeof Object> | null = null;

const confirmLeave = () => {
  showLeaveDialog.value = false;
  allowLeave.value = true;
  if (pendingRoute) {
    router.push(pendingRoute as any);
    pendingRoute = null;
  }
};

const cancelLeave = () => {
  showLeaveDialog.value = false;
  pendingRoute = null;
};

// Guard Vue Router navigation
onBeforeRouteLeave((to) => {
  if (allowLeave.value) {
    allowLeave.value = false;
    return true;
  }
  if (hasUnsavedChanges.value) {
    showLeaveDialog.value = true;
    pendingRoute = to;
    return false;
  }
  return true;
});

// Guard browser close / refresh
const onBeforeUnload = (e: BeforeUnloadEvent) => {
  if (hasUnsavedChanges.value) {
    e.preventDefault();
  }
};

onMounted(() => {
  loadNotation();
  window.addEventListener("beforeunload", onBeforeUnload);
});

onBeforeUnmount(() => {
  window.removeEventListener("beforeunload", onBeforeUnload);
});
</script>

<template>
  <input
    ref="importNotationInputRef"
    class="notation-import-input"
    type="file"
    accept=".json,application/json"
    @change="handleNotationImportChange"
  >
  <MainLayout>
    <template #header>
      <NotationAppHeader
        :has-unsaved-changes="hasUnsavedChanges"
        :grid-visible="gridVisible"
        :mini-map-visible="miniMapVisible"
        :snap-enabled="snapEnabled"
        @action="handleToolbarAction"
      />
    </template>
    <template #default>
      <NotationMainPanelLayout
        :properties-height="propertiesPanelHeight"
        @update:properties-height="propertiesPanelHeight = $event"
      >
        <template #left>
          <NotationComponentList
            v-if="!isLoading"
            :state="state"
            :notation="notation"
            :selected-id="selectedEntityId"
            @select="handleSelect"
            @create-component="openComponentModal"
            @create-relation="openRelationModal"
            @remove-item="handleRemoveItem"
          />
        </template>
        <template #default>
          <NotationDiagram
            ref="diagramRef"
            v-if="!isLoading"
            :state="state"
            :selected-id="selectedEntityId"
            @select="handleDiagramSelect"
          />
        </template>
        <template #bottom>
          <CustomPropertiesPanel
            :selected-item="selectedItem"
            :type-properties="selectedItemTypeProperties"
            :all-components="state.components"
            :all-relations="state.relations"
            :relation-rules="state.relationRules"
            :on-item-changed="handleItemChanged"
            :on-relation-rules-changed="handleRelationRulesChanged"
            :on-reset-panel-size="resetPropertiesPanelHeight"
          />
        </template>
        <template #right>
          <NodeStylePanel
            :selected-element-id="selectedDiagramElementId"
            :interaction-manager="interactionManager"
            :renderer="diagramRenderer"
            @style-change="handleStyleChange"
          />
        </template>
      </NotationMainPanelLayout>
    </template>
    <template #footer>
      <AppFooter/>
    </template>
  </MainLayout>

  <!-- Save status toast -->
  <Teleport to="body">
    <Transition name="toast">
      <div v-if="isSaving" class="save-toast save-toast--progress">
        <span class="material-symbols-outlined save-toast__icon spin">sync</span>
        <span>{{ saveProgress || 'Сохранение...' }}</span>
      </div>
      <div v-else-if="saveSuccess" class="save-toast save-toast--success">
        <span class="material-symbols-outlined save-toast__icon">check_circle</span>
        <span>Сохранено</span>
      </div>
      <div v-else-if="saveError" class="save-toast save-toast--error">
        <span class="material-symbols-outlined save-toast__icon">error</span>
        <span>{{ saveError }}</span>
      </div>
    </Transition>
  </Teleport>

  <!-- Unsaved changes confirmation -->
  <BaseModal
    v-if="showLeaveDialog"
    title="Несохранённые изменения"
    max-width="400px"
    @close="cancelLeave"
  >
    <p class="leave-dialog__text">
      У вас есть несохранённые изменения. Если вы покинете страницу, они будут потеряны.
    </p>
    <template #footer>
      <button type="button" class="btn btn--secondary" @click="cancelLeave">
        Остаться
      </button>
      <button type="button" class="btn btn--danger" @click="confirmLeave">
        Покинуть
      </button>
    </template>
  </BaseModal>

  <!-- Remove item confirmation -->
  <BaseModal
    v-if="showRemoveDialog"
    title="Удаление элемента"
    max-width="400px"
    @close="cancelRemove"
  >
    <p class="leave-dialog__text">
      Удалить {{ pendingRemove?.kind === 'component' ? 'компонент' : 'отношение' }}
      <b>{{ pendingRemove?.name || 'Без имени' }}</b>?
      Изменения применятся после сохранения нотации.
    </p>
    <template #footer>
      <button type="button" class="btn btn--secondary" @click="cancelRemove">
        Отмена
      </button>
      <button type="button" class="btn btn--danger" @click="confirmRemove">
        Удалить
      </button>
    </template>
  </BaseModal>

  <!-- JSON attrs viewer -->
  <BaseModal
    v-if="showAttrsJson"
    title="JSON attrs"
    max-width="600px"
    @close="showAttrsJson = false"
  >
    <pre class="json-viewer">{{ attrsJsonContent }}</pre>
    <template #footer>
      <button
        type="button"
        class="btn btn--secondary"
        @click="copyAttrsJson"
      >
        Копировать
      </button>
      <button type="button" class="btn btn--secondary" @click="showAttrsJson = false">
        Закрыть
      </button>
    </template>
  </BaseModal>

  <NotationEntityModal
    v-if="showComponentModal"
    v-model:name="componentName"
    v-model:version="componentVersion"
    v-model:tags="componentTags"
    v-model:type-selection="componentTypeSelection"
    v-model:new-type-name="componentNewTypeName"
    v-model:style-preset="componentStylePreset"
    title="Новый компонент"
    form-id="component-form"
    name-label="Название компонента"
    name-placeholder="Component name"
    version-label="Версия"
    version-placeholder="1.0.0"
    tags-label="Теги"
    tags-placeholder="tag1, tag2"
    type-label="Тип узла"
    :type-options="state.nodeTypes"
    :new-type-value="NEW_TYPE_VALUE"
    new-type-label="Новый тип узла"
    new-type-placeholder="Название типа"
    style-label="Стиль фигуры"
    :style-presets="componentStylePresets"
    :suggestions="componentTagSuggestions"
    :error="componentFormError"
    @close="closeComponentModal"
    @submit="addComponent"
    @select-tag="componentTags = appendTagValue(componentTags, $event)"
  />

  <NotationEntityModal
    v-if="showRelationModal"
    v-model:name="relationName"
    v-model:version="relationVersion"
    v-model:tags="relationTags"
    v-model:type-selection="relationTypeSelection"
    v-model:new-type-name="relationNewTypeName"
    v-model:style-preset="relationStylePreset"
    title="Новое отношение"
    form-id="relation-form"
    name-label="Название отношения"
    name-placeholder="Relation name"
    version-label="Версия"
    version-placeholder="1.0.0"
    tags-label="Теги"
    tags-placeholder="tag1, tag2"
    type-label="Тип связи"
    :type-options="state.linkTypes"
    :new-type-value="NEW_TYPE_VALUE"
    new-type-label="Новый тип связи"
    new-type-placeholder="Название типа"
    style-label="Стиль связи"
    :style-presets="relationStylePresets"
    :suggestions="relationTagSuggestions"
    :error="relationFormError"
    @close="closeRelationModal"
    @submit="addRelation"
    @select-tag="relationTags = appendTagValue(relationTags, $event)"
  />
</template>

<style scoped>
.save-toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: var(--radius-sm);
  font-size: 14px;
  font-weight: 500;
  z-index: 2000;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  pointer-events: none;
}

.save-toast--progress {
  background: var(--surface);
  color: var(--text-muted);
  border: 1px solid var(--border);
}

.save-toast--success {
  background: var(--accent-soft);
  color: var(--accent);
  border: 1px solid rgba(43, 184, 150, 0.2);
}

.save-toast--error {
  background: var(--danger-soft);
  color: var(--danger);
  border: 1px solid rgba(220, 53, 69, 0.15);
}

.save-toast__icon {
  font-size: 20px;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(8px);
}

.leave-dialog__text {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-muted);
}

.btn {
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 500;
  font-family: inherit;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease;
  letter-spacing: 0.01em;
}

.btn--secondary {
  color: var(--text-muted);
  background: transparent;
  border: 1px solid var(--border);
}

.btn--secondary:hover {
  background: var(--surface-strong);
  color: var(--base-text);
}

.btn--danger {
  color: #fff;
  background: var(--danger);
  border: none;
}

.btn--danger:hover {
  background: #c82333;
}

.json-viewer {
  margin: 0;
  padding: 12px;
  background: var(--surface-muted);
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 12px;
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  line-height: 1.5;
  color: var(--base-text);
  overflow: auto;
  max-height: 400px;
  white-space: pre-wrap;
  word-break: break-all;
}

.notation-import-input {
  position: fixed;
  left: -9999px;
  top: 0;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
</style>
