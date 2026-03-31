<script setup lang="ts">
import { useI18n } from "vue-i18n";
import type { NotationData } from "@/types/entities";
import type { EntityListConfig } from "@/composables/useEntityList";
import EntityCatalog from "@/components/catalog/EntityCatalog.vue";
import { DEFAULT_ENTITY_ICONS } from "@/config/iconOptions";

const { t } = useI18n();

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
</script>

<template>
  <EntityCatalog
    :entity-list-config="config"
    editor-route-name="notation-editor"
    i18n-prefix="notations"
    :icon="DEFAULT_ENTITY_ICONS.notation"
    resource-type="NOTATION"
    :show-version-tree="true"
    :show-create-from-version-button="true"
  />
</template>
