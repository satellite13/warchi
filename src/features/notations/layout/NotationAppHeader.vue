<script setup lang="ts">
import {computed} from "vue";
import {useRouter} from "vue-router";
import {useAuth} from "../../../composables/useAuth";
import AppLogo from "../../../components/layout/AppLogo.vue";
import UserAvatar from "../../../components/layout/UserAvatar.vue";
import IconToolbar, {type ToolbarButton} from "./IconToolbar.vue";

const props = withDefaults(defineProps<{
  hasUnsavedChanges?: boolean;
  gridVisible?: boolean;
  miniMapVisible?: boolean;
  snapEnabled?: boolean;
}>(), {
  hasUnsavedChanges: false,
  gridVisible: true,
  miniMapVisible: true,
  snapEnabled: false
});

const router = useRouter();
const {currentUser} = useAuth();

const toolbarButtons = computed<ToolbarButton[]>(() => [
  {icon: "undo", event: "undo", title: "Отменить"},
  {icon: "redo", event: "redo", title: "Повторить"},
  {icon: "separator", event: "sep1", separator: true},
  {icon: "zoom_in", event: "zoom-in", title: "Приблизить"},
  {icon: "zoom_out", event: "zoom-out", title: "Отдалить"},
  {icon: "fit_screen", event: "fit-screen", title: "Вписать в экран"},
  {icon: "center_focus_strong", event: "zoom-selection", title: "Масштабировать выделение"},
  {icon: "format_align_center", event: "auto-layout-components", title: "Авторазмещение компонентов"},
  {icon: "restart_alt", event: "reset-view", title: "Сбросить масштаб"},
  {icon: "separator", event: "sep2", separator: true},
  {icon: "grid_on", event: "toggle-grid", title: "Сетка", active: props.gridVisible},
  {icon: "map", event: "toggle-minimap", title: "Миникарта", active: props.miniMapVisible},
  {icon: "straighten", event: "toggle-snap", title: "Привязка к сетке", active: props.snapEnabled},
  {icon: "separator", event: "sep3", separator: true},
  {icon: "download", event: "export-notation", title: "Экспорт нотации"},
  {icon: "upload", event: "import-notation", title: "Импорт нотации"},
  {icon: "separator", event: "sep4", separator: true},
  {icon: "data_object", event: "show-attrs-json", title: "Просмотр JSON attrs"},
  {icon: "separator", event: "sep5", separator: true},
  {icon: "save", event: "save", title: "Сохранить", badge: props.hasUnsavedChanges, variant: "primary"},
]);

const emit = defineEmits<{
  action: [event: string];
}>();
</script>

<template>
  <header class="navigation-app-header">
    <div class="navigation-app-header__left">
      <button type="button" class="back-btn" title="К списку нотаций" @click="router.push({name: 'notations'})">
        <span class="material-symbols-outlined">arrow_back</span>
      </button>
      <AppLogo size="sm"/>
    </div>
    <div class="navigation-app-header__center">
      <IconToolbar :buttons="toolbarButtons" @action="emit('action', $event)"/>
    </div>
    <div class="navigation-app-header__right">
      <UserAvatar :email="currentUser?.email" size="sm"/>
    </div>
  </header>
</template>

<style scoped>
.navigation-app-header {
  display: grid;
  grid-template-columns: 280px 1fr 280px;
  align-items: center;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  position: sticky;
  top: 0;
  z-index: 10;
}

.navigation-app-header__left {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
}

.back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text-muted);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

.back-btn .material-symbols-outlined {
  font-size: 20px;
}

.back-btn:hover {
  background: var(--primary-soft);
  color: var(--primary);
  border-color: var(--primary);
}

.navigation-app-header__center {
  display: flex;
  align-items: center;
  padding: 12px 16px;
}

.navigation-app-header__right {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 12px 16px;
}
</style>
