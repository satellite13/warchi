<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import UnsavedBadge from '@/components/UnsavedBadge.vue'
import UiIcon from '@/components/ui/UiIcon.vue'

const props = withDefaults(
  defineProps<{
    title: string
    icon: string
    helpDocsSection: string
    helpTitle?: string
    isDirty?: boolean
    isSaving?: boolean
    isDeleting?: boolean
    canEdit?: boolean
    canShare?: boolean
    canDelete?: boolean
    showDocButton?: boolean
    hasDoc?: boolean
    docButtonTitle?: string
    showUnsavedBadge?: boolean
    unsavedTooltipKey?: string
    saveDisabled?: boolean
  }>(),
  {
    helpTitle: '',
    isDirty: false,
    isSaving: false,
    isDeleting: false,
    canEdit: true,
    canShare: false,
    canDelete: true,
    showDocButton: true,
    hasDoc: false,
    docButtonTitle: '',
    showUnsavedBadge: undefined,
    unsavedTooltipKey: 'types.unsavedChangesHint',
    saveDisabled: undefined,
  },
)

const emit = defineEmits<{
  save: []
  delete: []
  share: []
  openDoc: []
}>()

const { t } = useI18n()

const showBadge = computed(() =>
  props.showUnsavedBadge === undefined ? props.isDirty : props.showUnsavedBadge,
)

const isSaveDisabled = computed(() =>
  props.saveDisabled === undefined
    ? props.isSaving || props.isDeleting || !props.isDirty
    : props.saveDisabled,
)
</script>

<template>
  <div class="efh">
    <div class="efh__title-row">
      <div class="efh__icon">
        <slot name="title-prefix">
          <UiIcon :name="icon" />
        </slot>
      </div>
      <h2 class="efh__title">{{ title }}</h2>
      <button
        v-if="showDocButton"
        type="button"
        class="efh__doc-btn"
        :title="docButtonTitle || t('types.documentation')"
        @click="emit('openDoc')"
      >
        <UiIcon name="description" class="efh__doc-btn-icon" />
        <span v-if="hasDoc" class="efh__doc-badge">
          <UiIcon name="check" />
        </span>
      </button>
      <slot name="title-suffix">
        <UnsavedBadge v-if="showBadge" :tooltip-key="unsavedTooltipKey" />
      </slot>
    </div>

    <div class="efh__actions">
      <slot name="actions-before-help" />
      <RouterLink
        :to="{ name: 'docs-section', params: { section: helpDocsSection } }"
        class="efh__help-link"
        :title="helpTitle || t('types.helpTitle')"
      >
        <UiIcon name="help" />
      </RouterLink>
      <slot name="actions">
        <template v-if="canEdit">
          <button
            v-if="canShare"
            type="button"
            class="btn btn--secondary"
            :disabled="isSaving || isDeleting"
            @click="emit('share')"
          >
            <UiIcon name="share" />
            {{ t('common.share') }}
          </button>
          <button
            v-if="canDelete"
            type="button"
            class="btn btn--soft-danger"
            :disabled="isSaving || isDeleting"
            @click="emit('delete')"
          >
            <UiIcon name="delete" />
            {{ t('common.delete') }}
          </button>
          <button
            type="button"
            class="btn btn--primary"
            :disabled="isSaveDisabled"
            @click="emit('save')"
          >
            <UiIcon name="save" />
            {{ isSaving ? t('common.saving') : t('common.save') }}
          </button>
        </template>
      </slot>
    </div>
  </div>
</template>

<style scoped>
.efh {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border);
}

.efh__title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.efh__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--primary-soft);
  color: var(--primary);
  flex-shrink: 0;
}

.efh__icon .ui-icon {
  width: 20px;
  height: 20px;
}

.efh__title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--base-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.efh__doc-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text-muted);
  cursor: pointer;
  flex-shrink: 0;
  transition:
    background 0.15s ease,
    color 0.15s ease,
    border-color 0.15s ease;
}

.efh__doc-btn:hover {
  background: var(--primary-soft);
  color: var(--primary);
  border-color: var(--primary);
}

.efh__doc-btn-icon {
  width: 18px;
  height: 18px;
}

.efh__doc-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--success);
  color: #fff;
}

.efh__doc-badge .ui-icon {
  width: 10px;
  height: 10px;
}

.efh__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.efh__help-link {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  color: var(--text-muted);
  transition:
    background 0.15s ease,
    color 0.15s ease;
}

.efh__help-link:hover {
  background: var(--surface-muted);
  color: var(--primary);
}

.efh__help-link .ui-icon {
  width: 20px;
  height: 20px;
}
</style>
