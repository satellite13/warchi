<script setup lang="ts">
import { useRouter } from "vue-router";
import { useAuth } from "../../composables/useAuth";
import { useEntityList } from "../../composables/useEntityList";
import type { NotationData } from "../../types/entities";
import ListHeader from "../../components/list/ListHeader.vue";
import EntityCard from "../../components/cards/EntityCard.vue";
import CreateCard from "../../components/CreateCard.vue";
import CardSkeleton from "../../components/CardSkeleton.vue";
import EmptyState from "../../components/EmptyState.vue";
import EntityCreateModal from "../../components/modals/EntityCreateModal.vue";
import EntityDeleteModal from "../../components/modals/EntityDeleteModal.vue";

const router = useRouter();
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
  entityName: "Нотация",
  entityNamePlural: "нотации",
  conflictMessage: "Нотация с таким именем и версией уже существует",
  notFoundMessage: "Нотация не найдена"
});

const openNotation = (id: string) => {
  router.push({ name: "notation-editor", params: { id } });
};

const handleCreate = () => {
  if (currentUser.value) {
    createItem(currentUser.value.id, currentUser.value.email);
  }
};
</script>

<template>
  <main class="home">
    <header class="home-header">
      <ListHeader v-model="searchQuery" placeholder="Поиск по названию..." :count="itemCount" :loading="isLoading"/>
    </header>

    <section class="model-grid">
      <CreateCard title="Создать нотацию" description="Новый набор правил" @click="openCreateModal"/>
      <CardSkeleton v-if="isLoading" :count="4"/>
      <div v-else-if="errorMessage" class="error-state">
        {{ errorMessage }}
      </div>

      <EmptyState
        v-else-if="filteredItems.length === 0 && searchQuery"
        title="Нотации не найдены" description="Попробуйте изменить поисковый запрос" icon="search"
      />

      <EntityCard
        v-for="group in filteredItems"
        :id="getSelectedItem(group)?.id || group.name"
        :key="group.name"
        :name="group.name"
        :version="getSelectedItem(group)?.version || ''"
        :versions="group.versions.map((notation) => notation.version)"
        :owner-email="ownerEmails.get(getSelectedItem(group)?.ownerId || '')"
        :updated-at="getSelectedItem(group)?.updatedAt"
        @click="getSelectedItem(group) && openNotation(getSelectedItem(group)!.id)"
        @delete="getSelectedItem(group) && openDeleteModal(getSelectedItem(group)!)"
        @version-change="handleVersionChange(group.name, $event)"
      >
        <template #icon><span class="material-symbols-outlined" title="Нотация">graph_3</span></template>
      </EntityCard>
    </section>

    <EntityCreateModal
      v-if="showCreateModal"
      v-model:name="newItemName"
      v-model:version="newItemVersion"
      title="Создать нотацию"
      name-label="Название"
      name-placeholder="Название нотации"
      version-label="Версия"
      version-placeholder="1.0.0"
      name-id="notation-name"
      version-id="notation-version"
      :is-submitting="isCreating"
      :error="createError"
      @close="closeCreateModal"
      @submit="handleCreate"
    />

    <EntityDeleteModal
      v-if="showDeleteModal"
      title="Удалить нотацию"
      entity-label="нотацию"
      :entity-name="itemToDelete?.name"
      :is-deleting="isDeleting"
      :error="deleteError"
      @close="closeDeleteModal"
      @confirm="deleteItem"
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
  font-family: "Roboto", "Inter", system-ui, -apple-system, sans-serif;
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
}
</style>
