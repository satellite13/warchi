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
  /** Показывать кнопку «Дерево версий». */
  showVersionTreeButton?: boolean;
  /** Показывать кнопку создания новой версии на базе выбранной. */
  showCreateFromVersionButton?: boolean;
  /** Префикс i18n для подписи кнопки дерева версий (например 'models' или 'notations'). */
  versionTreeI18nPrefix?: string;
}>();

const emit = defineEmits<{
  click: [];
  delete: [];
  rename: [];
  share: [];
  "version-change": [string];
  "change-icon": [];
  "show-version-tree": [];
  "create-from-version": [];
}>();
const { t, locale } = useI18n();

const cardColor = computed(() => getGradient(props.id));

const isStacked = computed(() => (props.versions?.length ?? 0) > 1);

const formattedUpdatedAt = computed(() => {
  if (!props.updatedAt) {
    return t("common.loadingDash");
  }
  const result = formatDate(props.updatedAt, locale.value);
  return result === "—" ? t("common.loadingDash") : result;
});
</script>

<template>
  <div class="model-card-wrap" :class="{ 'model-card-wrap--stacked': isStacked }">
    <div class="model-card" @click="emit('click')">
      <div class="model-card__gradient" :style="{ background: cardColor }">
      <div class="model-card__icon-wrap">
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
        </div>
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
      <button
        v-if="showVersionTreeButton && versionTreeI18nPrefix"
        class="model-card__version-tree"
        type="button"
        :aria-label="t(`${versionTreeI18nPrefix}.versionTreeTitle`, { name })"
        :title="t(`${versionTreeI18nPrefix}.versionTreeTitle`, { name })"
        @click.stop="emit('show-version-tree')"
      >
        <UiIcon :alt="t(`${versionTreeI18nPrefix}.versionTreeTitle`, { name })" name="account_tree" />
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
        <button
          v-if="showCreateFromVersionButton"
          type="button"
          class="model-card__copy-version"
          :aria-label="t('common.createFromVersion')"
          :title="t('common.createFromVersion')"
          @click.stop="emit('create-from-version')"
        >
          <UiIcon name="library_add" :alt="t('common.createFromVersion')" />
        </button>
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
  </div>
</template>

<style scoped>
.model-card-wrap {
  position: relative;
  display: block;
}

.model-card-wrap--stacked {
  padding: 0 6px 6px 0;
}

.model-card-wrap--stacked::before,
.model-card-wrap--stacked::after {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  width: 320px;
  height: 100%;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--surface);
  pointer-events: none;
  z-index: 0;
}

.model-card-wrap--stacked::before {
  transform: translate(4px, 4px);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.model-card-wrap--stacked::after {
  transform: translate(8px, 8px);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.model-card-wrap--stacked .model-card {
  position: relative;
  z-index: 1;
}

.model-card {
  display: flex;
  flex-direction: column;
  width: 320px;
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

.model-card__icon-wrap {
  margin-left: 24px;
  position: relative;
  z-index: 1;
}

.model-card__icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  color: rgba(255, 255, 255, 0.95);
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
}

.model-card__icon :deep(.ui-icon),
.model-card__icon .model-card__icon-img {
  width: 20px;
  height: 20px;
  object-fit: contain;
}

.model-card__icon-img {
  flex-shrink: 0;
}

.model-card__icon-edit {
  position: absolute;
  right: -2px;
  bottom: -2px;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 6px;
  background: var(--surface);
  color: var(--text-muted);
  cursor: pointer;
  box-shadow: var(--shadow-sm);
  border: 1px solid var(--border);
  opacity: 0;
  transition: opacity 0.2s ease, background 0.2s ease, color 0.2s ease;
}

.model-card__icon-edit .ui-icon {
  width: 10px;
  height: 10px;
}

.model-card__icon-wrap:hover .model-card__icon-edit {
  opacity: 1;
}

.model-card__icon-edit:hover {
  background: var(--primary-soft);
  color: var(--primary);
  border-color: var(--primary);
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
.model-card__share,
.model-card__version-tree {
  position: absolute;
  top: 12px;
  width: 24px;
  height: 24px;
  border-radius: 6px;
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
  right: 44px;
}

.model-card__share {
  right: 76px;
}

.model-card__version-tree {
  right: 108px;
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

.model-card__share:hover,
.model-card__version-tree:hover {
  background: var(--surface-strong);
  border-color: var(--accent);
  color: var(--accent);
}

.model-card__delete :deep(.ui-icon),
.model-card__rename :deep(.ui-icon),
.model-card__share :deep(.ui-icon),
.model-card__version-tree :deep(.ui-icon),
.model-card__delete :deep(svg),
.model-card__rename :deep(svg),
.model-card__share :deep(svg),
.model-card__version-tree :deep(svg) {
  width: 16px;
  height: 16px;
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

.model-card__copy-version {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
}

.model-card__copy-version:hover {
  background: var(--surface-strong);
  border-color: var(--primary);
  color: var(--primary);
}

.model-card__copy-version :deep(.ui-icon),
.model-card__copy-version :deep(svg) {
  width: 16px;
  height: 16px;
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
