<script setup lang="ts">
import {ref, computed, onMounted, onBeforeUnmount} from "vue";
import {onBeforeRouteLeave, useRouter} from "vue-router";

const router = useRouter();
import MainLayout from "../layouts/MainLayout.vue";
import AppFooter from "../components/layout/AppFooter.vue";
import BaseModal from "../components/modals/BaseModal.vue";
import NotationMainPanelLayout from "../features/notations/layout/NotationMainPanelLayout.vue";
import NotationAppHeader from "../features/notations/layout/NotationAppHeader.vue";
import NotationComponentList from "../features/notations/layout/NotationComponentList.vue";
import NotationDiagram from "../features/notations/components/NotationDiagram.vue";
import NotationEntityModal from "../features/notations/components/NotationEntityModal.vue";
import CustomPropertiesPanel from "../features/notations/components/CustomPropertiesPanel.vue";
import NodeStylePanel from "../features/notations/components/NodeStylePanel.vue";
import {useNotationEditor} from "../features/notations/composables/useNotationEditor";
import {useNotationEntity, appendTagValue} from "../features/notations/composables/useNotationEntity";
import type {DiagramStyle} from "../features/notations/notationAttrs";
import {serializeEntityAttrs, serializeTypeAttrs} from "../features/notations/notationAttrs";

const {
  notation,
  state,
  isLoading,
  isSaving,
  saveError,
  saveSuccess,
  saveProgress,
  hasUnsavedChanges,
  loadNotation,
  saveChanges
} = useNotationEditor();

const {
  selectedEntity,
  showComponentModal,
  componentName,
  componentTags,
  componentVersion,
  componentTypeSelection,
  componentNewTypeName,
  componentFormError,
  componentTagSuggestions,
  showRelationModal,
  relationName,
  relationTags,
  relationVersion,
  relationTypeSelection,
  relationNewTypeName,
  relationFormError,
  relationTagSuggestions,
  selectedItem,
  openComponentModal,
  closeComponentModal,
  addComponent,
  openRelationModal,
  closeRelationModal,
  addRelation,
  selectComponent,
  selectRelation,
  markComponentDirty,
  markRelationDirty,
  removeComponent,
  removeRelation
} = useNotationEntity(state);

const NEW_TYPE_VALUE = "__new__";

const diagramRef = ref<InstanceType<typeof NotationDiagram> | null>(null);

const selectedEntityId = computed(() => selectedEntity.value?.id ?? null);

// Compute the diagram element ID for the selected entity (for the style panel)
// Components use node ID, relations use edge ID
const selectedDiagramElementId = computed(() => {
  const entity = selectedEntity.value;
  if (!entity) return null;
  if (entity.kind === "relation") {
    return `relation-edge-${entity.id}`;
  }
  return `component-${entity.id}`;
});

const interactionManager = computed(() => diagramRef.value?.interactionManagerRef ?? null);
const diagramRenderer = computed(() => diagramRef.value?.rendererRef ?? null);

// Toggle states
const gridVisible = ref(true);
const miniMapVisible = ref(true);
const snapEnabled = ref(false);

// JSON attrs dialog
const showAttrsJson = ref(false);
const attrsJsonContent = ref("");

const openAttrsJson = () => {
  const entity = selectedEntity.value;
  if (!entity) {
    // Show full state summary
    const data = {
      nodeTypes: state.value.nodeTypes.map(t => ({
        id: t.id, name: t.name,
        attrs: JSON.parse(serializeTypeAttrs(t.parsedAttrs))
      })),
      linkTypes: state.value.linkTypes.map(t => ({
        id: t.id, name: t.name,
        attrs: JSON.parse(serializeTypeAttrs(t.parsedAttrs))
      })),
      components: state.value.components.filter(c => !c._isDeleted).map(c => ({
        id: c.id, name: c.name,
        attrs: JSON.parse(serializeEntityAttrs(c.parsedAttrs))
      })),
      relations: state.value.relations.filter(r => !r._isDeleted).map(r => ({
        id: r.id, name: r.name,
        attrs: JSON.parse(serializeEntityAttrs(r.parsedAttrs))
      }))
    };
    attrsJsonContent.value = JSON.stringify(data, null, 2);
  } else if (entity.kind === "component") {
    const item = state.value.components.find(c => c.id === entity.id);
    if (item) {
      attrsJsonContent.value = serializeEntityAttrs(item.parsedAttrs);
      // Pretty print
      attrsJsonContent.value = JSON.stringify(JSON.parse(attrsJsonContent.value), null, 2);
    }
  } else {
    const item = state.value.relations.find(r => r.id === entity.id);
    if (item) {
      attrsJsonContent.value = serializeEntityAttrs(item.parsedAttrs);
      attrsJsonContent.value = JSON.stringify(JSON.parse(attrsJsonContent.value), null, 2);
    }
  }
  showAttrsJson.value = true;
};

