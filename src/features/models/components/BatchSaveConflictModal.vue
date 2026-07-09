<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import BaseModal from '@/components/modals/BaseModal.vue'
import type { ConflictFieldRow } from '../utils/batchSaveConflictDisplay'

export type BatchSaveConflictModalRow = {
  key: string
  kindLabel: string
  primary: string
  context: string | null
  detail: string | null
  compareRows: ConflictFieldRow[]
  compareServerLoading: boolean
  compareServerError: string | null
  compareOnlyTimestampDiff: boolean
  compareTimestampOnlySinceDiagramOpen: boolean
}

export type BatchSaveConflictCrossLinkWarningRow = {
  key: string
  diagramNames: string
  edgeSummary: string
}

export type BatchSaveConflictCrossLinkWarnings = {
  loading: boolean
  error: string | null
  items: BatchSaveConflictCrossLinkWarningRow[]
}

defineProps<{
  conflictCount: number
  rows: BatchSaveConflictModalRow[]
  crossLinkWarnings: BatchSaveConflictCrossLinkWarnings
}>()

const emit = defineEmits<{
  close: []
  reload: []
  overwrite: []
  dismiss: []
}>()

const { t } = useI18n()
</script>

<template>
  <BaseModal
    :title="t('models.batchSaveConflictTitle')"
    max-width="min(96vw, 780px)"
    @close="emit('close')"
  >
    <div class="bsc__body">
      <p class="bsc__intro">
        {{ t('models.batchSaveConflictIntro', { count: conflictCount }) }}
      </p>

      <p v-if="crossLinkWarnings.loading" class="bsc__hint">
        {{ t('models.batchSaveConflictCrossDeletedLinksLoading') }}
      </p>
      <p v-else-if="crossLinkWarnings.error" class="bsc__alert bsc__alert--error">
        {{ crossLinkWarnings.error }}
      </p>
      <div v-else-if="crossLinkWarnings.items.length > 0" class="bsc__alert bsc__alert--warn">
        <strong>{{ t('models.batchSaveConflictCrossDeletedLinksTitle') }}</strong>
        <ul class="bsc__cross-list">
          <li v-for="cw in crossLinkWarnings.items" :key="cw.key">
            <span class="bsc__cross-diag">{{ cw.diagramNames }}</span>
            {{ cw.edgeSummary }}
          </li>
        </ul>
      </div>

      <div class="bsc__list">
        <div v-for="row in rows" :key="row.key" class="bsc__item">
          <div class="bsc__item-head">
            <span class="bsc__tag">{{ row.kindLabel }}</span>
            <span class="bsc__item-name">{{ row.primary }}</span>
          </div>
          <p v-if="row.context" class="bsc__item-context">{{ row.context }}</p>
          <p v-if="row.detail" class="bsc__item-meta">{{ row.detail }}</p>
          <details class="bsc__details">
            <summary>{{ t('models.batchSaveConflictCompareToggle') }}</summary>
            <div class="bsc__details-body">
              <p v-if="row.compareServerError" class="bsc__alert bsc__alert--error">
                {{ t('models.batchSaveConflictCompareError') }}: {{ row.compareServerError }}
              </p>
              <p v-else-if="row.compareServerLoading" class="bsc__hint">
                {{ t('models.batchSaveConflictCompareLoading') }}
              </p>
              <p
                v-else-if="row.compareTimestampOnlySinceDiagramOpen || row.compareOnlyTimestampDiff"
                class="bsc__hint bsc__hint--italic"
              >
                {{
                  row.compareTimestampOnlySinceDiagramOpen
                    ? t('models.batchSaveConflictCompareTimestampSinceDiagramOpen')
                    : t('models.batchSaveConflictCompareTimestampOnly')
                }}
              </p>
              <div v-if="row.compareRows.length > 0" class="bsc__table-wrap">
                <table class="bsc__table">
                  <thead>
                    <tr>
                      <th>{{ t('models.batchSaveConflictFieldColField') }}</th>
                      <th>{{ t('models.batchSaveConflictFieldColLocal') }}</th>
                      <th>{{ t('models.batchSaveConflictFieldColServer') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="fr in row.compareRows"
                      :key="fr.field"
                      :class="{ 'bsc__table--diff': fr.differs }"
                    >
                      <td class="bsc__td-key">{{ fr.fieldLabel ?? fr.field }}</td>
                      <td class="bsc__td-val"><pre>{{ fr.local }}</pre></td>
                      <td class="bsc__td-val"><pre>{{ fr.server }}</pre></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </details>
        </div>
      </div>

      <div class="bsc__actions" role="group" :aria-label="t('models.batchSaveConflictChoicesAria')">
        <button
          type="button"
          class="bsc__action bsc__action--reload"
          @click="emit('reload')"
        >
          <span class="bsc__action-icon">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3.5 10a6.5 6.5 0 0 1 11.25-4.43" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M16.5 10a6.5 6.5 0 0 1-11.25 4.43" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M14 2.5v3.5h-3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 17.5v-3.5h3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </span>
          <span class="bsc__action-content">
            <strong>{{ t('models.batchSaveConflictReload') }}</strong>
            <span>{{ t('models.batchSaveConflictChoiceReloadDesc') }}</span>
          </span>
        </button>
        <button
          type="button"
          class="bsc__action bsc__action--overwrite"
          @click="emit('overwrite')"
        >
          <span class="bsc__action-icon">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M4 10l4 4 8-8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </span>
          <span class="bsc__action-content">
            <strong>{{ t('models.batchSaveConflictOverwrite') }}</strong>
            <span>{{ t('models.batchSaveConflictChoiceOverwriteDesc') }}</span>
          </span>
        </button>
      </div>

      <button type="button" class="bsc__dismiss" @click="emit('dismiss')">
        {{ t('common.cancel') }}
      </button>
    </div>
  </BaseModal>
</template>

<style scoped>
.bsc__body {
  max-height: min(72vh, 740px);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-right: 4px;
}

.bsc__intro {
  margin: 0 0 16px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-muted);
}

.bsc__hint {
  margin: 0 0 12px;
  font-size: 12px;
  color: var(--text-subtle);
}

.bsc__hint--italic {
  font-style: italic;
}

.bsc__alert {
  margin: 0 0 12px;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.45;
}

.bsc__alert strong {
  display: block;
  margin-bottom: 4px;
  font-size: 12px;
}

.bsc__alert--error {
  color: var(--danger);
  background: var(--danger-soft);
}

.bsc__alert--warn {
  border: 1px solid color-mix(in srgb, var(--warning) 40%, var(--border));
  background: color-mix(in srgb, var(--warning) 6%, var(--surface));
  color: var(--base-text);
}

.bsc__cross-list {
  margin: 4px 0 0;
  padding-left: 16px;
  font-size: 12px;
  line-height: 1.5;
}

.bsc__cross-list li {
  margin: 2px 0;
}

.bsc__cross-diag {
  font-weight: 500;
}

.bsc__cross-diag::after {
  content: ' — ';
  color: var(--text-subtle);
}

.bsc__list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0 0 20px;
}

