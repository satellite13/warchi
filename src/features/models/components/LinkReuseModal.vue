<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import BaseModal from '@/components/modals/BaseModal.vue'

export type LinkReuseOption = {
  id: string
  linkTypeName: string
  customProperties: Array<{ name: string; value: string }>
}

defineProps<{
  options: LinkReuseOption[]
}>()

const emit = defineEmits<{
  close: []
  select: [linkId: string]
  'create-new': []
}>()

const { t } = useI18n()
</script>

<template>
  <BaseModal :title="t('models.existingLinksFoundTitle')" max-width="500px" @close="emit('close')">
    <p class="link-reuse-modal__hint">{{ t('models.reuseLinkSelectHint') }}</p>
    <div class="link-reuse-modal__list" role="listbox" :aria-label="t('models.existingLinksFoundTitle')">
      <button
        v-for="option in options"
        :key="option.id"
        type="button"
        class="link-reuse-modal__option"
        role="option"
        :data-link-id="option.id"
        :aria-label="t('models.reuseLinkSelectAria', { type: option.linkTypeName })"
        @click="emit('select', option.id)"
      >
        <div class="link-reuse-modal__option-main">
          <div class="link-reuse-modal__title">{{ option.linkTypeName }}</div>
          <div class="link-reuse-modal__meta">{{ t('models.useExistingLink') }}</div>
          <div class="link-reuse-modal__properties">
            <div class="link-reuse-modal__properties-title">
              {{ t('models.reuseLinkCustomPropertiesLabel') }}
            </div>
            <div
              v-for="property in option.customProperties"
              :key="`${option.id}-${property.name}`"
              class="link-reuse-modal__property"
            >
              {{ property.name }}: {{ property.value }}
            </div>
            <div v-if="option.customProperties.length === 0" class="link-reuse-modal__empty">
              {{ t('models.reuseLinkNoCustomProperties') }}
            </div>
          </div>
        </div>
        <span class="link-reuse-modal__action" aria-hidden="true">
          {{ t('models.reuseLinkSelectAction') }}
          <UiIcon name="chevron_right" class="link-reuse-modal__action-icon" />
        </span>
      </button>
      <button
        type="button"
        class="link-reuse-modal__create-new"
        @click="emit('create-new')"
      >
        {{ t('models.createNewLink') }}
      </button>
    </div>
  </BaseModal>
</template>

<style scoped>
.link-reuse-modal__hint {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--text-muted);
}

.link-reuse-modal__list {
  display: grid;
  gap: 8px;
}

.link-reuse-modal__option {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-muted);
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.link-reuse-modal__option:hover {
  border-color: var(--primary);
  background: var(--primary-soft);
}

.link-reuse-modal__option:focus-visible {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-soft);
}

.link-reuse-modal__option:active {
  border-color: var(--primary);
  background: var(--primary-soft);
  box-shadow: inset 0 0 0 1px var(--primary);
}

.link-reuse-modal__option-main {
  min-width: 0;
  flex: 1 1 auto;
}

.link-reuse-modal__create-new {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--primary);
  border-radius: 8px;
  background: var(--primary);
  color: #fff;
  text-align: center;
  cursor: pointer;
  font-weight: 500;
  transition: background 0.15s ease, box-shadow 0.15s ease;
}

.link-reuse-modal__create-new:hover {
  background: var(--primary-hover);
  box-shadow: 0 4px 16px var(--primary-soft);
}

.link-reuse-modal__create-new:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--primary-soft);
}

.link-reuse-modal__title {
  font-weight: 600;
  color: var(--base-text);
}

.link-reuse-modal__meta,
.link-reuse-modal__properties-title,
.link-reuse-modal__empty {
  color: var(--text-muted);
  font-size: 0.875rem;
}

.link-reuse-modal__meta {
  margin-top: 2px;
}

.link-reuse-modal__properties {
  margin-top: 8px;
}

.link-reuse-modal__property {
  font-size: 0.875rem;
  color: var(--base-text);
}

.link-reuse-modal__action {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  margin-top: 2px;
  font-size: 12px;
  font-weight: 600;
  color: var(--primary);
}

.link-reuse-modal__action-icon {
  width: 18px;
  height: 18px;
}

.link-reuse-modal__option:hover .link-reuse-modal__action,
.link-reuse-modal__option:focus-visible .link-reuse-modal__action {
  color: var(--primary-hover, var(--primary));
}
</style>
