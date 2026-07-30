<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import type { ModelData } from "@/types/entities";
import type { EntityListConfig } from "@/composables/useEntityList";
import EntityCatalog from "@/components/catalog/EntityCatalog.vue";
import { DEFAULT_ENTITY_ICONS } from "@/config/iconOptions";
import { downloadModelPackage, uploadModelPackage } from "./composables/useModelPackage";
import { sanitizeFileName } from "@/utils/sanitizeFileName";

const { t } = useI18n();
const router = useRouter();
const exportError = ref<string | null>(null);
const actionStatusMessage = ref<string | null>(null);
const packageInputRef = ref<HTMLInputElement | null>(null);
const isImporting = ref(false);

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

async function onPackageSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || isImporting.value) return;

  isImporting.value = true;
  exportError.value = null;
  actionStatusMessage.value = t("models.packageImporting");
  try {
    const result = await uploadModelPackage(file, pct => {
      actionStatusMessage.value =
        pct > 0 ? `${t("models.packageImporting")} ${pct}%` : t("models.packageImporting");
    });

    if (!result.ok) {
      actionStatusMessage.value = null;
      if (result.code === "CONFLICT") {
        exportError.value = t("models.packageImportConflict");
      } else if (result.code === "PAYLOAD_TOO_LARGE") {
        exportError.value = t("models.packageImportTooLarge");
      } else if (result.code === "BAD_REQUEST") {
        exportError.value = result.message?.trim()
          ? t("models.packageImportError", { message: result.message })
          : t("models.packageImportBadRequest");
      } else {
        exportError.value = t("models.packageImportError", { message: result.message });
      }
      return;
    }

    if (result.warnings.length > 0) {
      actionStatusMessage.value =
        result.warnings.length <= 2
          ? t("models.packageImportCompletedWithWarningsDetail", {
              messages: result.warnings.join("; "),
            })
          : t("models.packageImportCompletedWithWarnings", { count: result.warnings.length });
    } else {
      actionStatusMessage.value = null;
    }

    await router.push({ name: "model-editor", params: { id: result.modelId } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    actionStatusMessage.value = null;
    exportError.value = t("models.packageImportError", { message });
  } finally {
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
    @export="handleExport"
    @import-package="openPackagePicker"
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
