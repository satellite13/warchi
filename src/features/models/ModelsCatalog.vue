<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import type { ModelData } from "@/types/entities";
import type { EntityListConfig } from "@/composables/useEntityList";
import EntityCatalog from "@/components/catalog/EntityCatalog.vue";
import { DEFAULT_ENTITY_ICONS } from "@/config/iconOptions";
import { downloadModelPackage } from "./composables/useModelPackage";
import { sanitizeFileName } from "@/utils/sanitizeFileName";

const { t } = useI18n();
const exportError = ref<string | null>(null);

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
  try {
    const fileName = `${sanitizeFileName(item.name) || "model"}.zip`;
    await downloadModelPackage(item.id, fileName);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    exportError.value = t("models.packageExportFailed", { message });
  }
}
</script>

<template>
  <EntityCatalog
    :entity-list-config="config"
    editor-route-name="model-editor"
    i18n-prefix="models"
    :icon="DEFAULT_ENTITY_ICONS.model"
    resource-type="MODEL"
    :show-version-tree="true"
    :show-create-from-version-button="true"
    can-export
    :action-error-message="exportError"
    @export="handleExport"
  />
</template>
