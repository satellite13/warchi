import {ref, type Ref} from "vue";
import {useI18n} from "vue-i18n";
import {ImageExporter, SvgExporter, type DiagramRenderer} from "@ngroznykh/papirus";
import {createId, parseEntityAttrs, parseTypeAttrs, serializeEntityAttrs, serializeTypeAttrs} from "../notationAttrs";
import { validateCompositeDiagramStyle } from "../utils/validationIssues";
import type {NotationData} from "../../../types/entities";
import type {
  NotationEditorState,
  EditorDiagramLayer,
  EditorNodeType,
  EditorLinkType,
  EditorComponent,
  EditorRelation,
  EditorRelationRule
} from "../types";

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

const normalizeDiagramLayer = (value: unknown): EditorDiagramLayer => {
  if (!isRecord(value)) return { version: 1, nodes: [], edges: [] };
  const nodes: EditorDiagramLayer['nodes'] = [];
  if (Array.isArray(value.nodes)) {
    for (const node of value.nodes) {
      if (!isRecord(node)) continue;
      if (
        typeof node.id === 'string' &&
        typeof node.x === 'number' &&
        typeof node.y === 'number' &&
        typeof node.width === 'number' &&
        typeof node.height === 'number'
      ) {
        nodes.push({
          id: node.id,
          x: node.x,
          y: node.y,
          width: node.width,
          height: node.height,
          attrs: isRecord(node.attrs) ? node.attrs : undefined,
        });
      }
    }
  }
  const edges: EditorDiagramLayer['edges'] = [];
  if (Array.isArray(value.edges)) {
    for (const edge of value.edges) {
      if (!isRecord(edge)) continue;
      if (
        typeof edge.id === 'string' &&
        typeof edge.sourceNodeId === 'string' &&
        typeof edge.targetNodeId === 'string'
      ) {
        edges.push({
          id: edge.id,
          sourceNodeId: edge.sourceNodeId,
          targetNodeId: edge.targetNodeId,
          attrs: isRecord(edge.attrs) ? edge.attrs : undefined,
        });
      }
    }
  }
  return { version: 1, nodes, edges };
};

const cloneJson = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const sanitizeFileName = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9а-яё_-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

export function useNotationExport(
  notation: Ref<NotationData | null>,
  state: Ref<NotationEditorState>,
  selectedEntity: Ref<{ kind: "component" | "relation"; id: string } | null>,
  diagramRenderer: Ref<DiagramRenderer | null>,
  saveError: Ref<string | null>,
  saveSuccess: Ref<boolean>,
  importNotationInputRef: Ref<HTMLInputElement | null>
) {
  const {t} = useI18n();

  const showAttrsJson = ref(false);
  const attrsJsonContent = ref("");

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
      saveError.value = t("notations.diagramNotReady");
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
      saveError.value = t("notations.diagramNotReady");
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
      throw new Error(t("notations.importFormatError"));
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
      const parsedAttrs = parseTypeAttrs(JSON.stringify(item.parsedAttrs ?? {}));
      delete parsedAttrs.documentFileId;
      return {
        id,
        name: toStringOr(item.name, t("notations.defaultNodeTypeName")),
        ownerId: toStringOr(item.ownerId, baseOwnerId),
        createdAt: null,
        updatedAt: null,
        parsedAttrs,
        _isNew: true
      };
    });

    const linkTypes: EditorLinkType[] = toObjectArray(source.linkTypes).map((item) => {
      const importedId = toStringOr(item.id, createId());
      const id = createId();
      linkTypeIdMap.set(importedId, id);
      const parsedAttrs = parseTypeAttrs(JSON.stringify(item.parsedAttrs ?? {}));
      delete parsedAttrs.documentFileId;
      return {
        id,
        name: toStringOr(item.name, t("notations.defaultLinkTypeName")),
        ownerId: toStringOr(item.ownerId, baseOwnerId),
        createdAt: null,
        updatedAt: null,
        parsedAttrs,
        _isNew: true
      };
    });

    if (nodeTypes.length === 0) {
      nodeTypes.push({
        id: createId(),
        name: t("notations.defaultNodeTypeName"),
        ownerId: baseOwnerId,
        parsedAttrs: {},
        _isNew: true
      });
    }
    if (linkTypes.length === 0) {
      linkTypes.push({
        id: createId(),
        name: t("notations.defaultLinkTypeName"),
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
      const parsedAttrs = parseEntityAttrs(JSON.stringify(item.parsedAttrs ?? {}));
      delete parsedAttrs.documentFileId;
      const issues = validateCompositeDiagramStyle(parsedAttrs.diagramStyle, t);
      const integrityError = issues.find((issue) => issue.code === "A5_TARGET_NOT_FOUND");
      if (integrityError) {
        throw new Error(integrityError.message);
      }
      return {
        id,
        name: toStringOr(item.name, t("notations.newComponentTitle")),
        version: toStringOr(item.version, "1.0.0"),
        notationId: baseNotationId,
        ownerId: toStringOr(item.ownerId, baseOwnerId),
        nodeTypeId: nodeTypeIds.has(mappedNodeTypeId) ? mappedNodeTypeId : defaultNodeTypeId,
        createdAt: null,
        updatedAt: null,
        parsedAttrs,
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
      const parsedAttrs = parseEntityAttrs(JSON.stringify(item.parsedAttrs ?? {}));
      delete parsedAttrs.documentFileId;
      return {
        id,
        name: toStringOr(item.name, t("notations.defaultRelationName")),
        version: toStringOr(item.version, "1.0.0"),
        notationId: baseNotationId,
        ownerId: toStringOr(item.ownerId, baseOwnerId),
        linkTypeId: linkTypeIds.has(mappedLinkTypeId) ? mappedLinkTypeId : defaultLinkTypeId,
        createdAt: null,
        updatedAt: null,
        parsedAttrs,
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

    const importedLayerRaw =
      (isRecord(source.diagramLayer) ? source.diagramLayer : null) ??
      (isRecord(source.editorDiagramLayer) ? source.editorDiagramLayer : null);

    return {
      notationId: baseNotationId,
      ownerId: baseOwnerId,
      nodeTypes,
      linkTypes,
      components,
      relations,
      relationRules,
      diagramLayer: normalizeDiagramLayer(importedLayerRaw),
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
          ? t("notations.importError", {message: error.message})
          : t("notations.importReadError");
    } finally {
      resetImportInput();
    }
  };

  const openAttrsJson = () => {
    const entity = selectedEntity.value;
    if (!entity) {
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
        attrsJsonContent.value = JSON.stringify(JSON.parse(serializeEntityAttrs(item.parsedAttrs)), null, 2);
      }
    } else {
      const item = state.value.relations.find(r => r.id === entity.id);
      if (item) {
        attrsJsonContent.value = JSON.stringify(JSON.parse(serializeEntityAttrs(item.parsedAttrs)), null, 2);
      }
    }
    showAttrsJson.value = true;
  };

  const copyAttrsJson = () => {
    navigator.clipboard.writeText(attrsJsonContent.value);
  };

  return {
    showAttrsJson,
    attrsJsonContent,
    exportNotation,
    exportDiagramAsPng,
    exportDiagramAsSvg,
    triggerNotationImport,
    handleNotationImportChange,
    openAttrsJson,
    copyAttrsJson
  };
}