const copyAttrsJson = () => {
  navigator.clipboard.writeText(attrsJsonContent.value);
};

const handleStyleChange = (style: DiagramStyle) => {
  const entity = selectedEntity.value;
  if (!entity) return;

  if (entity.kind === "component") {
    const item = state.value.components.find(c => c.id === entity.id);
    if (item) {
      item.parsedAttrs.diagramStyle = style;
      markComponentDirty(entity.id);
    }
  } else {
    const item = state.value.relations.find(r => r.id === entity.id);
    if (item) {
      item.parsedAttrs.diagramStyle = style;
      markRelationDirty(entity.id);
    }
  }
};

const handleItemChanged = (id: string) => {
  if (selectedEntity.value?.kind === "component") {
    markComponentDirty(id);
  } else if (selectedEntity.value?.kind === "relation") {
    markRelationDirty(id);
  }
};

const handleSelect = (kind: "component" | "relation", id: string) => {
  if (kind === "component") {
    selectComponent(id);
  } else {
    selectRelation(id);
  }
};

const handleDiagramSelect = (id: string, kind: "component" | "relation") => {
  handleSelect(kind, id);
};

// Remove item confirmation
const showRemoveDialog = ref(false);
const pendingRemove = ref<{ kind: "component" | "relation"; id: string; name: string } | null>(null);

const handleRemoveItem = (kind: "component" | "relation", id: string) => {
  const item = kind === "component"
    ? state.value.components.find(c => c.id === id)
    : state.value.relations.find(r => r.id === id);
  pendingRemove.value = { kind, id, name: item?.name || "" };
  showRemoveDialog.value = true;
};

const confirmRemove = () => {
  if (pendingRemove.value) {
    const { kind, id } = pendingRemove.value;
    if (kind === "component") {
      removeComponent(id);
    } else {
      removeRelation(id);
    }
  }
  showRemoveDialog.value = false;
  pendingRemove.value = null;
};

const cancelRemove = () => {
  showRemoveDialog.value = false;
  pendingRemove.value = null;
};

// Toolbar actions
const handleToolbarAction = async (event: string) => {
  const im = interactionManager.value;
  const renderer = diagramRenderer.value;

  switch (event) {
    case "save":
      await saveChanges(false);
      break;
    case "undo":
      im?.history.undo();
      break;
    case "redo":
      im?.history.redo();
      break;
    case "zoom-in":
      if (renderer) {
        const center = {x: renderer.width / 2, y: renderer.height / 2};
        im?.navigation.setZoom(renderer.zoom * 1.2, center);
      }
      break;
    case "zoom-out":
      if (renderer) {
        const center = {x: renderer.width / 2, y: renderer.height / 2};
        im?.navigation.setZoom(renderer.zoom / 1.2, center);
      }
      break;
    case "fit-screen":
      diagramRef.value?.fitToView();
      break;
    case "zoom-selection":
      im?.zoomToSelection();
      break;
    case "reset-view":
      diagramRef.value?.resetView();
      break;
    case "toggle-grid": {
      gridVisible.value = !gridVisible.value;
      const overlay = diagramRef.value?.gridOverlayRef;
      overlay?.setEnabled(gridVisible.value);
      renderer?.markDirty();
      break;
    }
    case "toggle-minimap": {
      miniMapVisible.value = !miniMapVisible.value;
      const overlay = diagramRef.value?.miniMapRef;
      overlay?.setEnabled(miniMapVisible.value);
      renderer?.markDirty();
      break;
    }
    case "toggle-snap": {
      snapEnabled.value = !snapEnabled.value;
      im?.drag.setSnapToGrid(snapEnabled.value);
      break;
    }
    case "show-attrs-json":
      openAttrsJson();
      break;
  }
};

