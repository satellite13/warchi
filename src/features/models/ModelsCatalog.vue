<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { useAuth } from "../../composables/useAuth";
import { useEntityList } from "../../composables/useEntityList";
import { apiPut } from "../../composables/useApi";
import { getUserDisplayName } from "../../utils/userDisplay";
import { toAccessLabel } from "../../utils/accessPermission";
import type { ModelUpdateRequest } from "../../types/api";
import type { ModelData } from "../../types/entities";
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
} = useEntityList<ModelData>({
  endpoint: "models",
  entityName: t("models.entityName"),
  entityNamePlural: t("models.entityNamePlural"),
  conflictMessage: t("models.conflictMessage"),
  notFoundMessage: t("models.notFoundMessage"),
  createNotFoundMessage: t("models.ownerNotFoundMessage")
});

const openModel = (id: string) => {
  router.push({ name: "model-editor", params: { id } });
};

const handleCreate = () => {
  if (currentUser.value) {
    createItem(currentUser.value.id, getUserDisplayName(currentUser.value, t("common.unknownUser")));
  }
};

const showRenameModal = ref(false);
const itemToRename = ref<ModelData | null>(null);
const renameName = ref("");
const renameError = ref<string | null>(null);
const isRenaming = ref(false);


const showShareModal = ref(false);
const shareTargetId = ref<string | null>(null);

const openRenameModal = (item: ModelData) => {
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
    renameError.value = t("models.enterName");
    return;
  }
  const current = itemToRename.value;
  if (trimmedName === current.name) {
    closeRenameModal();
    return;
  }
  const hasConflict = items.value.some((item) =>
    item.id !== current.id &&
    item.version === current.version &&
    item.name.trim().toLowerCase() === trimmedName.toLowerCase()
  );
  if (hasConflict) {
    renameError.value = t("models.conflictMessage");
    return;
  }

  isRenaming.value = true;
  renameError.value = null;
  try {
    const request: ModelUpdateRequest = {
      name: trimmedName,
      version: current.version,
      ownerId: current.ownerId,
      attrs: current.attrs ?? null
    };
    const result = await apiPut<ModelData>(`/models/${current.id}`, request);
    if (!result.success) {
      if (result.error.status === 409) {
        throw new Error(t("models.conflictMessage"));
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
    renameError.value = error instanceof Error ? error.message : t("models.renameFailed");
  } finally {
    isRenaming.value = false;
  }
};

const openShareModal = (item: ModelData) => {
  shareTargetId.value = item.id;
  showShareModal.value = true;
};
</script>

<template>
  <main class="home">
    <header class="home-header">
      <ListHeader
        v-model="searchQuery"
        :placeholder="t('models.searchPlaceholder')"
        :count="itemCount"
        :loading="isLoading"
      />
    </header>

    <section class="model-grid">
      <CreateCard :title="t('models.createTitle')" :description="t('models.createDescription')" @click="openCreateModal"/>
      <CardSkeleton v-if="isLoading" :count="4"/>
      <div v-else-if="errorMessage" class="error-state">{{ errorMessage }}</div>
      <EmptyState
        v-else-if="filteredItems.length === 0 && searchQuery"
        :title="t('models.notFoundTitle')"
        :description="t('models.notFoundDescription')"
        icon="search"
      />

      <EntityCard
        v-for="group in filteredItems"
        :id="getSelectedItem(group)?.id || group.name"
        :key="group.name"
        :name="group.name"
        :version="getSelectedItem(group)?.version || ''"
        :versions="group.versions.map((model) => model.version)"
        :owner-email="ownerEmails.get(getSelectedItem(group)?.ownerId || '')"
        :access-label="toAccessLabel(getSelectedItem(group)?.accessPermission, locale)"
        :can-share="
          !!getSelectedItem(group)?.ownerId &&
          !!currentUser?.id &&
          getSelectedItem(group)?.ownerId === currentUser.id
        "
        :updated-at="getSelectedItem(group)?.updatedAt"
        @click="getSelectedItem(group) && openModel(getSelectedItem(group)!.id)"
        @delete="getSelectedItem(group) && openDeleteModal(getSelectedItem(group)!)"
        @rename="getSelectedItem(group) && openRenameModal(getSelectedItem(group)!)"
        @share="getSelectedItem(group) && openShareModal(getSelectedItem(group)!)"
        @version-change="handleVersionChange(group.name, $event)"
      >
        <template #icon><span class="material-symbols-outlined" :title="t('models.entityName')">schema</span></template>
      </EntityCard>
    </section>

    <EntityCreateModal
      v-if="showCreateModal"
      v-model:name="newItemName"
      v-model:version="newItemVersion"
      :title="t('models.createTitle')"
      :name-label="t('common.name')"
      :name-placeholder="t('models.namePlaceholder')"
      :version-label="t('common.version')"
      version-placeholder="1.0.0"
      name-id="model-name"
      version-id="model-version"
      :is-submitting="isCreating"
      :error="createError"
      @close="closeCreateModal"
      @submit="handleCreate"
    />

    <EntityDeleteModal
      v-if="showDeleteModal"
      :title="t('models.deleteTitle')"
      :entity-label="t('models.entityLabelAccusative')"
      :entity-name="itemToDelete?.name"
      :is-deleting="isDeleting"
      :error="deleteError"
      @close="closeDeleteModal"
      @confirm="deleteItem"
    />

    <EntityRenameModal
      v-if="showRenameModal"
      :title="t('models.renameTitle')"
      :name="renameName"
      :is-renaming="isRenaming"
      :error="renameError"
      :name-placeholder="t('models.namePlaceholder')"
      @close="closeRenameModal"
      @submit="renameItem"
      @update:name="renameName = $event"
    />

    <ShareAccessModal
      v-if="showShareModal && shareTargetId"
      :title="t('models.accessTitle')"
      resource-type="MODEL"
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
