import {ref, type Ref} from "vue";
import {useI18n} from "vue-i18n";
import {ImageExporter, SvgExporter, type DiagramRenderer} from "@ngroznykh/papirus";
import { serializeEntityAttrs, serializeTypeAttrs } from "@/domain/attrs/notationAttrs";
import { useNodeShapes } from "@/composables/useNodeShapes";
import { buildExportShapes } from "@/features/notations/utils/buildExportShapes";
import type { ExportedNodeShape } from "@/features/notations/utils/exportedNodeShape";
import {
  analyzeNotationImportLocalOnly,
  normalizeNotationImport,
  type LocalOnlyPolicy,
  type NotationImportLocalOnlySummary,
} from "@/features/notations/utils/normalizeNotationImport";
import type {NotationData} from "@/types/entities";
import { sanitizeFileName } from "@/utils/sanitizeFileName";
import type { NotationEditorState } from "../types";

type NotationExportPayloadV2 = {
  format: "warchi-notation-export";
  version: 2;
  exportedAt: string;
  notation: {
    id: string;
    name: string;
    version: string;
  };
  state: NotationEditorState;
  shapes: ExportedNodeShape[];
};

const cloneJson = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function useNotationExport(
  notation: Ref<NotationData | null>,
  state: Ref<NotationEditorState>,
  pendingShapes: Ref<ExportedNodeShape[]>,
  selectedEntity: Ref<{ kind: "component" | "relation"; id: string } | null>,
  diagramRenderer: Ref<DiagramRenderer | null>,
  saveError: Ref<string | null>,
  saveSuccess: Ref<boolean>,
  importNotationInputRef: Ref<HTMLInputElement | null>
) {
  const {t} = useI18n();
  const { fetchById } = useNodeShapes();

  const showAttrsJson = ref(false);
  const attrsJsonContent = ref("");
  const showImportMergeDialog = ref(false);
  const importMergeSummary = ref<NotationImportLocalOnlySummary | null>(null);
  const pendingImportRaw = ref<unknown>(null);

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

  const exportNotation = async () => {
    const currentNotation = notation.value;
    const fallbackNotationId = state.value.notationId || "notation";
    const exportState = buildExportState();
    const shapes = await buildExportShapes({
      components: exportState.components,
      pendingShapes: pendingShapes.value,
      fetchById,
    });

    const payload: NotationExportPayloadV2 = {
      format: "warchi-notation-export",
      version: 2,
      exportedAt: new Date().toISOString(),
      notation: {
        id: currentNotation?.id ?? fallbackNotationId,
        name: currentNotation?.name ?? "Notation",
        version: currentNotation?.version ?? "1.0.0"
      },
      state: exportState,
      shapes,
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

  const clearPendingImport = () => {
    pendingImportRaw.value = null;
    importMergeSummary.value = null;
    showImportMergeDialog.value = false;
  };

  const applyNotationImport = (raw: unknown, localOnlyPolicy: LocalOnlyPolicy) => {
    const { state: nextState, pendingShapes: nextShapes } = normalizeNotationImport(raw, {
      baseOwnerId: state.value.ownerId,
      baseNotationId: state.value.notationId,
      baseState: state.value,
      localOnlyPolicy,
      t,
    });
    state.value = nextState;
    pendingShapes.value = nextShapes;
    saveError.value = null;
    saveSuccess.value = false;
    clearPendingImport();
  };

  const handleNotationImportChange = async (event: Event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const summary = analyzeNotationImportLocalOnly(parsed, state.value, t);
      if (summary.total > 0) {
        pendingImportRaw.value = parsed;
        importMergeSummary.value = summary;
        showImportMergeDialog.value = true;
        return;
      }
      applyNotationImport(parsed, "keep");
    } catch (error) {
      clearPendingImport();
      saveError.value =
        error instanceof Error
          ? t("notations.importError", {message: error.message})
          : t("notations.importReadError");
    } finally {
      resetImportInput();
    }
  };

  const confirmImportMergeKeep = () => {
    const raw = pendingImportRaw.value;
    if (raw === null) return;
    try {
      applyNotationImport(raw, "keep");
    } catch (error) {
      clearPendingImport();
      saveError.value =
        error instanceof Error
          ? t("notations.importError", {message: error.message})
          : t("notations.importReadError");
    }
  };

  const confirmImportMergeDelete = () => {
    const raw = pendingImportRaw.value;
    if (raw === null) return;
    try {
      applyNotationImport(raw, "delete");
    } catch (error) {
      clearPendingImport();
      saveError.value =
        error instanceof Error
          ? t("notations.importError", {message: error.message})
          : t("notations.importReadError");
    }
  };

  const cancelImportMerge = () => {
    clearPendingImport();
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
    showImportMergeDialog,
    importMergeSummary,
    exportNotation,
    exportDiagramAsPng,
    exportDiagramAsSvg,
    triggerNotationImport,
    handleNotationImportChange,
    confirmImportMergeKeep,
    confirmImportMergeDelete,
    cancelImportMerge,
    openAttrsJson,
    copyAttrsJson
  };
}
