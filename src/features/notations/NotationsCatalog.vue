<script setup lang="ts">
import { computed, ref } from "vue";
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
import BaseModal from "../../components/modals/BaseModal.vue";
import ShareAccessModal from "../../components/modals/ShareAccessModal.vue";

const router = useRouter();
const { t } = useI18n();
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
const canSubmitRename = computed(() => renameName.value.trim().length > 0 && !isRenaming.value);

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
        :access-label="toAccessLabel(getSelectedItem(group)?.accessPermission)"
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

    <BaseModal v-if="showRenameModal" :title="t('notations.renameTitle')" @close="closeRenameModal">
      <form class="rename-form" @submit.prevent="renameItem">
        <label class="rename-form__field">
          <span class="rename-form__label">{{ t("common.name") }}</span>
          <input
            v-model="renameName"
            class="rename-form__input"
            type="text"
            :placeholder="t('notations.namePlaceholder')"
            :disabled="isRenaming"
            autofocus
          >
        </label>
        <div v-if="renameError" class="rename-form__error">{{ renameError }}</div>
        <div class="rename-form__actions">
          <button type="button" class="btn btn--secondary" :disabled="isRenaming" @click="closeRenameModal">
            {{ t("common.cancel") }}
          </button>
          <button type="submit" class="btn btn--primary" :disabled="!canSubmitRename">
            {{ isRenaming ? t("common.saving") : t("common.save") }}
          </button>
        </div>
      </form>
    </BaseModal>

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

.rename-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.rename-form__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.rename-form__label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-muted);
}

.rename-form__input {
  padding: 10px 12px;
  font-size: 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--base-text);
}

.rename-form__input:focus {
  outline: none;
  border-color: var(--primary);
}

.rename-form__input:disabled {
  opacity: 0.6;
}

.rename-form__error {
  padding: 12px 16px;
  background: var(--danger-soft);
  color: var(--danger);
  border-radius: var(--radius-sm);
  font-size: 14px;
  border: 1px solid rgba(239, 68, 68, 0.2);
}

.rename-form__actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.btn {
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 500;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease, opacity 0.2s ease;
  font-family: inherit;
  letter-spacing: 0.01em;
}

.btn--secondary {
  color: var(--text-muted);
  background: transparent;
  border: 1px solid var(--border);
}

.btn--secondary:hover:not(:disabled) {
  background: var(--surface-strong);
  color: var(--base-text);
}

.btn--secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn--primary {
  color: #fff;
  background: var(--primary);
  border: none;
}

.btn--primary:hover:not(:disabled) {
  background: var(--primary-hover);
}

.btn--primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
