<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { useAuth } from "../../composables/useAuth";
import { useEntityList } from "../../composables/useEntityList";
import { apiPut } from "../../composables/useApi";
import { getUserDisplayName } from "../../utils/userDisplay";
import { toAccessLabel } from "../../utils/accessPermission";
import type { NotationUpdateRequest } from "../../types/api";
import type { NotationData } from "../../types/entities";
import ListHeader from "../../components/list/ListHeader.vue";
import EntityCard from "../../components/cards/EntityCard.vue";
import CreateCard from "../../components/cards/CreateCard.vue";
import CardSkeleton from "../../components/cards/CardSkeleton.vue";
import EmptyState from "../../components/list/EmptyState.vue";
import EntityCreateModal from "../../components/modals/EntityCreateModal.vue";
import EntityDeleteModal from "../../components/modals/EntityDeleteModal.vue";
import EntityRenameModal from "../../components/modals/EntityRenameModal.vue";
import ShareAccessModal from "../../components/modals/ShareAccessModal.vue";

const router = useRouter();
const { t, locale } = useI18n();
const { currentUser } = useAuth();

const {
  items,
  ownerEmails,
  isLoading,
  errorMessage,
  searchQuery,
  selectedVersionByName,
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
  openCreateModal,
  closeCreateModal,
  openDeleteModal,
  closeDeleteModal,
  getSelectedItem,
  handleVersionChange,
  createItem,
  deleteItem
} = useEntityList<NotationData>({
  endpoint: "notations",
  entityName: t("notations.entityName"),
  entityNamePlural: t("notations.entityNamePlural"),
  conflictMessage: t("notations.conflictMessage"),
  notFoundMessage: t("notations.notFoundMessage"),
  createNotFoundMessage: t("notations.ownerNotFoundMessage")
});

const openNotation = (id: string) => {
  router.push({ name: "notation-editor", params: { id } });
};

const showRenameModal = ref(false);
const itemToRename = ref<NotationData | null>(null);
const renameName = ref("");
const renameError = ref<string | null>(null);
const isRenaming = ref(false);


const openRenameModal = (item: NotationData) => {
  itemToRename.value = item;
  renameName.value = item.name;
  renameError.value = null;
  showRenameModal.value = true;
};

const closeRenameModal = () => {
  showRenameModal.value = false;
  itemToRename.value = null;
  renameName.value = "";
  renameError.value = null;
  isRenaming.value = false;
};

const renameItem = async () => {
  if (!itemToRename.value) return;
  const trimmedName = renameName.value.trim();
  if (!trimmedName) {
    renameError.value = t("notations.enterName");
    return;
  }
  const current = itemToRename.value;
  if (trimmedName === current.name) {
    closeRenameModal();
    return;
  }
  const hasConflict = items.value.some(
    (item) =>
      item.id !== current.id &&
      item.version === current.version &&
      item.name.trim().toLowerCase() === trimmedName.toLowerCase()
  );
  if (hasConflict) {
    renameError.value = t("notations.conflictMessage");
    return;
  }

  isRenaming.value = true;
  renameError.value = null;
  try {
    const request: NotationUpdateRequest = {
      name: trimmedName,
      version: current.version,
      ownerId: current.ownerId,
      attrs: current.attrs ?? null
    };
    const result = await apiPut<NotationData>(`/notations/${current.id}`, request);
    if (!result.success) {
      if (result.error.status === 409) {
        throw new Error(t("notations.conflictMessage"));
      }
      throw new Error(result.error.message);
    }

    const previousName = current.name;
    items.value = items.value.map((item) => (item.id === current.id ? result.data : item));
    if (selectedVersionByName.value[previousName] === current.version) {
      const nextSelection = { ...selectedVersionByName.value };
      delete nextSelection[previousName];
      nextSelection[result.data.name] = result.data.version;
      selectedVersionByName.value = nextSelection;
    }
    closeRenameModal();
  } catch (error) {
    renameError.value = error instanceof Error ? error.message : t("notations.renameFailed");
  } finally {
    isRenaming.value = false;
  }
};

