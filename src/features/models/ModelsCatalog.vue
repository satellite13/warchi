<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
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
import BaseModal from "../../components/modals/BaseModal.vue";
import ShareAccessModal from "../../components/modals/ShareAccessModal.vue";

const router = useRouter();
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
  entityName: "Модель",
  entityNamePlural: "модели",
  conflictMessage: "Модель с таким именем и версией уже существует",
  notFoundMessage: "Модель не найдена",
  createNotFoundMessage: "Владелец не найден"
});

const openModel = (id: string) => {
  router.push({ name: "model-editor", params: { id } });
};

const handleCreate = () => {
  if (currentUser.value) {
    createItem(currentUser.value.id, getUserDisplayName(currentUser.value, "Неизвестный пользователь"));
  }
};

const showRenameModal = ref(false);
const itemToRename = ref<ModelData | null>(null);
const renameName = ref("");
const renameError = ref<string | null>(null);
const isRenaming = ref(false);

const canSubmitRename = computed(() => renameName.value.trim().length > 0 && !isRenaming.value);
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
    renameError.value = "Введите название модели";
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
    renameError.value = "Модель с таким именем и версией уже существует";
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
        throw new Error("Модель с таким именем и версией уже существует");
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
    renameError.value = error instanceof Error ? error.message : "Не удалось переименовать модель";
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
        placeholder="Поиск по названию..."
        :count="itemCount"
        :loading="isLoading"
      />
    </header>

    <section class="model-grid">
      <CreateCard title="Создать модель" description="Новая архитектурная модель" @click="openCreateModal"/>
      <CardSkeleton v-if="isLoading" :count="4"/>
      <div v-else-if="errorMessage" class="error-state">{{ errorMessage }}</div>
      <EmptyState
        v-else-if="filteredItems.length === 0 && searchQuery"
        title="Модели не найдены"
        description="Попробуйте изменить поисковый запрос"
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
        :access-label="toAccessLabel(getSelectedItem(group)?.accessPermission)"
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
        <template #icon><span class="material-symbols-outlined" title="Модель">schema</span></template>
      </EntityCard>
    </section>

    <EntityCreateModal
      v-if="showCreateModal"
      v-model:name="newItemName"
      v-model:version="newItemVersion"
      title="Создать модель"
      name-label="Название"
      name-placeholder="Название модели"
      version-label="Версия"
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
      title="Удалить модель"
      entity-label="модель"
      :entity-name="itemToDelete?.name"
      :is-deleting="isDeleting"
      :error="deleteError"
      @close="closeDeleteModal"
      @confirm="deleteItem"
    />

    <BaseModal v-if="showRenameModal" title="Переименовать модель" @close="closeRenameModal">
      <form class="rename-form" @submit.prevent="renameItem">
        <label class="rename-form__field">
          <span class="rename-form__label">Название</span>
          <input
            v-model="renameName"
            class="rename-form__input"
            type="text"
            placeholder="Название модели"
            :disabled="isRenaming"
            autofocus
          >
        </label>
        <div v-if="renameError" class="rename-form__error">{{ renameError }}</div>
        <div class="rename-form__actions">
          <button type="button" class="btn btn--secondary" :disabled="isRenaming" @click="closeRenameModal">
            Отмена
          </button>
          <button type="submit" class="btn btn--primary" :disabled="!canSubmitRename">
            {{ isRenaming ? "Сохранение..." : "Сохранить" }}
          </button>
        </div>
      </form>
    </BaseModal>

    <ShareAccessModal
      v-if="showShareModal && shareTargetId"
      title="Доступ к модели"
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
