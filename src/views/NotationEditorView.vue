<script setup lang="ts">
import {ref, computed, watch, onMounted, onBeforeUnmount, nextTick} from "vue";
import {onBeforeRouteLeave, useRouter, type RouteLocationRaw} from "vue-router";

const router = useRouter();
import MainLayout from "../layouts/MainLayout.vue";
import AppFooter from "../components/layout/AppFooter.vue";
import BaseModal from "../components/modals/BaseModal.vue";
import ShareAccessModal from "../components/modals/ShareAccessModal.vue";
import {ImageExporter, SvgExporter} from "@ngroznykh/papirus";
import {apiGet} from "../composables/useApi";
import {useAuth} from "../composables/useAuth";
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
import type {NodeResponse, LinkResponse} from "../types/api";
import type {
  NotationEditorState,
  EditorNodeType,
  EditorLinkType,
  EditorComponent,
  EditorRelation,
  EditorRelationRule
} from "../features/notations/types";
import type {PaginatedResponse} from "../types/entities";

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
const {currentUser} = useAuth();
const showShareModal = ref(false);
const canShareNotation = computed(
  () => !!notation.value?.ownerId && !!currentUser.value?.id && notation.value.ownerId === currentUser.value.id
);

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
const canUndo = ref(false);
const canRedo = ref(false);

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

const modelNodes = ref<NodeResponse[]>([]);
const modelLinks = ref<LinkResponse[]>([]);

const parseJsonObject = (raw: string | null | undefined): Record<string, unknown> => {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // ignore malformed attrs
  }
  return {};
};

const loadModelUsage = async () => {
  const query = new URLSearchParams({size: "2000"});
  const [nodesResult, linksResult] = await Promise.all([
    apiGet<PaginatedResponse<NodeResponse>>(`/nodes?${query.toString()}`),
    apiGet<PaginatedResponse<LinkResponse>>(`/links?${query.toString()}`)
  ]);
  modelNodes.value = nodesResult.success ? (nodesResult.data.content ?? []) : [];
  modelLinks.value = linksResult.success ? (linksResult.data.content ?? []) : [];
};

const selectedComponentUsedInModelNodes = computed(() => {
  if (selectedEntity.value?.kind !== "component") return false;
  const componentId = selectedEntity.value.id;
  const notationId = state.value.notationId;
  return modelNodes.value.some((node) => {
    const attrs = parseJsonObject(node.attrs);
    const componentBindings = attrs.componentBindings;
    if (!componentBindings || typeof componentBindings !== "object" || Array.isArray(componentBindings)) {
      return false;
    }
    const byNotation = (componentBindings as Record<string, unknown>)[notationId];
    if (!byNotation || typeof byNotation !== "object" || Array.isArray(byNotation)) return false;
    return (byNotation as Record<string, unknown>).componentId === componentId;
  });
});

