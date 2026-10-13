<script setup lang="ts">
import { computed, reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import BaseModal from '@/components/modals/BaseModal.vue'
import type { SaveAuditFix, SaveAuditIssue } from '../utils/saveAudit'

const props = defineProps<{
  issues: SaveAuditIssue[]
  nodeNames: Record<string, string>
  blocked: boolean
}>()

const emit = defineEmits<{
  close: []
  applyFix: [fix: SaveAuditFix]
  save: []
  findInTree: [nodeId: string]
}>()

const { t } = useI18n()

const blockingIssues = computed(() => props.issues.filter(i => i.severity === 'block'))
const warningIssues = computed(() => props.issues.filter(i => i.severity === 'warn'))

// Keyed by node id; contains edited value once the user types (default from nodeNames).
const renameState = reactive<Record<string, string>>({})

const renameValue = (nodeId: string): string =>
  renameState[nodeId] ?? props.nodeNames[nodeId] ?? ''

const onRenameInput = (nodeId: string, event: Event): void => {
  renameState[nodeId] = (event.target as HTMLInputElement).value ?? ''
}

const applyRename = (nodeId: string): void => {
  const value = renameValue(nodeId).trim()
  if (!value) return
  emit('applyFix', { kind: 'renameNode', nodeId, toName: value })
}

const kindLabel = (issue: SaveAuditIssue): string => t(`models.saveAudit.kind.${issue.kind}`)

const apply = (fix: SaveAuditFix | null): void => {
  if (!fix) return
  emit('applyFix', fix)
}

/** Model node to reveal in the tree for a given issue, or null when not applicable. */
const focusNodeId = (issue: SaveAuditIssue): string | null => {
  if (issue.kind === 'duplicateNodeName') return issue.entityIds[0] ?? null
  if (issue.kind === 'treeCycle' && issue.fix?.kind === 'reparentNode') return issue.fix.nodeId
  if (issue.kind === 'autoCreatedConflict' && issue.fix?.kind === 'reuseAutoCreated') {
    return issue.fix.keepNodeId
  }
  return null
}
</script>

<template>
  <BaseModal
    :title="t('models.saveAudit.title')"
    max-width="min(96vw, 760px)"
    @close="emit('close')"
  >
    <div class="sa__body">
      <p v-if="blocked" class="sa__alert sa__alert--block">
        {{ t('models.saveAudit.blockingIntro', { count: blockingIssues.length }) }}
      </p>
      <p v-else class="sa__hint">
        {{ t('models.saveAudit.warnIntro', { count: warningIssues.length }) }}
      </p>

      <div class="sa__list">
        <div v-for="issue in blockingIssues" :key="issue.id" class="sa__item">
          <div class="sa__item-head">
            <span class="sa__tag">{{ kindLabel(issue) }}</span>
            <span class="sa__message">{{ t(issue.messageKey, issue.params ?? {}) }}</span>
          </div>

          <div v-if="issue.kind === 'duplicateNodeName'" class="sa__renames">
            <div v-for="nodeId in issue.entityIds" :key="nodeId" class="sa__rename-row">
              <input
                class="sa__rename-input"
                :value="renameValue(nodeId)"
                @input="onRenameInput(nodeId, $event)"
              />
              <button
                type="button"
                class="btn sa__btn"
                :disabled="!renameValue(nodeId).trim()"
                @click="applyRename(nodeId)"
              >
                {{ t('models.saveAudit.fix.renameNode') }}
              </button>
            </div>
          </div>

          <div class="sa__actions">
            <button
              v-if="focusNodeId(issue)"
              type="button"
              class="btn sa__btn"
              @click="emit('findInTree', focusNodeId(issue)!)"
            >
              {{ t('models.saveAudit.findInTree') }}
            </button>
            <button
              v-if="issue.fix"
              type="button"
              class="btn btn--primary sa__btn"
              @click="apply(issue.fix)"
            >
              {{ t(`models.saveAudit.fix.${issue.fix.kind}`) }}
            </button>
          </div>
        </div>

        <div v-for="issue in warningIssues" :key="issue.id" class="sa__item sa__item--warn">
          <div class="sa__item-head">
            <span class="sa__tag sa__tag--warn">{{ kindLabel(issue) }}</span>
            <span class="sa__message">{{ t(issue.messageKey, issue.params ?? {}) }}</span>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <button type="button" class="btn" @click="emit('close')">
        {{ t('models.saveAudit.cancel') }}
      </button>
      <button type="button" class="btn btn--primary" :disabled="blocked" @click="emit('save')">
        {{ t('models.saveAudit.save') }}
      </button>
    </template>
  </BaseModal>
</template>

<style scoped>
.sa__body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.sa__alert {
  margin: 0;
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 14px;
}

.sa__alert--block {
  background: rgba(220, 53, 69, 0.08);
  color: var(--danger);
  border: 1px solid rgba(220, 53, 69, 0.2);
}

.sa__hint {
  margin: 0;
  color: var(--text-muted);
  font-size: 14px;
}

.sa__list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.sa__item {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sa__item--warn {
  border-color: rgba(230, 126, 34, 0.35);
}

.sa__item-head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.sa__tag {
  padding: 2px 8px;
  border-radius: 6px;
  background: rgba(220, 53, 69, 0.1);
  color: var(--danger);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.sa__tag--warn {
  background: rgba(230, 126, 34, 0.12);
  color: var(--warning);
}

.sa__message {
  font-size: 14px;
  color: var(--base-text);
}

.sa__renames {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sa__rename-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.sa__rename-input {
  flex: 1;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 14px;
}

.sa__actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
}

.sa__btn {
  white-space: nowrap;
}
</style>
