<script setup lang="ts">
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { useAuth } from "../../composables/useAuth";
import { useEntityList, type EntityListConfig } from "../../composables/useEntityList";
import { getUserDisplayName } from "../../utils/userDisplay";
import { resolveOwnerLabel } from "../../utils/resolveOwnerNames";
import { toAccessLabel } from "../../utils/accessPermission";
import type { VersionedEntity } from "../../types/entities";
import type { ShareResourceType } from "../../types/api";
import ListHeader from "../list/ListHeader.vue";
import EntityCard from "../cards/EntityCard.vue";
import CardSkeleton from "../cards/CardSkeleton.vue";
import EmptyState from "../list/EmptyState.vue";
import EntityCreateModal from "../modals/EntityCreateModal.vue";
import EntityDeleteModal from "../modals/EntityDeleteModal.vue";
import EntityRenameModal from "../modals/EntityRenameModal.vue";
import ShareAccessModal from "../modals/ShareAccessModal.vue";
import BaseModal from "../modals/BaseModal.vue";
import IconPicker from "../forms/IconPicker.vue";
import VersionTreeModal from "../modals/VersionTreeModal.vue";

const props = defineProps<{
  entityListConfig: EntityListConfig<VersionedEntity & { attrs?: string | null }>
  editorRouteName: string
  i18nPrefix: string
  icon: string
  resourceType: ShareResourceType
  /** Показывать кнопку «Дерево версий» на карточках (для моделей). */
  showVersionTree?: boolean
  /** Показывать кнопку создания версии на базе выбранной (для моделей). */
  showCreateFromVersionButton?: boolean
  /** Показывать кнопку экспорта на карточках. */
  canExport?: boolean
  /** Карточка импорта ZIP-пакета (создаёт новую модель). */
  canImportPackage?: boolean
  /** Ошибка последнего действия (например, экспорт). */
  actionErrorMessage?: string | null
  /** Статус импорта пакета (прогресс / успех). */
  actionStatusMessage?: string | null
  /** Долгая операция (импорт пакета) — блокирует каталог и скрывает empty state. */
  actionBusy?: boolean
}>();

const emit = defineEmits<{
  export: [item: VersionedEntity]
  importPackage: []
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
  openCreateModalFromVersion,
  closeCreateModal,
  openDeleteModal,
  closeDeleteModal,
  openRenameModal,
  closeRenameModal,
  renameItem,
  getSelectedItem,
  handleVersionChange,
  createItem,
  deleteItem,
  showIconModal,
  iconPickerValue,
  isUpdatingIcon,
  iconUpdateError,
  openIconModal,
  closeIconModal,
  submitIconChange
} = useEntityList(props.entityListConfig);

function parseIconFromAttrs(attrs: string | null | undefined): string | undefined {
  if (attrs == null) return undefined;
  try {
    const parsed = JSON.parse(attrs) as { icon?: string };
    const v = parsed?.icon;
    return typeof v === "string" && v.trim() ? v : undefined;
  } catch {
    return undefined;
  }
}

const canChangeIcon = !!props.entityListConfig.buildUpdateAttrsRequest;

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

const showVersionTreeModal = ref(false);
const versionTreeGroup = ref<{
  name: string
  versions: (VersionedEntity & { sourceId?: string | null })[]
} | null>(null);

function openVersionTreeModal(group: {
  name: string
  versions: (VersionedEntity & { attrs?: string | null; sourceId?: string | null })[]
}) {
  versionTreeGroup.value = { name: group.name, versions: group.versions };
  showVersionTreeModal.value = true;
}

function closeVersionTreeModal() {
  showVersionTreeModal.value = false;
  versionTreeGroup.value = null;
}

function openEntityFromVersionTree(id: string) {
  openEntity(id);
}

function handleCreateFromSelectedVersion(group: {
  name: string
  versions: (VersionedEntity & { attrs?: string | null; sourceId?: string | null })[]
}) {
  const selected = getSelectedItem(group);
  if (!selected) return;
  openCreateModalFromVersion(selected);
}

function canEditSelected(group: {
  name: string
  versions: (VersionedEntity & { attrs?: string | null; sourceId?: string | null })[]
}): boolean {
  const selected = getSelectedItem(group);
  if (!selected) return false;
  return selected.accessPermission === "OWNER" ||
    selected.accessPermission === "ADMIN" ||
    selected.accessPermission === "EDIT";
}

function canShareSelected(group: {
  name: string
  versions: (VersionedEntity & { attrs?: string | null; sourceId?: string | null })[]
}): boolean {
  const selected = getSelectedItem(group);
  if (!selected) return false;
  return selected.accessPermission === "OWNER" || selected.accessPermission === "ADMIN";
}

