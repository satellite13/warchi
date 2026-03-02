import { computed, onMounted, ref, watch, type Ref, type ComputedRef } from "vue";
import { useI18n } from "vue-i18n";
import { apiGet, apiPost, apiPut, apiDelete } from "./useApi";
import { useAuth } from "./useAuth";
import { resolveOwnerDisplayNames } from "../utils/resolveOwnerNames";
import { compareVersions, isValidVersion, bumpMinor } from "../utils/version";
import type {
  VersionedEntity,
  EntityGroup,
  PaginatedResponse
} from "../types/entities";

export interface EntityListConfig<T extends VersionedEntity = VersionedEntity> {
  endpoint: string;
  entityName: string;
  entityNamePlural: string;
  conflictMessage: string;
  notFoundMessage: string;
  /** Сообщение при 404 при создании (например, «Владелец не найден» по контракту API) */
  createNotFoundMessage?: string;
  /** Сообщение «Введите название» для rename-модалки */
  enterNameMessage?: string;
  /** Сообщение при ошибке переименования */
  renameFailedMessage?: string;
  /** Построить тело PUT-запроса для переименования */
  buildRenameRequest?: (item: T, newName: string) => unknown;
  /** Построить тело PUT-запроса для обновления attrs (например, иконка карточки) */
  buildUpdateAttrsRequest?: (item: T, nextAttrs: string | null) => unknown;
}

export interface SourceVersion {
  id: string;
  version: string;
}

export interface EntityListReturn<T extends VersionedEntity> {
  items: Ref<T[]>;
  ownerEmails: Ref<Map<string, string>>;
  isLoading: Ref<boolean>;
  errorMessage: Ref<string | null>;
  searchQuery: Ref<string>;
  selectedVersionByName: Ref<Record<string, string>>;
  filteredItems: ComputedRef<EntityGroup<T>[]>;
  itemCount: ComputedRef<number>;

  showCreateModal: Ref<boolean>;
  newItemName: Ref<string>;
  newItemVersion: Ref<string>;
  sourceVersionId: Ref<string | null>;
  sourceVersions: ComputedRef<SourceVersion[]>;
  isCreating: Ref<boolean>;
  createError: Ref<string | null>;

  showDeleteModal: Ref<boolean>;
  itemToDelete: Ref<T | null>;
  isDeleting: Ref<boolean>;
  deleteError: Ref<string | null>;

  showRenameModal: Ref<boolean>;
  itemToRename: Ref<T | null>;
  renameName: Ref<string>;
  renameError: Ref<string | null>;
  isRenaming: Ref<boolean>;

  loadItems: () => Promise<void>;
  createItem: (ownerId: string, ownerDisplayName?: string) => Promise<T | null>;
  deleteItem: () => Promise<boolean>;
  openCreateModal: () => void;
  closeCreateModal: () => void;
  openDeleteModal: (item: T) => void;
  closeDeleteModal: () => void;
  openRenameModal: (item: T) => void;
  closeRenameModal: () => void;
  renameItem: () => Promise<void>;
  getSelectedItem: (group: EntityGroup<T>) => T | null;
  handleVersionChange: (groupName: string, version: string) => void;
  validateCreate: () => string | null;

  showIconModal: Ref<boolean>;
  itemToUpdateIcon: Ref<T | null>;
  iconPickerValue: Ref<string>;
  isUpdatingIcon: Ref<boolean>;
  iconUpdateError: Ref<string | null>;
  openIconModal: (item: T) => void;
  closeIconModal: () => void;
  submitIconChange: () => Promise<void>;
}

