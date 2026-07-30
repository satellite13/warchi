<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import type { NotationData } from "@/types/entities";
import type { EntityListConfig } from "@/composables/useEntityList";
import EntityCatalog from "@/components/catalog/EntityCatalog.vue";
import { DEFAULT_ENTITY_ICONS } from "@/config/iconOptions";
import { downloadNotationExport } from "@/features/models/composables/useModelPackage";
import { uploadNotationExportJson } from "./composables/uploadNotationExport";

const { t } = useI18n();
const router = useRouter();
const exportError = ref<string | null>(null);
const actionStatusMessage = ref<string | null>(null);
const packageInputRef = ref<HTMLInputElement | null>(null);
const isImporting = ref(false);

const config: EntityListConfig<NotationData> = {
  endpoint: "notations",
  entityName: t("notations.entityName"),
  entityNamePlural: t("notations.entityNamePlural"),
  conflictMessage: t("notations.conflictMessage"),
  notFoundMessage: t("notations.notFoundMessage"),
  createNotFoundMessage: t("notations.ownerNotFoundMessage"),
  enterNameMessage: t("notations.enterName"),
  renameFailedMessage: t("notations.renameFailed"),
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

async function handleExport(item: NotationData) {
  exportError.value = null;
  actionStatusMessage.value = null;
  try {
    await downloadNotationExport(item.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    exportError.value = t("notations.notationExportFailed", { message });
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
  actionStatusMessage.value = t("notations.packageImporting");
  try {
    const result = await uploadNotationExportJson(file);

    if (!result.ok) {
      actionStatusMessage.value = null;
      if (result.code === "CONFLICT") {
        exportError.value = t("notations.packageImportConflict");
      } else if (result.status === 504 || result.status === 502) {
        exportError.value = t("notations.packageImportTimeout");
      } else if (result.code === "BAD_REQUEST") {
        exportError.value = result.message?.trim()
          ? t("notations.packageImportError", { message: result.message })
          : t("notations.packageImportBadRequest");
      } else {
        exportError.value = t("notations.packageImportError", { message: result.message });
      }
      return;
    }

    actionStatusMessage.value = null;
    await router.push({ name: "notation-editor", params: { id: result.notationId } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    actionStatusMessage.value = null;
    exportError.value = t("notations.packageImportError", { message });
  } finally {
    isImporting.value = false;
  }
}
</script>

<template>
  <input
    ref="packageInputRef"
    class="notations-catalog__package-input"
    type="file"
    accept=".json,application/json"
    @change="onPackageSelected"
  />
  <EntityCatalog
    :entity-list-config="config"
    editor-route-name="notation-editor"
    i18n-prefix="notations"
    :icon="DEFAULT_ENTITY_ICONS.notation"
    resource-type="NOTATION"
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
.notations-catalog__package-input {
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