function handleDelete(group: {
  name: string
  versions: (VersionedEntity & { attrs?: string | null; sourceId?: string | null })[]
}) {
  const selected = getSelectedItem(group);
  if (!selected || !canEditSelected(group)) return;
  openDeleteModal(selected);
}

function handleRename(group: {
  name: string
  versions: (VersionedEntity & { attrs?: string | null; sourceId?: string | null })[]
}) {
  const selected = getSelectedItem(group);
  if (!selected || !canEditSelected(group)) return;
  openRenameModal(selected);
}

function ownerLabelFor(
  ownerId: string | null | undefined,
  ownerEmail?: string | null,
  ownerDisplayName?: string | null
): string {
  return resolveOwnerLabel(
    ownerEmails.value,
    ownerId,
    currentUser.value,
    t("common.unknownUser"),
    ownerEmail,
    ownerDisplayName
  );
}

function formatDeleteEntityName(item: VersionedEntity | null): string {
  if (!item) return "";
  return `${item.name} v${item.version} — ${ownerLabelFor(item.ownerId, item.ownerEmail, item.ownerDisplayName)}`;
}

const exportTitle = computed(() => {
  if (props.i18nPrefix === "models") return t("toolbar.exportModelPackage");
  if (props.i18nPrefix === "notations") return t("toolbar.exportNotation");
  return t("common.export");
});

function handleExport(group: {
  name: string
  versions: (VersionedEntity & { attrs?: string | null; sourceId?: string | null })[]
}) {
  const selected = getSelectedItem(group);
  if (!selected) return;
  emit("export", selected);
}
</script>