// Unsaved changes confirmation dialog
const showLeaveDialog = ref(false);
const allowLeave = ref(false);
let pendingRoute: ReturnType<typeof Object> | null = null;

const confirmLeave = () => {
  showLeaveDialog.value = false;
  allowLeave.value = true;
  if (pendingRoute) {
    router.push(pendingRoute as any);
    pendingRoute = null;
  }
};

const cancelLeave = () => {
  showLeaveDialog.value = false;
  pendingRoute = null;
};

// Guard Vue Router navigation
onBeforeRouteLeave((to) => {
  if (allowLeave.value) {
    allowLeave.value = false;
    return true;
  }
  if (hasUnsavedChanges.value) {
    showLeaveDialog.value = true;
    pendingRoute = to;
    return false;
  }
  return true;
});

// Guard browser close / refresh
const onBeforeUnload = (e: BeforeUnloadEvent) => {
  if (hasUnsavedChanges.value) {
    e.preventDefault();
  }
};

onMounted(() => {
  loadNotation();
  window.addEventListener("beforeunload", onBeforeUnload);
});

onBeforeUnmount(() => {
  window.removeEventListener("beforeunload", onBeforeUnload);
});
</script>

<template>
  <MainLayout>
    <template #header>
      <NotationAppHeader
        :has-unsaved-changes="hasUnsavedChanges"
        :grid-visible="gridVisible"
        :mini-map-visible="miniMapVisible"
        :snap-enabled="snapEnabled"
        @action="handleToolbarAction"
      />
    </template>
    <template #default>
      <NotationMainPanelLayout>
        <template #left>
          <NotationComponentList
            v-if="!isLoading"
            :state="state"
            :notation="notation"
            :selected-id="selectedEntityId"
            @select="handleSelect"
            @create-component="openComponentModal"
            @create-relation="openRelationModal"
            @remove-item="handleRemoveItem"
          />
        </template>
        <template #default>
          <NotationDiagram
            ref="diagramRef"
            v-if="!isLoading"
            :state="state"
            :selected-id="selectedEntityId"
            @select="handleDiagramSelect"
          />
        </template>
        <template #bottom>
          <CustomPropertiesPanel
            :selected-item="selectedItem"
            :on-item-changed="handleItemChanged"
          />
        </template>
        <template #right>
          <NodeStylePanel
            :selected-element-id="selectedDiagramElementId"
            :interaction-manager="interactionManager"
            :renderer="diagramRenderer"
            @style-change="handleStyleChange"
          />
        </template>
      </NotationMainPanelLayout>
    </template>
    <template #footer>
      <AppFooter/>
    </template>
  </MainLayout>

  <!-- Save status toast -->
  <Teleport to="body">
    <Transition name="toast">
      <div v-if="isSaving" class="save-toast save-toast--progress">
        <span class="material-symbols-outlined save-toast__icon spin">sync</span>
        <span>{{ saveProgress || 'Сохранение...' }}</span>
      </div>
      <div v-else-if="saveSuccess" class="save-toast save-toast--success">
        <span class="material-symbols-outlined save-toast__icon">check_circle</span>
        <span>Сохранено</span>
      </div>
      <div v-else-if="saveError" class="save-toast save-toast--error">
        <span class="material-symbols-outlined save-toast__icon">error</span>
        <span>{{ saveError }}</span>
      </div>
    </Transition>
  </Teleport>

  <!-- Unsaved changes confirmation -->
  <BaseModal
    v-if="showLeaveDialog"
    title="Несохранённые изменения"
    max-width="400px"
    @close="cancelLeave"
  >
    <p class="leave-dialog__text">
      У вас есть несохранённые изменения. Если вы покинете страницу, они будут потеряны.
    </p>
    <template #footer>
      <button type="button" class="btn btn--secondary" @click="cancelLeave">
        Остаться
      </button>
      <button type="button" class="btn btn--danger" @click="confirmLeave">
        Покинуть
      </button>
    </template>
  </BaseModal>

  <!-- Remove item confirmation -->
  <BaseModal
    v-if="showRemoveDialog"
    title="Удаление элемента"
    max-width="400px"
    @close="cancelRemove"
  >
    <p class="leave-dialog__text">
      Удалить {{ pendingRemove?.kind === 'component' ? 'компонент' : 'отношение' }}
      <b>{{ pendingRemove?.name || 'Без имени' }}</b>?
      Изменения применятся после сохранения нотации.
    </p>
    <template #footer>
      <button type="button" class="btn btn--secondary" @click="cancelRemove">
        Отмена
      </button>
      <button type="button" class="btn btn--danger" @click="confirmRemove">
        Удалить
      </button>
    </template>
  </BaseModal>

  <!-- JSON attrs viewer -->
  <BaseModal
    v-if="showAttrsJson"
    title="JSON attrs"
    max-width="600px"
    @close="showAttrsJson = false"
  >
    <pre class="json-viewer">{{ attrsJsonContent }}</pre>
    <template #footer>
      <button
        type="button"
        class="btn btn--secondary"
        @click="copyAttrsJson"
      >
        Копировать
      </button>
      <button type="button" class="btn btn--secondary" @click="showAttrsJson = false">
        Закрыть
      </button>
    </template>
  </BaseModal>

  <NotationEntityModal
    v-if="showComponentModal"
    v-model:name="componentName"
    v-model:version="componentVersion"
    v-model:tags="componentTags"
    v-model:type-selection="componentTypeSelection"
    v-model:new-type-name="componentNewTypeName"
    title="Новый компонент"
    form-id="component-form"
    name-label="Название компонента"
    name-placeholder="Component name"
    version-label="Версия"
    version-placeholder="1.0.0"
    tags-label="Теги"
    tags-placeholder="tag1, tag2"
    type-label="Тип узла"
    :type-options="state.nodeTypes"
    :new-type-value="NEW_TYPE_VALUE"
    new-type-label="Новый тип узла"
    new-type-placeholder="Название типа"
    :suggestions="componentTagSuggestions"
    :error="componentFormError"
    @close="closeComponentModal"
    @submit="addComponent"
    @select-tag="componentTags = appendTagValue(componentTags, $event)"
  />

  <NotationEntityModal
    v-if="showRelationModal"
    v-model:name="relationName"
    v-model:version="relationVersion"
    v-model:tags="relationTags"
    v-model:type-selection="relationTypeSelection"
    v-model:new-type-name="relationNewTypeName"
    title="Новое отношение"
    form-id="relation-form"
    name-label="Название отношения"
    name-placeholder="Relation name"
    version-label="Версия"
    version-placeholder="1.0.0"
    tags-label="Теги"
    tags-placeholder="tag1, tag2"
    type-label="Тип связи"
    :type-options="state.linkTypes"
    :new-type-value="NEW_TYPE_VALUE"
    new-type-label="Новый тип связи"
    new-type-placeholder="Название типа"
    :suggestions="relationTagSuggestions"
    :error="relationFormError"
    @close="closeRelationModal"
    @submit="addRelation"
    @select-tag="relationTags = appendTagValue(relationTags, $event)"
  />
