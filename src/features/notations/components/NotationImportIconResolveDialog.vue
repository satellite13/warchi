<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import BaseModal from '@/components/modals/BaseModal.vue'
import IconPicker from '@/components/forms/IconPicker.vue'

const props = defineProps<{
  missing: string[]
}>()

const emit = defineEmits<{
  confirm: [remap: Record<string, string>]
  cancel: []
}>()

const { t } = useI18n()
const choices = reactive<Record<string, string>>({})

watch(
  () => props.missing,
  (names) => {
    for (const key of Object.keys(choices)) {
      if (!names.includes(key)) delete choices[key]
    }
    for (const name of names) {
      if (choices[name] == null) choices[name] = ''
    }
  },
  { immediate: true },
)

const canConfirm = computed(() => props.missing.every((name) => Boolean(choices[name]?.trim())))

function confirm(): void {
  if (!canConfirm.value) return
  const remap: Record<string, string> = {}
  for (const name of props.missing) {
    remap[name] = choices[name]!.trim()
  }
  emit('confirm', remap)
}
</script>

<template>
  <BaseModal :title="t('notations.importIconResolveTitle')" max-width="560px" @close="emit('cancel')">
    <p class="icon-resolve__text">{{ t('notations.importIconResolveText') }}</p>
    <p class="icon-resolve__hint">{{ t('notations.importIconResolveAskAdmin') }}</p>
    <div v-for="name in missing" :key="name" class="icon-resolve__row">
      <span class="icon-resolve__name">{{ name }}</span>
      <IconPicker
        :model-value="choices[name] ?? ''"
        :empty-label="t('nodeStyle.none')"
        @update:model-value="choices[name] = $event"
      />
    </div>
    <template #footer>
      <button type="button" class="btn btn--secondary" @click="emit('cancel')">
        {{ t('common.cancel') }}
      </button>
      <button type="button" class="btn btn--primary" :disabled="!canConfirm" @click="confirm">
        {{ t('notations.importIconResolveConfirm') }}
      </button>
    </template>
  </BaseModal>
</template>

<style scoped>
.icon-resolve__text,
.icon-resolve__hint {
  margin: 0 0 12px;
  color: var(--text-muted);
  font-size: 14px;
  line-height: 1.45;
}

.icon-resolve__row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}

.icon-resolve__name {
  min-width: 120px;
  font-family: ui-monospace, monospace;
  font-size: 13px;
}
</style>
