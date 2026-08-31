<script setup lang="ts">
import { computed } from "vue"
import { useI18n } from "vue-i18n"

const props = defineProps<{
  /** Tooltip key: 'toolbar.unsavedChangesHint' in headers, 'types.unsavedChangesHint' in type form */
  tooltipKey?: string
}>()

const { t } = useI18n()

const tooltipText = computed(() =>
  props.tooltipKey ? t(props.tooltipKey) : t("types.unsavedChangesHint"),
)
</script>

<template>
  <AppTooltip :text="tooltipText" placement="bottom">
    <span class="unsaved-badge" role="status" aria-live="polite">
      <UiIcon name="edit" class="unsaved-badge__icon" />
      <span class="unsaved-badge__text">{{ t("types.notSaved") }}</span>
    </span>
  </AppTooltip>
</template>

<style scoped>
.unsaved-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 500;
  color: var(--warning);
  background: var(--warning-soft);
  border: 1px solid color-mix(in srgb, var(--warning) 28%, transparent);
  border-radius: 8px;
  padding: 5px 10px;
  white-space: nowrap;
}

.unsaved-badge__icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.unsaved-badge__text {
  line-height: 1.2;
}
</style>
