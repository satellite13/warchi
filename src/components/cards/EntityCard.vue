<script setup lang="ts">
import {computed} from "vue";
import UserAvatar from "../UserAvatar.vue";

const props = defineProps<{
  id: string;
  name: string;
  version: string;
  versions?: string[];
  ownerEmail?: string;
  updatedAt?: string | null;
}>();

const emit = defineEmits<{
  click: [];
  delete: [];
  "version-change": [string];
}>();

const gradientColors = [
  "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
  "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
  "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
  "linear-gradient(135deg, #fa709a 0%, #fee140 100%)",
  "linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)",
  "linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)",
  "linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)"
];

const cardColor = computed(() => {
  let hash = 0;
  for (let i = 0; i < props.id.length; i++) {
    hash = props.id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return gradientColors[Math.abs(hash) % gradientColors.length];
});

const formattedUpdatedAt = computed(() => {
  if (!props.updatedAt) {
    return "—";
  }
  const date = new Date(props.updatedAt);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
});
</script>

<template>
  <div class="model-card" @click="emit('click')">
    <div class="model-card__gradient" :style="{ background: cardColor }">
      <div class="model-card__icon">
        <slot name="icon"></slot>
      </div>
    </div>
    <div class="model-card__body">
      <button class="model-card__delete" type="button" aria-label="Удалить модель" title="Удалить"
              @click.stop="emit('delete')">
        <span class="material-symbols-outlined" title="Удалить">delete</span>
      </button>
      <span class="model-card__title">{{ name }}</span>
      <div class="model-card__version">
        <span v-if="!versions || versions.length <= 1" class="model-card__badge">v{{ version }}</span>
        <label v-else class="model-card__select">
          <span class="model-card__select-label">Версия</span>
          <select :value="version" @click.stop
                  @change="emit('version-change', ($event.target as HTMLSelectElement).value)">
            <option v-for="ver in versions" :key="ver" :value="ver">v{{ ver }}</option>
          </select>
        </label>
        <span class="model-card__updated">Обновлено: {{ formattedUpdatedAt }}</span>
      </div>
      <div class="model-card__owner">
        <UserAvatar :email="ownerEmail" size="md"/>
        <div class="owner-meta">
          <span class="owner-email">{{ ownerEmail || 'Загрузка...' }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.model-card {
  display: flex;
  flex-direction: column;
  width: 260px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--surface);
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  box-shadow: var(--shadow-sm);
  transition: box-shadow 0.25s ease, transform 0.25s ease, border-color 0.25s ease;
}

.model-card:hover {
  box-shadow: var(--shadow-md);
  transform: translateY(-4px);
  border-color: var(--border-strong);
}

.model-card__gradient {
  height: 82px;
  margin: -5px -6px 0;
  display: flex;
  align-items: center;
  justify-content: left;
}

.model-card__icon {
  color: rgba(255, 255, 255, 0.9);
  font-size: 36px;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1));
  margin-left: 30px;
}

.model-card__body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  position: relative;
}

.model-card__delete {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: var(--surface-strong);
  color: var(--text-muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease;
}

.model-card__delete:hover {
  background: var(--danger-soft);
  color: var(--danger);
}

.model-card__delete svg {
  width: 16px;
  height: 16px;
}

.model-card__title {
  font-weight: 600;
  font-size: 16px;
  color: var(--base-text);
  line-height: 1.3;
}

.model-card__version {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  column-gap: 10px;
  row-gap: 6px;
}

.model-card__badge {
  padding: 3px 10px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted);
  background: var(--surface-strong);
  border-radius: 12px;
}

.model-card__select {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-muted);
}

.model-card__select-label {
  font-weight: 500;
}

.model-card__select select {
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: var(--radius-sm);
  padding: 4px 8px;
  font-size: 12px;
  color: var(--base-text);
  cursor: pointer;
}

.model-card__owner {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.owner-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 0;
}

.owner-email {
  font-size: 13px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-card__updated {
  font-size: 12px;
  color: var(--text-subtle);
}
</style>
