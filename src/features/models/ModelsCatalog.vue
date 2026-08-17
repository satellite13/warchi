<script setup lang="ts">
import { nextTick, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import type { ModelData } from "@/types/entities";
import type { EntityListConfig } from "@/composables/useEntityList";
import EntityCatalog from "@/components/catalog/EntityCatalog.vue";
import { DEFAULT_ENTITY_ICONS } from "@/config/iconOptions";
import {
  downloadModelPackage,
  retryModelPackageImport,
  uploadModelPackage,
  type ModelPackageImportProgress,
  type ModelPackageImportResult,
} from "./composables/useModelPackage";
import { sanitizeFileName } from "@/utils/sanitizeFileName";
import ModelPackageConflictModal from "./components/ModelPackageConflictModal.vue";
import { shouldOpenModelPackageImport } from "./utils/modelPackageImportQuery";
import { findMissingIconsAfterModelImport } from "./utils/missingPackageIcons";

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const exportError = ref<string | null>(null);
const actionStatusMessage = ref<string | null>(null);
const packageInputRef = ref<HTMLInputElement | null>(null);
const isImporting = ref(false);

const showModelConflictModal = ref(false);
const conflictJobId = ref<string | null>(null);
const conflictOriginalName = ref("");
const conflictOriginalVersion = ref("");
const conflictName = ref("");
const conflictVersion = ref("");
const conflictModalError = ref<string | null>(null);
const isRetryingConflict = ref(false);

function statusMessageForImportProgress(progress: ModelPackageImportProgress): string {
  if (progress.phase === "uploading") {
    if (progress.percent > 0 && progress.percent < 100) {
      return `${t("models.packageImporting")} ${progress.percent}%`;
    }
    return t("models.packageImporting");
  }
  switch (progress.stage) {
    case "QUEUED":
      return t("models.packageImportStageQueued");
    case "VALIDATING":
      return t("models.packageImportStageValidating");
    case "IMPORTING_NOTATIONS":
      return t("models.packageImportStageNotations");
    case "IMPORTING_FILES":
      return t("models.packageImportStageFiles");
    case "CREATING_MODEL":
      return t("models.packageImportStageModel");
    case "DOCUMENT_REFS":
      return t("models.packageImportStageDocumentRefs");
    case "DONE":
      return t("models.packageImportStageDone");
    default:
      return t("models.packageImportProcessing");
  }
}

const config: EntityListConfig<ModelData> = {
  endpoint: "models",
  entityName: t("models.entityName"),
  entityNamePlural: t("models.entityNamePlural"),
  conflictMessage: t("models.conflictMessage"),
  notFoundMessage: t("models.notFoundMessage"),
  createNotFoundMessage: t("models.ownerNotFoundMessage"),
  enterNameMessage: t("models.enterName"),
  renameFailedMessage: t("models.renameFailed"),
  buildRenameRequest: (item, newName) => ({
    name: newName,
    version: item.version,
    ownerId: item.ownerId,
    attrs: item.attrs ?? null
  }),
  buildUpdateAttrsRequest: (item, nextAttrs) => ({
    name: item.name,
    version: item.version,
    ownerId: item.ownerId,
    attrs: nextAttrs
  })
};

function formatImportFailure(result: Extract<ModelPackageImportResult, { ok: false }>): string {
  if (result.code === "MODEL_EXISTS" && result.conflict) {
    return t("models.packageImportModelExistsHint", {
      name: result.conflict.name,
      version: result.conflict.version,
    });
  }
  if (result.code === "NOTATION_EXISTS_FORBIDDEN" && result.conflict) {
    return t("models.packageImportNotationForbidden", {
      name: result.conflict.name,
      version: result.conflict.version,
    });
  }
  if (result.code === "NOTATION_INCOMPATIBLE" && result.conflict) {
    const details = result.conflict.details ?? [];
    const shown = details.slice(0, 5);
    const rest = details.length - shown.length;
    const detailText = [
      ...shown,
      ...(rest > 0 ? [t("models.packageImportNotationIncompatibleMore", { count: rest })] : []),
    ].join("; ");
    const base = t("models.packageImportNotationIncompatible", {
      name: result.conflict.name,
      version: result.conflict.version,
    });
    return detailText ? `${base} ${detailText}` : base;
  }
  if (result.code === "CONFLICT") {
    return t("models.packageImportConflict");
  }
  if (result.code === "PAYLOAD_TOO_LARGE") {
    return t("models.packageImportTooLarge");
  }
  if (result.code === "TIMEOUT" || result.status === 504 || result.status === 502) {
    return t("models.packageImportTimeout");
  }
  if (result.code === "BAD_REQUEST") {
    return result.message?.trim()
      ? t("models.packageImportError", { message: result.message })
      : t("models.packageImportBadRequest");
  }
  return t("models.packageImportError", { message: result.message });
}

function openModelConflictModal(result: Extract<ModelPackageImportResult, { ok: false }>) {
  if (!result.jobId || !result.conflict) {
    exportError.value = formatImportFailure(result);
    return;
  }
  conflictJobId.value = result.jobId;
  conflictOriginalName.value = result.conflict.name;
  conflictOriginalVersion.value = result.conflict.version;
  conflictName.value = result.conflict.name;
  conflictVersion.value = result.conflict.suggestedVersion || result.conflict.version;
  conflictModalError.value = null;
  showModelConflictModal.value = true;
}

function closeModelConflictModal() {
  if (isRetryingConflict.value) return;
  showModelConflictModal.value = false;
  conflictJobId.value = null;
  conflictModalError.value = null;
}

async function handleImportSuccess(result: Extract<ModelPackageImportResult, { ok: true }>) {
  const warnings = [...result.warnings];
  try {
    const missingIcons = await findMissingIconsAfterModelImport(result.modelId);
    if (missingIcons.length > 0) {
      warnings.push(t("models.packageImportMissingIcons", { names: missingIcons.join(", ") }));
    }
  } catch {
    // Import already succeeded; missing-icon check is best-effort.
  }
  if (warnings.length > 0) {
    actionStatusMessage.value =
      warnings.length <= 2
        ? t("models.packageImportCompletedWithWarningsDetail", {
            messages: warnings.join("; "),
          })
        : t("models.packageImportCompletedWithWarnings", { count: warnings.length });
  } else {
    actionStatusMessage.value = null;
  }
  await router.push({ name: "model-editor", params: { id: result.modelId } });
}

async function handleExport(item: ModelData) {
  exportError.value = null;
  actionStatusMessage.value = null;
  try {
    const fileName = `${sanitizeFileName(item.name) || "model"}.zip`;
    await downloadModelPackage(item.id, fileName);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    exportError.value = t("models.packageExportFailed", { message });
  }
}

function openPackagePicker() {
  if (isImporting.value) return;
  exportError.value = null;
  actionStatusMessage.value = null;
  const input = packageInputRef.value;
  if (!input) return;
  input.value = "";
  const withPicker = input as HTMLInputElement & { showPicker?: () => void };
  if (typeof withPicker.showPicker === "function") {
    withPicker.showPicker();
  } else {
    input.click();
  }
}

async function consumeImportQuery() {
  if (!shouldOpenModelPackageImport(route.query)) return;
  const nextQuery = { ...route.query };
  delete nextQuery.import;
  await router.replace({ name: "models", query: nextQuery });
  await nextTick();
  openPackagePicker();
}

onMounted(() => {
  void consumeImportQuery();
});

async function onPackageSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || isImporting.value) return;

  isImporting.value = true;
  exportError.value = null;
  actionStatusMessage.value = t("models.packageImporting");
  try {
    const result = await uploadModelPackage(file, progress => {
      actionStatusMessage.value = statusMessageForImportProgress(progress);
    });

    if (!result.ok) {
      actionStatusMessage.value = null;
      if (result.code === "MODEL_EXISTS") {
        openModelConflictModal(result);
      } else {
        exportError.value = formatImportFailure(result);
      }
      return;
    }

    await handleImportSuccess(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    actionStatusMessage.value = null;
    exportError.value = t("models.packageImportError", { message });
  } finally {
    isImporting.value = false;
  }
}