export function useEntityList<T extends VersionedEntity>(
  config: EntityListConfig<T>
): EntityListReturn<T> {
  const { t } = useI18n();
  const { currentUser } = useAuth();
  const items = ref<T[]>([]) as Ref<T[]>;
  const ownerEmails = ref<Map<string, string>>(new Map());
  const isLoading = ref(true);
  const errorMessage = ref<string | null>(null);
  const searchQuery = ref("");
  const selectedVersionByName = ref<Record<string, string>>({});

  const showCreateModal = ref(false);
  const newItemName = ref("");
  const newItemVersion = ref("1.0.0");
  const sourceVersionId = ref<string | null>(null);
  const isCreating = ref(false);
  const createError = ref<string | null>(null);

  const showDeleteModal = ref(false);
  const itemToDelete = ref<T | null>(null) as Ref<T | null>;
  const isDeleting = ref(false);
  const deleteError = ref<string | null>(null);

  const showRenameModal = ref(false);
  const itemToRename = ref<T | null>(null) as Ref<T | null>;
  const renameName = ref("");
  const renameError = ref<string | null>(null);
  const isRenaming = ref(false);

  const showIconModal = ref(false);
  const itemToUpdateIcon = ref<T | null>(null) as Ref<T | null>;
  const iconPickerValue = ref("");
  const isUpdatingIcon = ref(false);
  const iconUpdateError = ref<string | null>(null);

  const groupedItems = computed(() => {
    const groups = new Map<string, T[]>();
    items.value.forEach((item) => {
      if (!groups.has(item.name)) {
        groups.set(item.name, []);
      }
      groups.get(item.name)?.push(item);
    });

    return Array.from(groups.entries()).map(([name, versions]) => {
      const sorted = [...versions].sort((a, b) =>
        compareVersions(b.version, a.version)
      );
      return { name, versions: sorted } satisfies EntityGroup<T>;
    });
  });

  watch(groupedItems, (groups) => {
    const updates: Record<string, string> = {};
    let hasUpdates = false;
    for (const group of groups) {
      const currentSelection = selectedVersionByName.value[group.name];
      const latest = group.versions[0]?.version || "";
      const exists = group.versions.some((item) => item.version === currentSelection);
      if (!currentSelection || !exists) {
        updates[group.name] = latest;
        hasUpdates = true;
      }
    }
    if (hasUpdates) {
      selectedVersionByName.value = {
        ...selectedVersionByName.value,
        ...updates
      };
    }
  }, { immediate: true });

  const filteredItems = computed(() => {
    const query = searchQuery.value.toLowerCase().trim();
    if (!query) {
      return groupedItems.value;
    }
    return groupedItems.value.filter((group) =>
      group.name.toLowerCase().includes(query)
    );
  });

  const itemCount = computed(() => filteredItems.value.length);

  const sourceVersions = computed<SourceVersion[]>(() => {
    const name = newItemName.value.trim();
    if (!name) return [];
    const group = groupedItems.value.find(
      (g) => g.name.toLowerCase() === name.toLowerCase()
    );
    if (!group) return [];
    return group.versions.map((item) => ({ id: item.id, version: item.version }));
  });

  const loadOwnerEmails = async (ownerIds: string[], fallback: string) => {
    ownerEmails.value = await resolveOwnerDisplayNames(
      ownerIds,
      ownerEmails.value,
      currentUser.value,
      fallback
    );
  };

  const loadItems = async () => {
    isLoading.value = true;
    errorMessage.value = null;

    try {
      const query = new URLSearchParams({
        page: "0",
        size: "50"
      });
      const result = await apiGet<PaginatedResponse<T>>(
        `/${config.endpoint}?${query.toString()}`
      );

      if (!result.success) {
        throw new Error(result.error.message);
      }

      items.value = Array.isArray(result.data.content) ? result.data.content : [];

      const ownerIds = items.value.map((item) => item.ownerId);
      await loadOwnerEmails(ownerIds, t("common.unknownUser"));
    } catch (error) {
      errorMessage.value =
        error instanceof Error
          ? error.message
          : `Не удалось загрузить ${config.entityNamePlural}.`;
    } finally {
      isLoading.value = false;
    }
  };

  const validateCreate = (): string | null => {
    if (!newItemName.value.trim()) {
      return `Введите название ${config.entityName.toLowerCase()}`;
    }
    if (!newItemVersion.value.trim()) {
      return `Введите версию ${config.entityName.toLowerCase()}`;
    }
    if (!isValidVersion(newItemVersion.value.trim())) {
      return "Версия должна быть в формате X.Y.Z (например, 1.0.0)";
    }
    const name = newItemName.value.trim();
    const version = newItemVersion.value.trim();
    const sameNameGroup = groupedItems.value.find(
      (g) => g.name.toLowerCase() === name.toLowerCase()
    );
    const hasExactVersionConflict = sameNameGroup?.versions.some(
      (item) => item.version.trim() === version
    );
    if (hasExactVersionConflict) {
      return config.conflictMessage;
    }
    const maxExisting = sameNameGroup?.versions[0]?.version;
    if (maxExisting && compareVersions(version, maxExisting) < 0) {
      return `Версия не может быть меньше максимальной существующей (${maxExisting}) для данного имени`;
    }
    return null;
  };

  const createItem = async (
    ownerId: string,
    ownerDisplayName?: string
  ): Promise<T | null> => {
    const validationError = validateCreate();
    if (validationError) {
      createError.value = validationError;
      return null;
    }

    if (!ownerId) {
      createError.value = "Пользователь не авторизован";
      return null;
    }

    isCreating.value = true;
    createError.value = null;

    try {
      const body = {
        name: newItemName.value.trim(),
        version: newItemVersion.value.trim(),
        ownerId
      };
      const url = sourceVersionId.value
        ? `/${config.endpoint}/${sourceVersionId.value}/copy`
        : `/${config.endpoint}`;
      const result = await apiPost<T>(url, body);

      if (!result.success) {
        if (result.error.status === 409) {
          throw new Error(config.conflictMessage);
        }
        if (result.error.status === 404) {
          throw new Error(
            config.createNotFoundMessage ??
              `Эндпоинт не найден (404). Убедитесь, что бэкенд поддерживает POST /api/.../${config.endpoint} и запущен.`
          );
        }
        throw new Error(result.error.message);
      }

      const created = result.data;
      showCreateModal.value = false;

      if (created?.id) {
        const exists = items.value.some((item) => item.id === created.id);
        items.value = exists
          ? items.value.map((item) => (item.id === created.id ? created : item))
          : [created, ...items.value];
      }

      if (created?.ownerId && ownerDisplayName) {
        ownerEmails.value = new Map(ownerEmails.value);
        ownerEmails.value.set(created.ownerId, ownerDisplayName);
      }

      if (created?.name && created?.version) {
        selectedVersionByName.value = {
          ...selectedVersionByName.value,
          [created.name]: created.version
        };
      }

      return created;
    } catch (error) {
      createError.value = error instanceof Error ? error.message : `Не удалось создать ${config.entityName.toLowerCase()}`;
      return null;
    } finally {
      isCreating.value = false;
    }
  };

  const deleteItem = async (): Promise<boolean> => {
    if (!itemToDelete.value) {
      return false;
    }

    isDeleting.value = true;
    deleteError.value = null;

    try {
      const result = await apiDelete<void>(
        `/${config.endpoint}/${itemToDelete.value.id}`
      );

      if (!result.success) {
        if (result.error.status === 404) {
          throw new Error(config.notFoundMessage);
        }
        throw new Error(result.error.message);
      }

      items.value = items.value.filter(
        (item) => item.id !== itemToDelete.value?.id
      );
      closeDeleteModal();
      return true;
    } catch (error) {
      deleteError.value = error instanceof Error ? error.message : `Не удалось удалить ${config.entityName.toLowerCase()}`;
      return false;
    } finally {
      isDeleting.value = false;
    }
  };

  const openCreateModal = () => {
    newItemName.value = "";
    newItemVersion.value = "1.0.0";
    sourceVersionId.value = null;
    createError.value = null;
    showCreateModal.value = true;
  };

  watch(
    () => [newItemName.value.trim(), groupedItems.value, showCreateModal.value] as const,
    ([name, groups]) => {
      if (!showCreateModal.value || !name) return;
      const sameNameGroup = groups.find(
        (g) => g.name.toLowerCase() === name.toLowerCase()
      );
      const maxVersion = sameNameGroup?.versions[0]?.version;
      const suggested = maxVersion ? bumpMinor(maxVersion) : null;
      if (suggested) {
        newItemVersion.value = suggested;
      }
    }
  );

  const closeCreateModal = () => {
    showCreateModal.value = false;
    sourceVersionId.value = null;
  };

  const openDeleteModal = (item: T) => {
    itemToDelete.value = item;
    deleteError.value = null;
    showDeleteModal.value = true;
  };

  const closeDeleteModal = () => {
    showDeleteModal.value = false;
    itemToDelete.value = null;
    deleteError.value = null;
  };

  const openRenameModal = (item: T) => {
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
    if (!itemToRename.value || !config.buildRenameRequest) return;
    const trimmedName = renameName.value.trim();
    if (!trimmedName) {
      renameError.value = config.enterNameMessage ?? `Введите название`;
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
      renameError.value = config.conflictMessage;
      return;
    }

    isRenaming.value = true;
    renameError.value = null;
    try {
      const body = config.buildRenameRequest(current, trimmedName);
      const result = await apiPut<T>(`/${config.endpoint}/${current.id}`, body);
      if (!result.success) {
        if (result.error.status === 409) {
          throw new Error(config.conflictMessage);
        }
        throw new Error(result.error.message);
      }

      const previousName = current.name;
      items.value = items.value.map((item) =>
        item.id === current.id ? result.data : item
      );
      if (selectedVersionByName.value[previousName] === current.version) {
        const nextSelection = { ...selectedVersionByName.value };
        delete nextSelection[previousName];
        nextSelection[result.data.name] = result.data.version;
        selectedVersionByName.value = nextSelection;
      }
      closeRenameModal();
    } catch (error) {
      renameError.value =
        error instanceof Error
          ? error.message
          : (config.renameFailedMessage ?? `Не удалось переименовать`);
    } finally {
      isRenaming.value = false;
    }
  };

  const getSelectedItem = (group: EntityGroup<T>): T | null => {
    const selectedVersion = selectedVersionByName.value[group.name];
    const selected =
      group.versions.find((item) => item.version === selectedVersion) ||
      group.versions[0] ||
      null;
    if (selected && selectedVersion !== selected.version) {
      selectedVersionByName.value = {
        ...selectedVersionByName.value,
        [group.name]: selected.version
      };
    }
    return selected;
  };

  const handleVersionChange = (groupName: string, version: string) => {
    selectedVersionByName.value = {
      ...selectedVersionByName.value,
      [groupName]: version
    };
  };

  const openIconModal = (item: T) => {
    const withAttrs = item as T & { attrs?: string | null };
    let currentIcon = "";
    try {
      const parsed = withAttrs.attrs ? JSON.parse(withAttrs.attrs) : {};
      if (typeof parsed?.icon === "string") currentIcon = parsed.icon;
    } catch {
      // ignore
    }
    itemToUpdateIcon.value = item;
    iconPickerValue.value = currentIcon;
    iconUpdateError.value = null;
    showIconModal.value = true;
  };

  const closeIconModal = () => {
    showIconModal.value = false;
    itemToUpdateIcon.value = null;
    iconPickerValue.value = "";
    iconUpdateError.value = null;
    isUpdatingIcon.value = false;
  };

  const submitIconChange = async () => {
    const item = itemToUpdateIcon.value;
    if (!item || !config.buildUpdateAttrsRequest) return;
    const withAttrs = item as T & { attrs?: string | null };
    let nextAttrsObj: Record<string, unknown> = {};
    try {
      if (withAttrs.attrs) nextAttrsObj = JSON.parse(withAttrs.attrs) as Record<string, unknown>;
    } catch {
      // ignore
    }
    nextAttrsObj.icon = iconPickerValue.value || undefined;
    if (nextAttrsObj.icon === undefined) delete nextAttrsObj.icon;
    const nextAttrsStr = Object.keys(nextAttrsObj).length > 0 ? JSON.stringify(nextAttrsObj) : null;

    isUpdatingIcon.value = true;
    iconUpdateError.value = null;
    try {
      const body = config.buildUpdateAttrsRequest(item, nextAttrsStr);
      const result = await apiPut<T>(`/${config.endpoint}/${item.id}`, body);
      if (!result.success) throw new Error(result.error.message);
      items.value = items.value.map((i) => (i.id === item.id ? result.data : i));
      closeIconModal();
    } catch (error) {
      iconUpdateError.value =
        error instanceof Error ? error.message : t("common.errorSave");
    } finally {
      isUpdatingIcon.value = false;
    }
  };

  onMounted(() => {
    loadItems();
  });

  return {
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

    showRenameModal,
    itemToRename,
    renameName,
    renameError,
    isRenaming,

    loadItems,
    createItem,
    deleteItem,
    openCreateModal,
    closeCreateModal,
    openDeleteModal,
    closeDeleteModal,
    openRenameModal,
    closeRenameModal,
    renameItem,
    getSelectedItem,
    handleVersionChange,
    validateCreate,

    showIconModal,
    itemToUpdateIcon,
    iconPickerValue,
    isUpdatingIcon,
    iconUpdateError,
    openIconModal,
    closeIconModal,
    submitIconChange
  };
}
