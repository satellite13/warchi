<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import BaseModal from '@/components/modals/BaseModal.vue'
import type { OefImportReport } from '../../composables/useOefImport'

defineProps<{
  report: OefImportReport
  warningLabel: (code: string) => string
}>()

const emit = defineEmits<{
  close: []
}>()

const { t } = useI18n()
</script>

<template>
  <BaseModal
    :title="t('models.oefImportReportTitle')"
    max-width="520px"
    @close="emit('close')"
  >
    <p class="leave-text">{{ t('models.oefImportReportSummary') }}</p>
    <ul class="model-import-report">
      <li>{{ t('models.oefImportStatNodes', { count: report.nodes }) }}</li>
      <li>{{ t('models.oefImportStatLinks', { count: report.links }) }}</li>
      <li>{{ t('models.oefImportStatDiagrams', { count: report.diagrams }) }}</li>
      <li v-if="report.nodesReused > 0">
        {{ t('models.oefImportReportReusedNodes', { count: report.nodesReused }) }}
      </li>
      <li v-if="report.nodesUpdated > 0">
        {{ t('models.oefImportReportUpdatedNodes', { count: report.nodesUpdated }) }}
      </li>
      <li v-if="report.linksReused > 0">
        {{ t('models.oefImportReportReusedLinks', { count: report.linksReused }) }}
      </li>
      <li v-if="report.linksUpdated > 0">
        {{ t('models.oefImportReportUpdatedLinks', { count: report.linksUpdated }) }}
      </li>
      <li>
        {{
          t('models.oefImportReportDiagramNodeInstances', {
            count: report.diagramNodeInstances,
          })
        }}
      </li>
      <li>
        {{
          t('models.oefImportReportDiagramEdgeInstances', {
            count: report.diagramConnectionInstances,
          })
        }}
      </li>
    </ul>
    <p v-if="report.warningsCount > 0" class="leave-text leave-text--warning">
      {{ t('models.oefImportCompletedWithWarnings', { count: report.warningsCount }) }}
    </p>
    <div v-if="report.warningGroups.length > 0" class="model-import-report__warnings">
      <p class="leave-text">{{ t('models.oefImportReportWarningsByReason') }}</p>
      <ul class="model-import-report model-import-report--warnings model-import-report--scrollable">
        <li v-for="item in report.warningGroups" :key="item.code">
          {{ warningLabel(item.code) }}: {{ item.count }}
        </li>
      </ul>
    </div>
    <div v-if="report.missingRequired.total > 0" class="model-import-report__warnings">
      <p class="leave-text leave-text--warning">
        {{
          t('models.oefImportReportMissingRequiredTitle', {
            count: report.missingRequired.total,
          })
        }}
      </p>
      <ul class="model-import-report model-import-report--warnings">
        <li>
          {{
            t('models.oefImportReportMissingRequiredNodeType', {
              count: report.missingRequired.nodeType,
            })
          }}
        </li>
        <li>
          {{
            t('models.oefImportReportMissingRequiredComponent', {
              count: report.missingRequired.component,
            })
          }}
        </li>
        <li>
          {{
            t('models.oefImportReportMissingRequiredRelation', {
              count: report.missingRequired.relation,
            })
          }}
        </li>
      </ul>
    </div>
    <template #footer>
      <button type="button" class="btn btn--secondary" @click="emit('close')">
        {{ t('common.close') }}
      </button>
    </template>
  </BaseModal>
</template>

<style scoped>
.leave-text {
  margin: 0;
  color: var(--text-muted);
  line-height: 1.5;
}

.leave-text--warning {
  color: var(--warning);
}

.model-import-report {
  margin: 8px 0 0;
  padding-left: 18px;
  color: var(--text-muted);
  line-height: 1.5;
}

.model-import-report__warnings {
  margin-top: 10px;
}

.model-import-report--warnings {
  margin-top: 6px;
}

.model-import-report--scrollable {
  max-height: min(220px, 40vh);
  overflow-y: auto;
}
</style>