async function submitModelConflictRetry() {
  const jobId = conflictJobId.value;
  if (!jobId || isRetryingConflict.value) return;

  const name = conflictName.value.trim();
  const version = conflictVersion.value.trim();
  if (!name || !version) return;

  isRetryingConflict.value = true;
  conflictModalError.value = null;
  isImporting.value = true;
  actionStatusMessage.value = t("models.packageImporting");
  exportError.value = null;
  try {
    const result = await retryModelPackageImport(
      jobId,
      { targetModelName: name, targetModelVersion: version },
      progress => {
        actionStatusMessage.value = statusMessageForImportProgress(progress);
      }
    );
    if (!result.ok) {
      actionStatusMessage.value = null;
      if (result.code === "MODEL_EXISTS") {
        conflictModalError.value = formatImportFailure(result);
        if (result.conflict) {
          conflictOriginalName.value = result.conflict.name;
          conflictOriginalVersion.value = result.conflict.version;
          conflictVersion.value = result.conflict.suggestedVersion || result.conflict.version;
        }
        if (result.jobId) {
          conflictJobId.value = result.jobId;
        }
      } else {
        showModelConflictModal.value = false;
        conflictJobId.value = null;
        exportError.value = formatImportFailure(result);
      }
      return;
    }

    showModelConflictModal.value = false;
    conflictJobId.value = null;
    await handleImportSuccess(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    conflictModalError.value = t("models.packageImportError", { message });
    actionStatusMessage.value = null;
  } finally {
    isRetryingConflict.value = false;
    isImporting.value = false;
  }
}
</script>

<template>
  <input
    ref="packageInputRef"
    class="models-catalog__package-input"
    type="file"
    accept=".zip,application/zip"
    @change="onPackageSelected"
  />
  <EntityCatalog
    :entity-list-config="config"
    editor-route-name="model-editor"
    i18n-prefix="models"
    :icon="DEFAULT_ENTITY_ICONS.model"
    resource-type="MODEL"
    :show-version-tree="true"
    :show-create-from-version-button="true"
    can-export
    can-import-package
    :action-error-message="exportError"
    :action-status-message="actionStatusMessage"
    :action-busy="isImporting"
    @export="handleExport"
    @import-package="openPackagePicker"
  />
  <ModelPackageConflictModal
    v-if="showModelConflictModal"
    :original-name="conflictOriginalName"
    :original-version="conflictOriginalVersion"
    :name="conflictName"
    :version="conflictVersion"
    :is-submitting="isRetryingConflict"
    :error="conflictModalError"
    @close="closeModelConflictModal"
    @submit="submitModelConflictRetry"
    @update:name="conflictName = $event"
    @update:version="conflictVersion = $event"
  />
</template>

<style scoped>
.models-catalog__package-input {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