<template>
  <main class="home">
    <header class="home-header">
      <div class="catalog-toolbar">
        <div class="catalog-toolbar__actions">
          <button
            type="button"
            class="btn btn--secondary btn--xs catalog-toolbar__btn"
            :title="t(`${i18nPrefix}.createDescription`)"
            @click="openCreateModal"
          >
            <UiIcon name="add" />
            <span>{{ t(`${i18nPrefix}.createTitle`) }}</span>
          </button>
          <button
            v-if="canImportPackage"
            type="button"
            class="btn btn--secondary btn--xs catalog-toolbar__btn"
            :title="t(`${i18nPrefix}.packageImportDescription`)"
            :disabled="actionBusy"
            @click="emit('importPackage')"
          >
            <UiIcon name="upload" />
            <span>{{ t(`${i18nPrefix}.packageImportTitle`) }}</span>
          </button>
        </div>
        <ListHeader
          v-model="searchQuery"
          class="catalog-toolbar__search"
          :placeholder="t(`${i18nPrefix}.searchPlaceholder`)"
          :count="itemCount"
          :loading="isLoading || actionBusy"
        />
      </div>
    </header>

    <div v-if="actionErrorMessage" class="catalog-action-error">{{ actionErrorMessage }}</div>
    <div v-if="actionStatusMessage && !actionBusy" class="catalog-action-status">
      {{ actionStatusMessage }}
    </div>

    <section class="model-grid" :aria-busy="actionBusy || undefined">
      <div v-if="actionBusy" class="catalog-busy">
        <UiIcon name="sync" class="catalog-busy__icon spin" />
        <p class="catalog-busy__message">
          {{ actionStatusMessage || t(`${i18nPrefix}.packageImporting`) }}
        </p>
      </div>
      <CardSkeleton v-else-if="isLoading" :count="4" />
      <div v-else-if="errorMessage" class="error-state">{{ errorMessage }}</div>
      <EmptyState
        v-else-if="filteredItems.length === 0"
        :title="t(`${i18nPrefix}.notFoundTitle`)"
        :description="t(`${i18nPrefix}.notFoundDescription`)"
        :icon="searchQuery ? 'search' : icon"
      />

      <EntityCard
        v-for="group in actionBusy ? [] : filteredItems"
        :id="getSelectedItem(group)?.id || group.name"
        :key="group.name"
        :name="group.name"
        :version="getSelectedItem(group)?.version || ''"
        :versions="group.versions.map((item) => item.version)"
        :owner-email="ownerLabelFor(getSelectedItem(group)?.ownerId, getSelectedItem(group)?.ownerEmail, getSelectedItem(group)?.ownerDisplayName)"
        :access-label="toAccessLabel(getSelectedItem(group)?.accessPermission, locale)"
        :can-share="canShareSelected(group)"
        :can-export="canExport"
        :export-title="exportTitle"
        :can-delete="canEditSelected(group)"
        :can-rename="canEditSelected(group)"
        :updated-at="getSelectedItem(group)?.updatedAt"
        :icon="canChangeIcon ? (parseIconFromAttrs(getSelectedItem(group)?.attrs) ?? icon) : undefined"
        :can-change-icon="canChangeIcon && canEditSelected(group)"
        :show-version-tree-button="showVersionTree"
        :show-create-from-version-button="showCreateFromVersionButton"
        :version-tree-i18n-prefix="showVersionTree ? i18nPrefix : undefined"
        @click="getSelectedItem(group) && openEntity(getSelectedItem(group)!.id)"
        @delete="handleDelete(group)"
        @rename="handleRename(group)"
        @share="getSelectedItem(group) && openShareModal(getSelectedItem(group)!)"
        @export="handleExport(group)"
        @show-version-tree="openVersionTreeModal(group)"
        @create-from-version="handleCreateFromSelectedVersion(group)"
        @version-change="handleVersionChange(group.name, $event)"
        @change-icon="getSelectedItem(group) && openIconModal(getSelectedItem(group)!)"
      >
        <template v-if="!canChangeIcon" #icon>
          <UiIcon :name="icon" :alt="t(`${i18nPrefix}.entityName`)" />
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
      :source-empty-label="t(`${i18nPrefix}.emptySourceVersion`)"
      :is-submitting="isCreating"
      :error="createError"
      @close="closeCreateModal"
      @submit="handleCreate"
    />

    <EntityDeleteModal
      v-if="showDeleteModal"
      :title="t(`${i18nPrefix}.deleteTitle`)"
      :entity-label="t(`${i18nPrefix}.entityLabelAccusative`)"
      :entity-name="formatDeleteEntityName(itemToDelete)"
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

    <VersionTreeModal
      v-if="showVersionTreeModal && versionTreeGroup"
      :group-name="versionTreeGroup.name"
      :items="versionTreeGroup.versions"
      :i18n-prefix="i18nPrefix"
      @close="closeVersionTreeModal"
      @open="openEntityFromVersionTree"
    />

    <BaseModal
      v-if="showIconModal"
      :title="t('common.changeIcon')"
      max-width="420px"
      @close="closeIconModal"
    >
      <div class="icon-modal__body">
        <label class="icon-modal__label">{{ t("types.icon") }}</label>
        <IconPicker v-model="iconPickerValue" />
        <p v-if="iconUpdateError" class="icon-modal__error">{{ iconUpdateError }}</p>
      </div>
      <template #footer>
        <button type="button" class="btn btn--secondary" @click="closeIconModal">
          {{ t("common.cancel") }}
        </button>
        <button
          type="button"
          class="btn btn--primary"
          :disabled="isUpdatingIcon"
          @click="submitIconChange"
        >
          {{ isUpdatingIcon ? t("common.saving") : t("common.save") }}
        </button>
      </template>
    </BaseModal>
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

.catalog-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.catalog-toolbar__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.catalog-toolbar__btn {
  height: 34px;
  padding: 0 12px;
}

.catalog-toolbar__btn .ui-icon {
  width: 16px;
  height: 16px;
}

.catalog-toolbar__search {
  flex: 1;
  min-width: 220px;
  display: flex;
  justify-content: flex-end;
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

.catalog-action-error,
.error-state {
  width: 100%;
  padding: 16px;
  border-radius: var(--radius);
  background: var(--danger-soft);
  color: var(--danger);
  font-size: 14px;
  border: 1px solid rgba(239, 68, 68, 0.2);
}

.catalog-action-error,
.catalog-action-status {
  margin-bottom: 12px;
}

.catalog-action-status {
  width: 100%;
  padding: 16px;
  border-radius: var(--radius);
  background: var(--surface-muted);
  color: var(--base-text);
  font-size: 14px;
  border: 1px solid var(--border-strong);
}

.catalog-busy {
  width: 100%;
  min-height: 280px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 32px 16px;
  color: var(--text-muted);
  text-align: center;
}

.catalog-busy__icon {
  width: 28px;
  height: 28px;
}

.catalog-busy__icon.spin {
  animation: catalog-spin 1s linear infinite;
}

@keyframes catalog-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(-360deg);
  }
}

.catalog-busy__message {
  margin: 0;
  max-width: 420px;
  font-size: 15px;
  font-weight: 500;
  color: var(--base-text);
}

.icon-modal__body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.icon-modal__label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted);
}

.icon-modal__error {
  margin: 0;
  font-size: 13px;
  color: var(--danger);
}
</style>
