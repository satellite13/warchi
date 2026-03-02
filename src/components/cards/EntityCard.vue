<script setup lang="ts">
import {computed} from "vue";
import { useI18n } from "vue-i18n";
import UserAvatar from "../layout/UserAvatar.vue";
import { getGradient } from "@/utils/gradientColors";
import { formatDate } from "@/utils/formatDate";

const props = defineProps<{
  id: string;
  name: string;
  version: string;
  versions?: string[];
  ownerEmail?: string;
  accessLabel?: string;
  canShare?: boolean;
  updatedAt?: string | null;
  /** Иконка в шапке плашки (id из public/icons). Если задана, слот #icon не используется. */
  icon?: string;
  /** Показывать кнопку смены иконки в шапке. */
  canChangeIcon?: boolean;
}>();

const emit = defineEmits<{
  click: [];
  delete: [];
  rename: [];
  share: [];
  "version-change": [string];
  "change-icon": [];
}>();
const { t, locale } = useI18n();

const cardColor = computed(() => getGradient(props.id));

const formattedUpdatedAt = computed(() => {
  if (!props.updatedAt) {
    return t("common.loadingDash");
  }
  const result = formatDate(props.updatedAt, locale.value);
  return result === "—" ? t("common.loadingDash") : result;
});
</script>

<template>
  <div class="model-card" @click="emit('click')">
    <div class="model-card__gradient" :style="{ background: cardColor }">
      <div class="model-card__icon">
        <template v-if="icon">
          <img
            v-if="icon"
            class="model-card__icon-img"
            :src="`/icons/${icon}.svg`"
            :alt="name"
          >
        </template>
        <slot v-else name="icon" />
        <button
          v-if="canChangeIcon"
          type="button"
          class="model-card__icon-edit"
          :aria-label="t('common.changeIcon')"
          :title="t('common.changeIcon')"
          @click.stop="emit('change-icon')"
        >
          <UiIcon name="edit" />
        </button>
      </div>
    </div>
    <div class="model-card__body">
      <button class="model-card__delete" type="button" :aria-label="t('common.delete')" :title="t('common.delete')"
              @click.stop="emit('delete')">
        <UiIcon name="delete" :alt="t('common.delete')" />
      </button>
      <button class="model-card__rename" type="button" :aria-label="t('common.rename')" :title="t('common.rename')"
              @click.stop="emit('rename')">
        <UiIcon name="edit" :alt="t('common.rename')" />
      </button>
      <button
        v-if="canShare"
        class="model-card__share"
        type="button"
        :aria-label="t('share.manageAccess')"
        :title="t('common.share')"
        @click.stop="emit('share')"
      >
        <UiIcon name="share" :alt="t('common.share')" />
      </button>
      <span class="model-card__title">{{ name }}</span>
      <div class="model-card__version">
        <span v-if="!versions || versions.length <= 1" class="model-card__badge">v{{ version }}</span>
        <label v-else class="model-card__select">
          <span class="model-card__select-label">{{ t("common.version") }}</span>
          <select :value="version" @click.stop
                  @change="emit('version-change', ($event.target as HTMLSelectElement).value)">
            <option v-for="ver in versions" :key="ver" :value="ver">v{{ ver }}</option>
          </select>
        </label>
        <span class="model-card__updated">{{ t("common.updatedAt") }}: {{ formattedUpdatedAt }}</span>
      </div>
      <div v-if="accessLabel" class="model-card__access-badge">
        {{ accessLabel }}
      </div>
      <div class="model-card__owner">
        <UserAvatar :label="ownerEmail" size="md"/>
        <div class="owner-meta">
          <span class="owner-email">{{ ownerEmail || t("common.unknownUser") }}</span>
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
  box-shadow: var(--shadow-md), var(--shadow-glow);
  transform: translateY(-4px);
  border-color: var(--border-strong);
}

.model-card__gradient {
  height: 82px;
  margin: -1px -1px 0;
  display: flex;
  align-items: center;
  justify-content: left;
  position: relative;
  overflow: hidden;
}

.model-card__gradient::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, transparent 40%, rgba(0, 0, 0, 0.15) 100%);
}

.model-card__icon {
  width: 48px;
  height: 48px;
  margin-left: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  color: rgba(255, 255, 255, 0.95);
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
  position: relative;
  z-index: 1;
}

.model-card__icon :deep(.ui-icon),
.model-card__icon .model-card__icon-img {
  width: 28px;
  height: 28px;
  object-fit: contain;
}

.model-card__icon-img {
  flex-shrink: 0;
}

.model-card__icon-edit {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.35);
  color: rgba(255, 255, 255, 0.95);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.model-card__icon-edit .ui-icon {
  width: 18px;
  height: 18px;
}

.model-card__icon:hover .model-card__icon-edit {
  opacity: 1;
}

.model-card__icon-edit:hover {
  background: rgba(0, 0, 0, 0.5);
}

.model-card__body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  position: relative;
}

.model-card__delete,
.model-card__rename,
.model-card__share {
  position: absolute;
  top: 12px;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
}

.model-card__delete {
  right: 12px;
}

.model-card__rename {
  right: 48px;
}

.model-card__share {
  right: 84px;
}

.model-card__delete:hover {
  background: var(--surface-strong);
  border-color: var(--danger);
  color: var(--danger);
}

.model-card__rename:hover {
  background: var(--surface-strong);
  border-color: var(--primary);
  color: var(--primary);
}

.model-card__share:hover {
  background: var(--surface-strong);
  border-color: var(--accent);
  color: var(--accent);
}

.model-card__delete :deep(.ui-icon),
.model-card__rename :deep(.ui-icon),
.model-card__share :deep(.ui-icon),
.model-card__delete :deep(svg),
.model-card__rename :deep(svg),
.model-card__share :deep(svg) {
  width: 18px;
  height: 18px;
}

.model-card__title {
  font-weight: 600;
  font-size: 16px;
  color: var(--base-text);
  line-height: 1.3;
  letter-spacing: -0.01em;
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
  font-variant-numeric: tabular-nums;
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
  background: var(--surface-muted);
  border-radius: var(--radius-sm);
  padding: 4px 8px;
  font-size: 12px;
  color: var(--base-text);
  cursor: pointer;
  font-variant-numeric: tabular-nums;
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

.model-card__access-badge {
  align-self: flex-start;
  font-size: 11px;
  font-weight: 600;
  color: var(--primary);
  background: var(--primary-soft);
  border: 1px solid color-mix(in srgb, var(--primary) 24%, transparent);
  border-radius: 999px;
  padding: 2px 8px;
}
</style>