.bsc__item {
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--surface-muted);
  border: 1px solid transparent;
  transition: border-color 0.15s;
}

.bsc__item:hover {
  border-color: var(--border);
}

.bsc__item-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.bsc__tag {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-subtle);
  background: var(--surface-strong);
  padding: 2px 6px;
  border-radius: 4px;
  line-height: 1.4;
}

.bsc__item-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--base-text);
  word-break: break-word;
}

.bsc__item-context {
  margin: 4px 0 0;
  padding-left: 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-muted);
}

.bsc__item-meta {
  margin: 2px 0 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--text-subtle);
}

.bsc__details {
  margin-top: 6px;
}

.bsc__details summary {
  cursor: pointer;
  font-size: 11px;
  font-weight: 500;
  color: var(--primary);
  user-select: none;
  padding: 2px 0;
}

.bsc__details summary:hover {
  text-decoration: underline;
}

.bsc__details-body {
  padding-top: 8px;
}

.bsc__table-wrap {
  max-height: 240px;
  overflow: auto;
  border-radius: 6px;
  border: 1px solid var(--border);
}

.bsc__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.bsc__table th,
.bsc__table td {
  padding: 5px 8px;
  text-align: left;
  vertical-align: top;
  border-bottom: 1px solid var(--border);
}

.bsc__table th {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-subtle);
  background: var(--surface-muted);
  position: sticky;
  top: 0;
  z-index: 1;
}

.bsc__td-key {
  font-family: ui-monospace, monospace;
  font-size: 11px;
  color: var(--text-muted);
  width: 28%;
  word-break: break-word;
}

.bsc__td-val {
  width: 36%;
}

.bsc__td-val pre {
  margin: 0;
  font-family: ui-monospace, monospace;
  font-size: 11px;
  line-height: 1.35;
  white-space: pre-wrap;
  word-break: break-word;
}

.bsc__table--diff {
  background: color-mix(in srgb, var(--warning) 10%, transparent);
}

.bsc__table--diff .bsc__td-key {
  font-weight: 600;
  color: var(--base-text);
}

.bsc__actions {
  display: grid;
  gap: 8px;
  margin-bottom: 12px;
}

@media (min-width: 560px) {
  .bsc__actions {
    grid-template-columns: 1fr 1fr;
  }
}

.bsc__action {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px;
  border-radius: 10px;
  border: 1.5px solid var(--border);
  background: var(--surface);
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
}

.bsc__action:hover {
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}

.bsc__action:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}

.bsc__action--reload:hover {
  border-color: var(--primary);
  background: color-mix(in srgb, var(--primary) 4%, var(--surface));
}

.bsc__action--overwrite:hover {
  border-color: color-mix(in srgb, var(--danger) 50%, var(--border));
  background: color-mix(in srgb, var(--danger) 4%, var(--surface));
}

.bsc__action-icon {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
}

.bsc__action--reload .bsc__action-icon {
  background: var(--primary-soft);
  color: var(--primary);
}

.bsc__action--overwrite .bsc__action-icon {
  background: var(--danger-soft);
  color: var(--danger);
}

.bsc__action-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.bsc__action-content strong {
  font-size: 13px;
  font-weight: 600;
  color: var(--base-text);
}

.bsc__action-content span:last-child {
  font-size: 11px;
  line-height: 1.45;
  color: var(--text-muted);
}

.bsc__dismiss {
  display: block;
  margin: 0 auto;
  padding: 6px 16px;
  font-size: 12px;
  font-family: inherit;
  color: var(--text-subtle);
  background: none;
  border: none;
  cursor: pointer;
  border-radius: 6px;
  transition: color 0.15s, background 0.15s;
}

.bsc__dismiss:hover {
  color: var(--text-muted);
  background: var(--surface-strong);
}
</style>
