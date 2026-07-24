<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import BaseModal from '@/components/modals/BaseModal.vue'
import SearchableSelect from '@/components/forms/SearchableSelect.vue'
import type { CopyRelationRulesMode } from '../utils/copyRelationRules'

const props = defineProps<{
  componentOptions: Array<{ id: string; label: string }>
  componentIconMap?: Map<string, string>
  buildIconUrl?: (iconName: string) => string
  error?: string
}>()

const emit = defineEmits<{
  close: []
  confirm: [payload: { sourceComponentId: string; mode: CopyRelationRulesMode }]
}>()

const { t } = useI18n()

const sourceComponentId = ref('')
const mode = ref<CopyRelationRulesMode>('merge')
const localError = ref('')

const displayError = computed(() => props.error || localError.value)

watch(
  () => props.componentOptions,
  options => {
    if (!options.some(o => o.id === sourceComponentId.value)) {
      sourceComponentId.value = options[0]?.id ?? ''
    }
  },
  { immediate: true },
)

watch([sourceComponentId, mode], () => {
  localError.value = ''
})

watch(
  () => props.error,
  parentError => {
    if (parentError) localError.value = ''
  },
)

const canConfirm = computed(() => Boolean(sourceComponentId.value))

const submit = () => {
  localError.value = ''
  if (!sourceComponentId.value) {
    localError.value = t('diagram.copyLinkRulesSelectSource')
    return
  }
  emit('confirm', { sourceComponentId: sourceComponentId.value, mode: mode.value })
}

const iconFor = (id: string): string | undefined => props.componentIconMap?.get(id)

const iconUrlFor = (id: string): string | undefined => {
  const iconName = iconFor(id)
  if (!iconName || !props.buildIconUrl) return undefined
  return props.buildIconUrl(iconName)
}
</script>

<template>
  <BaseModal :title="t('diagram.copyLinkRulesTitle')" max-width="440px" @close="emit('close')">
    <div class="copy-rules-modal">
      <label class="copy-rules-modal__label">{{ t('diagram.copyLinkRulesSource') }}</label>
      <SearchableSelect
        :model-value="sourceComponentId"
        :options="componentOptions"
        :placeholder="t('diagram.selectComponent')"
        :search-placeholder="t('diagram.searchComponent')"
        :empty-text="t('common.nothingFound')"
        @update:model-value="sourceComponentId = $event"
      >
        <template #selected="{ option }">
          <span class="copy-rules-modal__icon-option">
            <img
              v-if="iconUrlFor(option.id)"
              class="copy-rules-modal__icon"
              :src="iconUrlFor(option.id)"
              :alt="option.label"
            />
            {{ option.label }}
          </span>
        </template>
        <template #option="{ option }">
          <span class="copy-rules-modal__icon-option">
            <img
              v-if="iconUrlFor(option.id)"
              class="copy-rules-modal__icon"
              :src="iconUrlFor(option.id)"
              :alt="option.label"
            />
            {{ option.label }}
          </span>
        </template>
      </SearchableSelect>

      <fieldset class="copy-rules-modal__modes">
        <label class="copy-rules-modal__radio">
          <input v-model="mode" type="radio" value="merge" />
          {{ t('diagram.copyLinkRulesMerge') }}
        </label>
        <label class="copy-rules-modal__radio">
          <input v-model="mode" type="radio" value="replace" />
          {{ t('diagram.copyLinkRulesReplace') }}
        </label>
      </fieldset>

      <div v-if="displayError" class="copy-rules-modal__error">{{ displayError }}</div>
    </div>

    <template #footer>
      <button type="button" class="btn btn--secondary" @click="emit('close')">
        {{ t('common.cancel') }}
      </button>
      <button type="button" class="btn btn--primary" :disabled="!canConfirm" @click="submit">
        {{ t('diagram.copyLinkRulesConfirm') }}
      </button>
    </template>
  </BaseModal>
</template>

<style scoped>
.copy-rules-modal {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.copy-rules-modal__label {
  font-size: 12px;
  color: var(--text-muted);
}

.copy-rules-modal__modes {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 4px 0 0;
  padding: 0;
  border: none;
}

.copy-rules-modal__radio {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  cursor: pointer;
}

.copy-rules-modal__error {
  font-size: 12px;
  color: var(--danger);
}

.copy-rules-modal__icon-option {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.copy-rules-modal__icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  opacity: 0.7;
}
</style>
