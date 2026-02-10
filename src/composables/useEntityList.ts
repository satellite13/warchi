import { computed, onMounted, ref, watch, type Ref, type ComputedRef } from "vue";
import { apiGet, apiPost, apiDelete } from "./useApi";
import { compareVersions, isValidVersion, bumpMinor } from "../utils/version";
import type {
  VersionedEntity,
  EntityGroup,
  UserInfo,
  PaginatedResponse
} from "../types/entities";

export interface EntityListConfig {
  endpoint: string;
  entityName: string;
  entityNamePlural: string;
  conflictMessage: string;
  notFoundMessage: string;
  /** Сообщение при 404 при создании (например, «Владелец не найден» по контракту API) */
  createNotFoundMessage?: string;
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
  isCreating: Ref<boolean>;
  createError: Ref<string | null>;

  showDeleteModal: Ref<boolean>;
  itemToDelete: Ref<T | null>;
  isDeleting: Ref<boolean>;
  deleteError: Ref<string | null>;

  loadItems: () => Promise<void>;
  createItem: (ownerId: string, ownerEmail?: string) => Promise<T | null>;
  deleteItem: () => Promise<boolean>;
  openCreateModal: () => void;
  closeCreateModal: () => void;
  openDeleteModal: (item: T) => void;
  closeDeleteModal: () => void;
  getSelectedItem: (group: EntityGroup<T>) => T | null;
  handleVersionChange: (groupName: string, version: string) => void;
  validateCreate: () => string | null;
}

export function useEntityList<T extends VersionedEntity>(
  config: EntityListConfig
): EntityListReturn<T> {
  const items = ref<T[]>([]) as Ref<T[]>;
  const ownerEmails = ref<Map<string, string>>(new Map());
  const isLoading = ref(true);
  const errorMessage = ref<string | null>(null);
  const searchQuery = ref("");
  const selectedVersionByName = ref<Record<string, string>>({});

  const showCreateModal = ref(false);
  const newItemName = ref("");
  const newItemVersion = ref("1.0.0");
  const isCreating = ref(false);
  const createError = ref<string | null>(null);

  const showDeleteModal = ref(false);
  const itemToDelete = ref<T | null>(null) as Ref<T | null>;
  const isDeleting = ref(false);
  const deleteError = ref<string | null>(null);

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

  const loadOwnerEmails = async (ownerIds: string[]) => {
    const uniqueIds = [...new Set(ownerIds)];
    const emailMap = new Map<string, string>();

    await Promise.all(
      uniqueIds.map(async (id) => {
        const result = await apiGet<UserInfo>(`/users/${id}`);
        if (result.success) {
          emailMap.set(id, result.data.email);
        }
      })
    );

    ownerEmails.value = emailMap;
  };

  const loadItems = async () => {
    isLoading.value = true;
    errorMessage.value = null;

    try {
      const result = await apiGet<PaginatedResponse<T>>(
        `/${config.endpoint}?page=0&size=50`
      );

      if (!result.success) {
        throw new Error(result.error.message);
      }

      items.value = Array.isArray(result.data.content) ? result.data.content : [];

      const ownerIds = items.value.map((item) => item.ownerId);
      await loadOwnerEmails(ownerIds);
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
    const maxExisting = sameNameGroup?.versions[0]?.version;
    if (maxExisting && compareVersions(version, maxExisting) < 0) {
      return `Версия не может быть меньше максимальной существующей (${maxExisting}) для данного имени`;
    }
    return null;
  };

  const createItem = async (
    ownerId: string,
    ownerEmail?: string
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
      const result = await apiPost<T>(`/${config.endpoint}`, {
        name: newItemName.value.trim(),
        version: newItemVersion.value.trim(),
        ownerId
      });

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

      if (created?.ownerId && ownerEmail) {
        ownerEmails.value = new Map(ownerEmails.value);
        ownerEmails.value.set(created.ownerId, ownerEmail);
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
    isCreating,
    createError,

    showDeleteModal,
    itemToDelete,
    isDeleting,
    deleteError,

    loadItems,
    createItem,
    deleteItem,
    openCreateModal,
    closeCreateModal,
    openDeleteModal,
    closeDeleteModal,
    getSelectedItem,
    handleVersionChange,
    validateCreate
  };
}
