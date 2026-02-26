<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { useAuth } from "../../composables/useAuth";
import { useEntityList, type EntityListConfig } from "../../composables/useEntityList";
import { getUserDisplayName } from "../../utils/userDisplay";
import { toAccessLabel } from "../../utils/accessPermission";
import type { VersionedEntity } from "../../types/entities";
import type { ShareResourceType } from "../../types/api";
import ListHeader from "../list/ListHeader.vue";
import EntityCard from "../cards/EntityCard.vue";
import CreateCard from "../cards/CreateCard.vue";
import CardSkeleton from "../cards/CardSkeleton.vue";
import EmptyState from "../list/EmptyState.vue";
import EntityCreateModal from "../modals/EntityCreateModal.vue";
import EntityDeleteModal from "../modals/EntityDeleteModal.vue";
import EntityRenameModal from "../modals/EntityRenameModal.vue";
import ShareAccessModal from "../modals/ShareAccessModal.vue";

const props = defineProps<{
  entityListConfig: EntityListConfig<VersionedEntity & { attrs?: string | null }>
  editorRouteName: string
  i18nPrefix: string
  icon: string
  resourceType: ShareResourceType
}>();

const router = useRouter();
const { t, locale } = useI18n();
const { currentUser } = useAuth();

const {
  ownerEmails,
  isLoading,
  errorMessage,
  searchQuery,
  filteredItems,
  itemCount,
  showCreateModal,
  newItemName,
  newItemVersion,
  sourceVersionId,
  sourceVersions,
  isCreating,
  createError,
  showDeleteModal,
  itemToDelete,
  isDeleting,
  deleteError,
  showRenameModal,
  renameName,
  renameError,
  isRenaming,
  openCreateModal,
  closeCreateModal,
  openDeleteModal,
  closeDeleteModal,
  openRenameModal,
  closeRenameModal,
  renameItem,
  getSelectedItem,
  handleVersionChange,
  createItem,
  deleteItem
} = useEntityList(props.entityListConfig);

const openEntity = (id: string) => {
  router.push({ name: props.editorRouteName, params: { id } });
};

const handleCreate = () => {
  if (currentUser.value) {
    createItem(currentUser.value.id, getUserDisplayName(currentUser.value, t("common.unknownUser")));
  }
};

const showShareModal = ref(false);
const shareTargetId = ref<string | null>(null);

const openShareModal = (item: VersionedEntity) => {
  shareTargetId.value = item.id;
  showShareModal.value = true;
};
</script>

<template>
  <main class="home">
    <header class="home-header">
      <ListHeader
        v-model="searchQuery"
        :placeholder="t(`${i18nPrefix}.searchPlaceholder`)"
        :count="itemCount"
        :loading="isLoading"
      />
    </header>

    <section class="model-grid">
      <CreateCard
        :title="t(`${i18nPrefix}.createTitle`)"
        :description="t(`${i18nPrefix}.createDescription`)"
        @click="openCreateModal"
      />
      <CardSkeleton v-if="isLoading" :count="4" />
      <div v-else-if="errorMessage" class="error-state">{{ errorMessage }}</div>
      <EmptyState
        v-else-if="filteredItems.length === 0 && searchQuery"
        :title="t(`${i18nPrefix}.notFoundTitle`)"
        :description="t(`${i18nPrefix}.notFoundDescription`)"
        icon="search"
      />

      <EntityCard
        v-for="group in filteredItems"
        :id="getSelectedItem(group)?.id || group.name"
        :key="group.name"
        :name="group.name"
        :version="getSelectedItem(group)?.version || ''"
        :versions="group.versions.map((item) => item.version)"
        :owner-email="ownerEmails.get(getSelectedItem(group)?.ownerId || '')"
        :access-label="toAccessLabel(getSelectedItem(group)?.accessPermission, locale)"
        :can-share="
          !!getSelectedItem(group)?.ownerId &&
          !!currentUser?.id &&
          getSelectedItem(group)?.ownerId === currentUser.id
        "
        :updated-at="getSelectedItem(group)?.updatedAt"
        @click="getSelectedItem(group) && openEntity(getSelectedItem(group)!.id)"
        @delete="getSelectedItem(group) && openDeleteModal(getSelectedItem(group)!)"
        @rename="getSelectedItem(group) && openRenameModal(getSelectedItem(group)!)"
        @share="getSelectedItem(group) && openShareModal(getSelectedItem(group)!)"
        @version-change="handleVersionChange(group.name, $event)"
      >
        <template #icon>
          <span class="material-symbols-outlined" :title="t(`${i18nPrefix}.entityName`)">{{ icon }}</span>
        </template>
      </EntityCard>
    </section>

    <EntityCreateModal
      v-if="showCreateModal"
      v-model:name="newItemName"
      v-model:version="newItemVersion"
      v-model:source-version-id="sourceVersionId"
      :title="t(`${i18nPrefix}.createTitle`)"
      :name-label="t('common.name')"
      :name-placeholder="t(`${i18nPrefix}.namePlaceholder`)"
      :version-label="t('common.version')"
      version-placeholder="1.0.0"
      :name-id="`${i18nPrefix}-name`"
      :version-id="`${i18nPrefix}-version`"
      :source-versions="sourceVersions"
      :is-submitting="isCreating"
      :error="createError"
      @close="closeCreateModal"
      @submit="handleCreate"
    />

    <EntityDeleteModal
      v-if="showDeleteModal"
      :title="t(`${i18nPrefix}.deleteTitle`)"
      :entity-label="t(`${i18nPrefix}.entityLabelAccusative`)"
      :entity-name="itemToDelete?.name"
      :is-deleting="isDeleting"
      :error="deleteError"
      @close="closeDeleteModal"
      @confirm="deleteItem"
    />

    <EntityRenameModal
      v-if="showRenameModal"
      :title="t(`${i18nPrefix}.renameTitle`)"
      :name="renameName"
      :is-renaming="isRenaming"
      :error="renameError"
      :name-placeholder="t(`${i18nPrefix}.namePlaceholder`)"
      @close="closeRenameModal"
      @submit="renameItem"
      @update:name="renameName = $event"
    />

    <ShareAccessModal
      v-if="showShareModal && shareTargetId"
      :title="t(`${i18nPrefix}.accessTitle`)"
      :resource-type="resourceType"
      :resource-id="shareTargetId"
      @close="showShareModal = false; shareTargetId = null"
    />
  </main>
</template>

<style scoped>
.home {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  padding: 32px;
  color: var(--base-text);
  background: var(--base-bg);
  height: 100%;
  overflow: hidden;
}

.home-header {
  flex-shrink: 0;
  margin-bottom: 24px;
}

.model-grid {
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  gap: 16px;
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  margin: -8px;
}

.error-state {
  width: 100%;
  padding: 16px;
  border-radius: var(--radius);
  background: var(--danger-soft);
  color: var(--danger);
  font-size: 14px;
  border: 1px solid rgba(239, 68, 68, 0.2);
}
</style>
