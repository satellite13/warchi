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
    <div class="link-reuse-modal__list">
      <button
        v-for="option in options"
        :key="option.id"
        type="button"
        class="link-reuse-modal__option"
        :data-link-id="option.id"
        @click="emit('select', option.id)"
      >
        <div class="link-reuse-modal__title">{{ t('models.useExistingLink') }}</div>
        <div class="link-reuse-modal__meta">
          {{ t('models.reuseLinkTypeLabel') }}: {{ option.linkTypeName }}
        </div>
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
.link-reuse-modal__list {
  display: grid;
  gap: 8px;
}

.link-reuse-modal__option,
.link-reuse-modal__create-new {
  width: 100%;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.link-reuse-modal__option {
  background: var(--surface);
}

.link-reuse-modal__create-new {
  background: var(--primary);
  border-color: var(--primary);
  color: white;
  text-align: center;
}

.link-reuse-modal__title {
  font-weight: 600;
}

.link-reuse-modal__meta,
.link-reuse-modal__properties-title,
.link-reuse-modal__empty {
  color: var(--text-muted);
  font-size: 0.875rem;
}

.link-reuse-modal__properties {
  margin-top: 8px;
}

.link-reuse-modal__property {
  font-size: 0.875rem;
}
</style>
