<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import BaseModal from '@/components/modals/BaseModal.vue'
import MultiSelect from '@/components/forms/MultiSelect.vue'

const props = defineProps<{
  fromName: string
  toName: string
  relationOptions: Array<{ id: string; label: string }>
  selectedRelationIds: string[]
  clipboardRelationIds: string[]
}>()

const emit = defineEmits<{
  close: []
  apply: [relationIds: string[]]
  copy: [relationIds: string[]]
}>()

const { t } = useI18n()

const localSelected = ref<string[]>([...props.selectedRelationIds])

watch(
  () => props.selectedRelationIds,
  ids => {
    localSelected.value = [...ids]
  },
)

const title = computed(() =>
  t('diagram.relationRulesMatrixCellTitle', { from: props.fromName, to: props.toName }),
)

const optionIdSet = computed(() => new Set(props.relationOptions.map(o => o.id)))

const canCopy = computed(() => localSelected.value.length > 0)
const canPaste = computed(() =>
  props.clipboardRelationIds.some(id => optionIdSet.value.has(id)),
)

const clipboardHint = computed(() => {
  if (props.clipboardRelationIds.length === 0) return ''
  return t('diagram.relationRulesMatrixClipboardHint', {
    count: props.clipboardRelationIds.length,
  })
})

const copySelection = () => {
  if (!canCopy.value) return
  emit('copy', [...localSelected.value])
}

const pasteSelection = () => {
  if (!canPaste.value) return
  const next = props.clipboardRelationIds.filter(id => optionIdSet.value.has(id))
  localSelected.value = Array.from(new Set(next))
}

const submit = () => {
  emit('apply', [...localSelected.value])
}

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  )
}

const onKeydown = (event: KeyboardEvent) => {
  if (isEditableTarget(event.target)) return
  const mod = event.metaKey || event.ctrlKey
  if (!mod) return
  const key = event.key.toLowerCase()
  if (key === 'c' && canCopy.value) {
    event.preventDefault()
    event.stopPropagation()
    copySelection()
    return
  }
  if (key === 'v' && canPaste.value) {
    event.preventDefault()
    event.stopPropagation()
    pasteSelection()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown, true)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown, true)
})
</script>

<template>
  <BaseModal :title="title" max-width="480px" @close="emit('close')">
    <div class="cell-dialog">
      <div class="cell-dialog__toolbar">
        <label class="cell-dialog__label">{{ t('diagram.links') }}</label>
        <div class="cell-dialog__actions">
          <button
            type="button"
            class="link-btn"
            :disabled="!canCopy"
            :title="t('diagram.relationRulesMatrixCopyTitle')"
            @click="copySelection"
          >
            {{ t('diagram.relationRulesMatrixCopy') }}
          </button>
          <button
            type="button"
            class="link-btn"
            :disabled="!canPaste"
            :title="t('diagram.relationRulesMatrixPasteTitle')"
            @click="pasteSelection"
          >
            {{ t('diagram.relationRulesMatrixPaste') }}
          </button>
        </div>
      </div>
      <MultiSelect
        :model-value="localSelected"
        :options="relationOptions"
        :placeholder="t('diagram.selectLinks')"
        :search-placeholder="t('diagram.searchLink')"
        :empty-text="t('diagram.noNotationLinks')"
        @update:model-value="localSelected = $event"
      />
      <p v-if="clipboardHint" class="cell-dialog__hint">{{ clipboardHint }}</p>
    </div>

    <template #footer>
      <button type="button" class="btn btn--secondary" @click="emit('close')">
        {{ t('common.cancel') }}
      </button>
      <button type="button" class="btn btn--primary" @click="submit">
        {{ t('diagram.relationRulesMatrixApply') }}
      </button>
    </template>
  </BaseModal>
</template>

<style scoped>
.cell-dialog {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cell-dialog__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.cell-dialog__label {
  font-size: 12px;
  color: var(--text-muted);
}

.cell-dialog__actions {
  display: flex;
  gap: 10px;
  flex-shrink: 0;
}

.cell-dialog__hint {
  margin: 0;
  font-size: 12px;
  color: var(--text-subtle);
}

.link-btn {
  background: none;
  border: none;
  color: var(--primary);
  cursor: pointer;
  font-size: 12px;
  padding: 0;
}

.link-btn:disabled {
  color: var(--text-subtle);
  cursor: not-allowed;
}

.link-btn:not(:disabled):hover {
  text-decoration: underline;
}
</style>
