<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { loadAllDiagramReferences } from '@/features/models-validation/composables/useAllDiagramReferences'
import type { DuplicateLinkMember, DuplicateNodeMember } from '@/features/models-validation/types'
import type { DiagramReferenceResponse } from '@/types/api'

const props = withDefaults(
  defineProps<{
    modelId: string
    kind: 'node' | 'link'
    title: string
    count: number
    nodeMembers?: DuplicateNodeMember[]
    linkMembers?: DuplicateLinkMember[]
  }>(),
  {
    nodeMembers: () => [],
    linkMembers: () => [],
  }
)

const emit = defineEmits<{
  merge: [{ keepId: string; dropId: string; kind: 'node' | 'link' }]
}>()

const router = useRouter()
const { t } = useI18n()

type MemberRow = {
  id: string
  name: string
  parentName: string | null
}

type ChipState = {
  loading: boolean
  error: string | null
  rows: DiagramReferenceResponse[]
  loaded: boolean
}

const members = computed<MemberRow[]>(() => {
  if (props.kind === 'node') {
    return props.nodeMembers.map(node => ({
      id: node.id,
      name: node.name,
      parentName: node.parentName,
    }))
  }
  return props.linkMembers.map(link => ({
    id: link.id,
    name: link.id,
    parentName: null,
  }))
})

const keepId = ref('')
const chipsByMemberId = reactive<Record<string, ChipState>>({})
const radioGroupName = computed(
  () => `validation-keep-${props.modelId}-${props.kind}-${props.title}`
)

watch(
  members,
  rows => {
    if (rows.length === 0) {
      keepId.value = ''
      return
    }
    if (!rows.some(row => row.id === keepId.value)) {
      keepId.value = rows[0]?.id ?? ''
    }
  },
  { immediate: true }
)

async function loadMemberDiagrams(memberId: string): Promise<void> {
  const existing = chipsByMemberId[memberId]
  if (existing?.loaded || existing?.loading) return

  chipsByMemberId[memberId] = { loading: true, error: null, rows: [], loaded: false }
  try {
    const target = props.kind === 'node' ? { nodeId: memberId } : { linkId: memberId }
    const rows = await loadAllDiagramReferences(props.modelId, target)
    chipsByMemberId[memberId] = { loading: false, error: null, rows, loaded: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    chipsByMemberId[memberId] = { loading: false, error: message, rows: [], loaded: false }
  }
}

function onDetailsToggle(memberId: string, event: Event): void {
  const details = event.currentTarget
  if (!(details instanceof HTMLDetailsElement) || !details.open) return
  void loadMemberDiagrams(memberId)
}

function openNode(nodeId: string): void {
  void router.push({
    name: 'model-editor',
    params: { id: props.modelId },
    query: { nodeId },
  })
}

function openDiagram(memberId: string, diagramId: string): void {
  void router.push({
    name: 'model-editor',
    params: { id: props.modelId },
    query:
      props.kind === 'node'
        ? { diagramId, nodeId: memberId }
        : { diagramId, linkId: memberId },
  })
}

function onMerge(dropId: string): void {
  if (!keepId.value || keepId.value === dropId) return
  emit('merge', { keepId: keepId.value, dropId, kind: props.kind })
}
</script>

<template>
  <article class="validation-duplicate-group">
    <header class="validation-duplicate-group__header">
      <h3 class="validation-duplicate-group__title">{{ title }}</h3>
      <span class="validation-duplicate-group__badge">
        {{ t('models.validationReportCopies', { count }) }}
      </span>
      <p class="validation-duplicate-group__hint">
        {{ t('models.validationReportGroupHint') }}
      </p>
    </header>

    <ul class="validation-duplicate-group__members">
      <li
        v-for="member in members"
        :key="member.id"
        class="validation-duplicate-group__member"
      >
        <details
          class="validation-duplicate-group__details"
          :class="{ 'validation-duplicate-group__details--keep': member.id === keepId }"
          @toggle="onDetailsToggle(member.id, $event)"
        >
          <summary class="validation-duplicate-group__summary">
            <label class="validation-duplicate-group__keep" @click.stop>
              <input
                v-model="keepId"
                type="radio"
                :name="radioGroupName"
                :value="member.id"
                :aria-label="t('models.validationReportKeepAria')"
              />
            </label>

            <button
              v-if="kind === 'node'"
              type="button"
              class="validation-duplicate-group__name"
              @click.stop="openNode(member.id)"
            >
              {{ member.name }}
            </button>
            <span v-else class="validation-duplicate-group__name validation-duplicate-group__name--static">
              {{ member.name }}
            </span>

            <span
              v-if="member.parentName"
              class="validation-duplicate-group__parent"
            >
              {{ t('models.validationReportInFolder', { name: member.parentName }) }}
            </span>

            <span
              v-if="member.id === keepId"
              class="validation-duplicate-group__kept"
            >
              {{ t('models.validationReportKeep') }}
            </span>
            <button
              v-else
              type="button"
              class="validation-duplicate-group__merge"
              @click.stop="onMerge(member.id)"
            >
              {{ t('models.validationReportMergeInto') }}
            </button>
          </summary>

          <div class="validation-duplicate-group__chips">
            <p
              v-if="chipsByMemberId[member.id]?.loading"
              class="validation-duplicate-group__status"
            >
              {{ t('common.loading') }}
            </p>
            <p
              v-else-if="chipsByMemberId[member.id]?.error"
              class="validation-duplicate-group__status validation-duplicate-group__status--error"
            >
              {{ chipsByMemberId[member.id]?.error }}
            </p>
            <template v-else>
              <button
                v-for="diagram in chipsByMemberId[member.id]?.rows ?? []"
                :key="diagram.id"
                type="button"
                class="chip validation-duplicate-group__chip"
                @click="openDiagram(member.id, diagram.id)"
              >
                {{ diagram.name }}
              </button>
            </template>
          </div>
        </details>
      </li>
    </ul>
  </article>
</template>

<style scoped>
.validation-duplicate-group {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px 14px;
}

.validation-duplicate-group__header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.validation-duplicate-group__hint {
  flex: 1 0 100%;
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--text-muted);
}

.validation-duplicate-group__title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.validation-duplicate-group__badge {
  font-size: 11px;
  color: var(--text-subtle);
  background: var(--surface-muted);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 1px 8px;
}

.validation-duplicate-group__members {
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.validation-duplicate-group__details {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-muted);
  padding: 8px 10px;
}

.validation-duplicate-group__details--keep {
  border-color: var(--primary);
  background: var(--surface);
}

.validation-duplicate-group__summary {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  cursor: pointer;
  list-style: none;
}

.validation-duplicate-group__summary::-webkit-details-marker {
  display: none;
}

.validation-duplicate-group__keep {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
}

.validation-duplicate-group__kept {
  margin-left: auto;
  font-size: 12px;
  color: var(--primary);
  font-weight: 600;
}

.validation-duplicate-group__name {
  border: none;
  background: none;
  padding: 0;
  font: inherit;
  font-size: 13px;
  color: var(--primary);
  cursor: pointer;
  text-align: left;
}

.validation-duplicate-group__name--static {
  color: var(--base-text);
  cursor: default;
}

.validation-duplicate-group__parent {
  font-size: 12px;
  color: var(--text-muted);
}

.validation-duplicate-group__merge {
  margin-left: auto;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--base-text);
  font: inherit;
  font-size: 12px;
  padding: 3px 8px;
  cursor: pointer;
}

.validation-duplicate-group__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.validation-duplicate-group__status {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
}

.validation-duplicate-group__status--error {
  color: var(--danger);
}
</style>