const selectedRelationUsedInModelLinks = computed(() => {
  if (selectedEntity.value?.kind !== "relation") return false;
  const relationId = selectedEntity.value.id;
  const notationId = state.value.notationId;
  return modelLinks.value.some((link) => {
    const attrs = parseJsonObject(link.attrs);
    const relationBindings = attrs.relationBindings;
    if (!relationBindings || typeof relationBindings !== "object" || Array.isArray(relationBindings)) {
      return false;
    }
    const byNotation = (relationBindings as Record<string, unknown>)[notationId];
    if (!byNotation || typeof byNotation !== "object" || Array.isArray(byNotation)) return false;
    return (byNotation as Record<string, unknown>).relationId === relationId;
  });
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

const selectedDiagramStyle = computed(() => {
  const entity = selectedEntity.value;
  if (!entity) return undefined;
  if (entity.kind === "component") {
    return state.value.components.find(c => c.id === entity.id)?.parsedAttrs.diagramStyle;
  }
  return state.value.relations.find(r => r.id === entity.id)?.parsedAttrs.diagramStyle;
});

// Toggle states
const gridVisible = ref(true);
const miniMapVisible = ref(true);
const snapEnabled = ref(false);
const alignEnabled = ref(true);
const rulersEnabled = ref(true);
const selectionSyncEnabled = ref(true);

type ToolbarState = {
  gridVisible: boolean;
  miniMapVisible: boolean;
  snapEnabled: boolean;
  alignEnabled: boolean;
  rulersEnabled: boolean;
};

const TOOLBAR_STATE_STORAGE_PREFIX = "warchi:notation-editor:toolbar-state";
const getToolbarStateStorageKey = (userId: string | null): string =>
  userId ? `${TOOLBAR_STATE_STORAGE_PREFIX}:${userId}` : `${TOOLBAR_STATE_STORAGE_PREFIX}:anonymous`;

const readToolbarState = (userId: string | null): Partial<ToolbarState> | null => {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(getToolbarStateStorageKey(userId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ToolbarState>;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};

const applyToolbarState = (stateValue: Partial<ToolbarState> | null) => {
  if (!stateValue) return;
  if (typeof stateValue.gridVisible === "boolean") gridVisible.value = stateValue.gridVisible;
  if (typeof stateValue.miniMapVisible === "boolean") miniMapVisible.value = stateValue.miniMapVisible;
  if (typeof stateValue.snapEnabled === "boolean") snapEnabled.value = stateValue.snapEnabled;
  if (typeof stateValue.alignEnabled === "boolean") alignEnabled.value = stateValue.alignEnabled;
  if (typeof stateValue.rulersEnabled === "boolean") rulersEnabled.value = stateValue.rulersEnabled;
};

const persistToolbarState = (userId: string | null) => {
  if (typeof window === "undefined") return;
  const nextState: ToolbarState = {
    gridVisible: gridVisible.value,
    miniMapVisible: miniMapVisible.value,
    snapEnabled: snapEnabled.value,
    alignEnabled: alignEnabled.value,
    rulersEnabled: rulersEnabled.value
  };
  window.localStorage.setItem(getToolbarStateStorageKey(userId), JSON.stringify(nextState));
};
const PROPERTIES_PANEL_DEFAULT_HEIGHT = 240;
const propertiesPanelHeight = ref(PROPERTIES_PANEL_DEFAULT_HEIGHT);

const resetPropertiesPanelHeight = () => {
  propertiesPanelHeight.value = PROPERTIES_PANEL_DEFAULT_HEIGHT;
};

watch(
  () => currentUser.value?.id ?? null,
  (userId) => {
    applyToolbarState(readToolbarState(userId));
  },
  { immediate: true }
);

watch(
  [gridVisible, miniMapVisible, snapEnabled, alignEnabled, rulersEnabled, () => currentUser.value?.id ?? null],
  ([, , , , , userId]) => {
    persistToolbarState(userId as string | null);
  }
);

const focusSelectedOnDiagram = (kind: "component" | "relation", id: string) => {
  if (!selectionSyncEnabled.value) return;
  const renderer = diagramRef.value?.rendererRef;
  const navigation = diagramRef.value?.interactionManagerRef?.navigation;
  if (!renderer || !navigation || typeof navigation.zoomToRect !== "function") return;

  if (kind === "component") {
    const node = renderer.getNode?.(`component-${id}`);
    const bounds = node?.getBounds?.();
    if (bounds) {
      navigation.zoomToRect(bounds, 64);
    }
    return;
  }

  const edge = renderer.getEdge?.(`relation-edge-${id}`);
  const bounds = edge?.getBounds?.();
  if (bounds) {
    navigation.zoomToRect(bounds, 64);
  }
};

watch(interactionManager, (im) => {
  if (!im) return;
  // Keep interaction managers in sync with toolbar state.
  im.drag.setSnapToGrid(snapEnabled.value);
  im.resize.setSnapToGrid(snapEnabled.value);
  im.connection.setSnapToGrid(snapEnabled.value);
  im.drag.setAlignmentEnabled(alignEnabled.value);
  const overlayGrid = diagramRef.value?.gridOverlayRef;
  overlayGrid?.setEnabled(gridVisible.value);
  const overlayMiniMap = diagramRef.value?.miniMapRef;
  overlayMiniMap?.setEnabled(miniMapVisible.value);
  const overlayRulers = diagramRef.value?.rulersOverlayRef;
  overlayRulers?.setEnabled(rulersEnabled.value);
  diagramRenderer.value?.markDirty();
  im.history.on("change", () => {
    canUndo.value = im.history.canUndo;
    canRedo.value = im.history.canRedo;
  });
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

const buildExportState = (): NotationEditorState => {
  const source = cloneJson(state.value);
  const components = source.components.filter((component) => !component._isDeleted);
  const relations = source.relations.filter((relation) => !relation._isDeleted);

  const componentIds = new Set(components.map((component) => component.id));
  const relationIds = new Set(relations.map((relation) => relation.id));
  const usedNodeTypeIds = new Set(components.map((component) => component.nodeTypeId));
  const usedLinkTypeIds = new Set(relations.map((relation) => relation.linkTypeId));

  const relationRules = source.relationRules
    .filter(
      (rule) =>
        !rule._isDeleted &&
        componentIds.has(rule.fromComponentId) &&
        componentIds.has(rule.toComponentId)
    )
    .map((rule) => ({
      ...rule,
      allowedRelationIds: Array.from(
        new Set(rule.allowedRelationIds.filter((relationId) => relationIds.has(relationId)))
      )
    }))
    .filter((rule) => rule.allowedRelationIds.length > 0);

  return {
    ...source,
    nodeTypes: source.nodeTypes.filter((typeItem) => usedNodeTypeIds.has(typeItem.id)),
    linkTypes: source.linkTypes.filter((typeItem) => usedLinkTypeIds.has(typeItem.id)),
    components,
    relations,
    relationRules
  };
};

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
    state: buildExportState()
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

const getDiagramExportBaseName = () => {
  const currentNotation = notation.value;
  const fallbackNotationId = state.value.notationId || "notation";
  return sanitizeFileName(currentNotation?.name ?? fallbackNotationId) || "notation";
};

const getDiagramExportBackgroundColor = () =>
  getComputedStyle(document.documentElement).getPropertyValue("--base-bg").trim() || "#ffffff";

const exportDiagramAsPng = async () => {
  const renderer = diagramRenderer.value;
  if (!renderer) {
    saveError.value = "Диаграмма еще не готова к экспорту";
    return;
  }

  const exporter = new ImageExporter(renderer);
  const fileName = `${getDiagramExportBaseName()}.png`;
  await exporter.download(fileName, {
    scale: 2,
    padding: 24,
    backgroundColor: getDiagramExportBackgroundColor()
  });
};

const exportDiagramAsSvg = () => {
  const renderer = diagramRenderer.value;
  if (!renderer) {
    saveError.value = "Диаграмма еще не готова к экспорту";
    return;
  }

  const exporter = new SvgExporter(renderer);
  const fileName = `${getDiagramExportBaseName()}.svg`;
  exporter.download(fileName, {
    includeBackground: true,
    backgroundColor: getDiagramExportBackgroundColor(),
    padding: 24
  });
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

const handleComponentTypeChanged = (componentId: string, nodeTypeId: string) => {
  const component = state.value.components.find((item) => item.id === componentId);
  if (!component || component.nodeTypeId === nodeTypeId) return;
  component.nodeTypeId = nodeTypeId;
  markComponentDirty(componentId);
};

const handleCreateNodeType = (componentId: string, nodeTypeName: string) => {
  const trimmedName = nodeTypeName.trim();
  if (!trimmedName) return;

  const existingType = state.value.nodeTypes.find(
    (item) => item.name.trim().toLowerCase() === trimmedName.toLowerCase()
  );

  const nodeTypeId = existingType?.id ?? createId();
  if (!existingType) {
    state.value.nodeTypes.push({
      id: nodeTypeId,
      ownerId: state.value.ownerId,
      name: trimmedName,
      parsedAttrs: {},
      _isNew: true
    });
  }

  handleComponentTypeChanged(componentId, nodeTypeId);
};

const handleRelationTypeChanged = (relationId: string, linkTypeId: string) => {
  const relation = state.value.relations.find((item) => item.id === relationId);
  if (!relation || relation.linkTypeId === linkTypeId) return;
  relation.linkTypeId = linkTypeId;
  markRelationDirty(relationId);
};

const handleCreateRelationType = (relationId: string, linkTypeName: string) => {
  const trimmedName = linkTypeName.trim();
  if (!trimmedName) return;

  const existingType = state.value.linkTypes.find(
    (item) => item.name.trim().toLowerCase() === trimmedName.toLowerCase()
  );

  const linkTypeId = existingType?.id ?? createId();
  if (!existingType) {
    state.value.linkTypes.push({
      id: linkTypeId,
      ownerId: state.value.ownerId,
      name: trimmedName,
      parsedAttrs: {},
      _isNew: true
    });
  }

  handleRelationTypeChanged(relationId, linkTypeId);
};

const handleRelationRulesChanged = () => {
  state.value.relationRules.forEach((rule) => {
    if (!rule._isNew) {
      rule._isDirty = true;
    }
  });
};

const handleSelect = (kind: "component" | "relation", id: string, source: "list" | "diagram" = "list") => {
  if (kind === "component") {
    selectComponent(id);
  } else {
    selectRelation(id);
  }
  if (source === "list") {
    nextTick(() => {
      focusSelectedOnDiagram(kind, id);
    });
  }
};

const handleDiagramSelect = (id: string, kind: "component" | "relation") => {
  handleSelect(kind, id, "diagram");
};

const toggleSelectionSync = () => {
  selectionSyncEnabled.value = !selectionSyncEnabled.value;
  if (!selectionSyncEnabled.value) return;
  const entity = selectedEntity.value;
  if (!entity) return;
  nextTick(() => {
    focusSelectedOnDiagram(entity.kind, entity.id);
  });
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
      if (!hasUnsavedChanges.value) break;
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
      im?.connection.setSnapToGrid(snapEnabled.value);
      break;
    }
    case "toggle-align": {
      alignEnabled.value = !alignEnabled.value;
      im?.drag.setAlignmentEnabled(alignEnabled.value);
      break;
    }
    case "toggle-rulers": {
      rulersEnabled.value = !rulersEnabled.value;
      const overlay = diagramRef.value?.rulersOverlayRef;
      overlay?.setEnabled(rulersEnabled.value);
      renderer?.markDirty();
      break;
    }
    case "show-attrs-json":
      openAttrsJson();
      break;
    case "export-notation":
      exportNotation();
      break;
    case "export-diagram-png":
      await exportDiagramAsPng();
      break;
    case "export-diagram-svg":
      exportDiagramAsSvg();
      break;
    case "import-notation":
      triggerNotationImport();
      break;
  }
};

// Unsaved changes confirmation dialog
const showLeaveDialog = ref(false);
const allowLeave = ref(false);
let pendingRoute: RouteLocationRaw | null = null;

const confirmLeave = () => {
  showLeaveDialog.value = false;
  allowLeave.value = true;
  if (pendingRoute) {
    router.push(pendingRoute);
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
    pendingRoute = to.fullPath;
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
  loadModelUsage();
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
        hide-toolbar
        :has-unsaved-changes="hasUnsavedChanges"
        :notation-name="notation?.name"
        :notation-version="notation?.version"
        :grid-visible="gridVisible"
        :mini-map-visible="miniMapVisible"
        :snap-enabled="snapEnabled"
        :align-enabled="alignEnabled"
        :rulers-enabled="rulersEnabled"
        :can-undo="canUndo"
        :can-redo="canRedo"
        :can-share="canShareNotation"
        @action="handleToolbarAction"
        @share="showShareModal = true"
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
            :selected-id="selectedEntityId"
            :sync-selection-enabled="selectionSyncEnabled"
            @select="handleSelect"
            @toggle-sync-selection="toggleSelectionSync"
            @create-component="openComponentModal"
            @create-relation="openRelationModal"
            @remove-item="handleRemoveItem"
          />
        </template>
        <template #default>
          <div class="notation-canvas-area">
            <div class="notation-canvas-area__toolbar">
              <NotationAppHeader
                canvas-mode
                :has-unsaved-changes="hasUnsavedChanges"
                :notation-name="notation?.name"
                :notation-version="notation?.version"
                :grid-visible="gridVisible"
                :mini-map-visible="miniMapVisible"
                :snap-enabled="snapEnabled"
                :align-enabled="alignEnabled"
                :rulers-enabled="rulersEnabled"
                :can-undo="canUndo"
                :can-redo="canRedo"
                :can-share="canShareNotation"
                @action="handleToolbarAction"
                @share="showShareModal = true"
              />
            </div>
            <NotationDiagram
              ref="diagramRef"
              v-if="!isLoading"
              :state="state"
              :selected-id="selectedEntityId"
              @select="handleDiagramSelect"
            />
          </div>
        </template>
        <template #bottom>
          <CustomPropertiesPanel
            :selected-item="selectedItem"
            :node-types="state.nodeTypes"
            :link-types="state.linkTypes"
            :type-properties="selectedItemTypeProperties"
            :all-components="state.components"
            :all-relations="state.relations"
            :relation-rules="state.relationRules"
            :is-component-type-locked="selectedComponentUsedInModelNodes"
            :is-relation-type-locked="selectedRelationUsedInModelLinks"
            :on-component-type-change="handleComponentTypeChanged"
            :on-relation-type-change="handleRelationTypeChanged"
            :on-create-node-type="handleCreateNodeType"
            :on-create-relation-type="handleCreateRelationType"
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
            :current-diagram-style="selectedDiagramStyle"
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

  <ShareAccessModal
    v-if="showShareModal && notation"
    title="Доступ к нотации"
    resource-type="NOTATION"
    :resource-id="notation.id"
    @close="showShareModal = false"
  />
</template>

<style scoped>
.notation-canvas-area {
  position: relative;
  height: 100%;
  min-height: 0;
}

.notation-canvas-area__toolbar {
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 11;
  pointer-events: none;
}

.notation-canvas-area__toolbar :deep(*) {
  pointer-events: auto;
}

.save-toast {
  position: fixed;
  bottom: 48px;
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