const showShareModal = ref(false);
const shareTargetId = ref<string | null>(null);

const handleCreate = () => {
  if (currentUser.value) {
    createItem(currentUser.value.id, getUserDisplayName(currentUser.value, t("common.unknownUser")));
  }
};

const openShareModal = (item: NotationData) => {
  shareTargetId.value = item.id;
  showShareModal.value = true;
};
</script>

<template>
  <main class="home">
    <header class="home-header">
      <ListHeader v-model="searchQuery" :placeholder="t('notations.searchPlaceholder')" :count="itemCount" :loading="isLoading"/>
    </header>

    <section class="model-grid">
      <CreateCard :title="t('notations.createTitle')" :description="t('notations.createDescription')" @click="openCreateModal"/>
      <CardSkeleton v-if="isLoading" :count="4"/>
      <div v-else-if="errorMessage" class="error-state">
        {{ errorMessage }}
      </div>

      <EmptyState
        v-else-if="filteredItems.length === 0 && searchQuery"
        :title="t('notations.notFoundTitle')" :description="t('notations.notFoundDescription')" icon="search"
      />

      <EntityCard
        v-for="group in filteredItems"
        :id="getSelectedItem(group)?.id || group.name"
        :key="group.name"
        :name="group.name"
        :version="getSelectedItem(group)?.version || ''"
        :versions="group.versions.map((notation) => notation.version)"
        :owner-email="ownerEmails.get(getSelectedItem(group)?.ownerId || '')"
        :access-label="toAccessLabel(getSelectedItem(group)?.accessPermission, locale)"
        :can-share="
          !!getSelectedItem(group)?.ownerId &&
          !!currentUser?.id &&
          getSelectedItem(group)?.ownerId === currentUser.id
        "
        :updated-at="getSelectedItem(group)?.updatedAt"
        @click="getSelectedItem(group) && openNotation(getSelectedItem(group)!.id)"
        @delete="getSelectedItem(group) && openDeleteModal(getSelectedItem(group)!)"
        @rename="getSelectedItem(group) && openRenameModal(getSelectedItem(group)!)"
        @share="getSelectedItem(group) && openShareModal(getSelectedItem(group)!)"
        @version-change="handleVersionChange(group.name, $event)"
      >
        <template #icon><span class="material-symbols-outlined" :title="t('notations.entityName')">graph_3</span></template>
      </EntityCard>
    </section>

    <EntityCreateModal
      v-if="showCreateModal"
      v-model:name="newItemName"
      v-model:version="newItemVersion"
      v-model:source-version-id="sourceVersionId"
      :title="t('notations.createTitle')"
      :name-label="t('common.name')"
      :name-placeholder="t('notations.namePlaceholder')"
      :version-label="t('common.version')"
      version-placeholder="1.0.0"
      name-id="notation-name"
      version-id="notation-version"
      :source-versions="sourceVersions"
      :is-submitting="isCreating"
      :error="createError"
      @close="closeCreateModal"
      @submit="handleCreate"
    />

    <EntityDeleteModal
      v-if="showDeleteModal"
      :title="t('notations.deleteTitle')"
      :entity-label="t('notations.entityLabelAccusative')"
      :entity-name="itemToDelete?.name"
      :is-deleting="isDeleting"
      :error="deleteError"
      @close="closeDeleteModal"
      @confirm="deleteItem"
    />

    <EntityRenameModal
      v-if="showRenameModal"
      :title="t('notations.renameTitle')"
      :name="renameName"
      :is-renaming="isRenaming"
      :error="renameError"
      :name-placeholder="t('notations.namePlaceholder')"
      @close="closeRenameModal"
      @submit="renameItem"
      @update:name="renameName = $event"
    />

    <ShareAccessModal
      v-if="showShareModal && shareTargetId"
      :title="t('notations.accessTitle')"
      resource-type="NOTATION"
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