</template>

<style scoped>
.save-toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: var(--radius-sm);
  font-size: 14px;
  font-weight: 500;
  z-index: 2000;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  pointer-events: none;
}

.save-toast--progress {
  background: var(--surface);
  color: var(--text-muted);
  border: 1px solid var(--border);
}

.save-toast--success {
  background: var(--accent-soft);
  color: var(--accent);
  border: 1px solid rgba(43, 184, 150, 0.2);
}

.save-toast--error {
  background: var(--danger-soft);
  color: var(--danger);
  border: 1px solid rgba(220, 53, 69, 0.15);
}

.save-toast__icon {
  font-size: 20px;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(8px);
}

.leave-dialog__text {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-muted);
}

.btn {
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 500;
  font-family: inherit;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease;
  letter-spacing: 0.01em;
}

.btn--secondary {
  color: var(--text-muted);
  background: transparent;
  border: 1px solid var(--border);
}

.btn--secondary:hover {
  background: var(--surface-strong);
  color: var(--base-text);
}

.btn--danger {
  color: #fff;
  background: var(--danger);
  border: none;
}

.btn--danger:hover {
  background: #c82333;
}

.json-viewer {
  margin: 0;
  padding: 12px;
  background: var(--surface-muted);
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 12px;
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  line-height: 1.5;
  color: var(--base-text);
  overflow: auto;
  max-height: 400px;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
