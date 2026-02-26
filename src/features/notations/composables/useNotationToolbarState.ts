import {ref, watch, type Ref} from "vue";

export type ToolbarState = {
  gridVisible: boolean;
  miniMapVisible: boolean;
  snapEnabled: boolean;
  alignEnabled: boolean;
  rulersEnabled: boolean;
};

const TOOLBAR_STATE_STORAGE_PREFIX = "warchi:notation-editor:toolbar-state";

const getToolbarStateStorageKey = (userId: string | null): string =>
  userId ? `${TOOLBAR_STATE_STORAGE_PREFIX}:${userId}` : `${TOOLBAR_STATE_STORAGE_PREFIX}:anonymous`;

const readToolbarState = (userId: string | null): Partial<ToolbarState> | null => {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(getToolbarStateStorageKey(userId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ToolbarState>;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};

export function useNotationToolbarState(userId: Ref<string | null>) {
  const gridVisible = ref(true);
  const miniMapVisible = ref(true);
  const snapEnabled = ref(false);
  const alignEnabled = ref(true);
  const rulersEnabled = ref(true);

  const applyToolbarState = (stateValue: Partial<ToolbarState> | null) => {
    if (!stateValue) return;
    if (typeof stateValue.gridVisible === "boolean") gridVisible.value = stateValue.gridVisible;
    if (typeof stateValue.miniMapVisible === "boolean") miniMapVisible.value = stateValue.miniMapVisible;
    if (typeof stateValue.snapEnabled === "boolean") snapEnabled.value = stateValue.snapEnabled;
    if (typeof stateValue.alignEnabled === "boolean") alignEnabled.value = stateValue.alignEnabled;
    if (typeof stateValue.rulersEnabled === "boolean") rulersEnabled.value = stateValue.rulersEnabled;
  };

  const persistToolbarState = (userIdValue: string | null) => {
    if (typeof window === "undefined") return;
    const nextState: ToolbarState = {
      gridVisible: gridVisible.value,
      miniMapVisible: miniMapVisible.value,
      snapEnabled: snapEnabled.value,
      alignEnabled: alignEnabled.value,
      rulersEnabled: rulersEnabled.value
    };
    window.localStorage.setItem(getToolbarStateStorageKey(userIdValue), JSON.stringify(nextState));
  };

  watch(
    userId,
    (id) => {
      applyToolbarState(readToolbarState(id));
    },
    {immediate: true}
  );

  watch(
    [gridVisible, miniMapVisible, snapEnabled, alignEnabled, rulersEnabled, userId],
    ([, , , , , id]) => {
      persistToolbarState(id as string | null);
    }
  );

  return {
    gridVisible,
    miniMapVisible,
    snapEnabled,
    alignEnabled,
    rulersEnabled
  };
}
