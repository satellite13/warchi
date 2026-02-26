<script setup lang="ts">
import { useI18n } from "vue-i18n";
import type { ModelData } from "../../types/entities";
import type { EntityListConfig } from "../../composables/useEntityList";
import EntityCatalog from "../../components/catalog/EntityCatalog.vue";

const { t } = useI18n();

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
  })
};
</script>

<template>
  <EntityCatalog
    :entity-list-config="config"
    editor-route-name="model-editor"
    i18n-prefix="models"
    icon="schema"
    resource-type="MODEL"
  />
</template>
