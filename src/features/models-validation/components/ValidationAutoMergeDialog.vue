<script setup lang="ts">
import { reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import BaseModal from '@/components/modals/BaseModal.vue'
import type { AutoMergeOptions, AutoMergeResult } from '@/features/models-validation/utils/autoMerge'

const props = defineProps<{
  nodeGroups: number
  linkGroups: number
  initialOptions: AutoMergeOptions
  phase: 'setup' | 'running' | 'done'
  live: { label: string | null; merged: number; skipped: number } | null
  result: AutoMergeResult | null
}>()

const emit = defineEmits<{
  confirm: [options: AutoMergeOptions]
  abort: []
  close: []
}>()

const { t } = useI18n()

const options = reactive<AutoMergeOptions>({ ...props.initialOptions })

function onConfirm(): void {
  emit('confirm', { ...options })
}

function onClose(): void {
  if (props.phase === 'running') return
  emit('close')
}
</script>

<template>
  <BaseModal
    :title="t('models.validationAutoMergeDialogTitle')"
    max-width="560px"
    @close="onClose"
  >
    <div class="validation-auto-merge-dialog">
      <template v-if="phase === 'setup'">
        <section class="validation-auto-merge-dialog__rules">
          <h3 class="validation-auto-merge-dialog__rules-title">
            {{ t('models.validationAutoMergeRulesTitle') }}
          </h3>
          <ul class="validation-auto-merge-dialog__rules-list">
            <li>{{ t('models.validationAutoMergeRuleKeep', { nodes: nodeGroups }) }}</li>
            <li>{{ t('models.validationAutoMergeRuleLinks') }}</li>
            <li>{{ t('models.validationAutoMergeRuleDiagrams') }}</li>
            <li>{{ t('models.validationAutoMergeRuleDecision') }}</li>
            <li>{{ t('models.validationAutoMergeRuleDocuments') }}</li>
          </ul>
        </section>

        <section class="validation-auto-merge-dialog__conditions">
          <h3 class="validation-auto-merge-dialog__rules-title">
            {{ t('models.validationAutoMergeConditionsTitle') }}
          </h3>

          <label class="validation-auto-merge-dialog__check">
            <input v-model="options.includeLinks" type="checkbox" />
            <span>{{ t('models.validationAutoMergeOptIncludeLinks', { links: linkGroups }) }}</span>
          </label>

          <div class="validation-auto-merge-dialog__field">
            <span class="validation-auto-merge-dialog__field-label">
              {{ t('models.validationAutoMergeOptPropsLabel') }}
            </span>
            <select v-model="options.propsPolicy" class="validation-auto-merge-dialog__select">
              <option value="skip">{{ t('models.validationAutoMergeOptPropsSkip') }}</option>
              <option value="keep">{{ t('models.validationAutoMergeOptPropsKeep') }}</option>
              <option value="fillEmpty">{{ t('models.validationAutoMergeOptPropsFillEmpty') }}</option>
            </select>
          </div>

          <div class="validation-auto-merge-dialog__field">
            <span class="validation-auto-merge-dialog__field-label">
              {{ t('models.validationAutoMergeOptChildrenLabel') }}
            </span>
            <select v-model="options.childrenPolicy" class="validation-auto-merge-dialog__select">
              <option value="skip">{{ t('models.validationAutoMergeOptChildrenSkip') }}</option>
              <option value="reparent">{{ t('models.validationAutoMergeOptChildrenReparent') }}</option>
            </select>
          </div>
        </section>
      </template>

      <template v-else-if="phase === 'running'">
        <section class="validation-auto-merge-dialog__running">
          <p class="validation-auto-merge-dialog__live-label">
            {{ t('models.validationAutoMergeRunning') }}
          </p>
          <p class="validation-auto-merge-dialog__live-label">{{ live?.label }}</p>
          <div class="validation-auto-merge-dialog__live-counters">
            <span>{{ t('models.validationAutoMergeMergedSoFar', { merged: live?.merged ?? 0 }) }}</span>
            <span>{{ t('models.validationAutoMergeSkippedSoFar', { skipped: live?.skipped ?? 0 }) }}</span>
          </div>
          <div class="validation-auto-merge-dialog__bar" />
          <p class="validation-auto-merge-dialog__keep-open">
            {{ t('models.validationAutoMergeKeepOpen') }}
          </p>
        </section>
      </template>

      <template v-else>
        <section class="validation-auto-merge-dialog__done">
          <p class="validation-auto-merge-dialog__done-title">
            {{ t('models.validationAutoMergeDoneTitle', { merged: result?.mergedGroups ?? 0 }) }}
          </p>
          <p
            v-if="(result?.skipped.length ?? 0) > 0"
            class="validation-auto-merge-dialog__done-skips-count"
          >
            {{ t('models.validationAutoMergeDoneWithSkips', {
              merged: result?.mergedGroups ?? 0,
              skipped: result?.skipped.length ?? 0,
            }) }}
          </p>
          <ul v-if="(result?.skipped.length ?? 0) > 0" class="validation-auto-merge-dialog__skips">
            <li v-for="(item, idx) in result?.skipped" :key="idx">
              <span class="validation-auto-merge-dialog__skip-title">{{ item.title }}</span>
              — {{ t(`models.validationAutoMergeSkip.${item.reason}`) }}
              <span v-if="item.message">: {{ item.message }}</span>
            </li>
          </ul>
        </section>
      </template>
    </div>

    <template #footer>
      <div class="validation-auto-merge-dialog__actions">
        <template v-if="phase === 'setup'">
          <button type="button" class="validation-auto-merge-dialog__btn" @click="emit('close')">
            {{ t('common.cancel') }}
          </button>
          <button
            type="button"
            class="validation-auto-merge-dialog__btn validation-auto-merge-dialog__btn--primary"
            @click="onConfirm"
          >
            {{ t('models.validationAutoMergeAction') }}
          </button>
        </template>
        <template v-else-if="phase === 'running'">
          <button
            type="button"
            class="validation-auto-merge-dialog__btn validation-auto-merge-dialog__btn--danger"
            @click="emit('abort')"
          >
            {{ t('models.validationAutoMergeAbort') }}
          </button>
        </template>
        <template v-else>
          <button
            type="button"
            class="validation-auto-merge-dialog__btn validation-auto-merge-dialog__btn--primary"
            @click="emit('close')"
          >
            {{ t('common.close') }}
          </button>
        </template>
      </div>
    </template>
  </BaseModal>
</template>

<style scoped>
.validation-auto-merge-dialog {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.validation-auto-merge-dialog__rules-title {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
}

.validation-auto-merge-dialog__rules-list {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  color: var(--text-muted);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.validation-auto-merge-dialog__conditions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.validation-auto-merge-dialog__check {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  cursor: pointer;
}

.validation-auto-merge-dialog__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.validation-auto-merge-dialog__field-label {
  font-size: 12px;
  color: var(--text-subtle);
}

.validation-auto-merge-dialog__select {
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  font-size: 13px;
}

.validation-auto-merge-dialog__running {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.validation-auto-merge-dialog__live-label {
  margin: 0;
  font-size: 13px;
  color: var(--text-muted);
  min-height: 18px;
}

.validation-auto-merge-dialog__live-counters {
  display: flex;
  gap: 16px;
  font-size: 13px;
}

.validation-auto-merge-dialog__bar {
  height: 6px;
  border-radius: 3px;
  background: var(--surface-muted);
  overflow: hidden;
  position: relative;
}

.validation-auto-merge-dialog__bar::after {
  content: '';
  position: absolute;
  inset: 0;
  width: 40%;
  background: var(--primary);
  border-radius: 3px;
  animation: validation-auto-merge-slide 1.2s ease-in-out infinite;
}

@keyframes validation-auto-merge-slide {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(250%);
  }
}

.validation-auto-merge-dialog__keep-open {
  margin: 0;
  font-size: 12px;
  color: var(--text-subtle);
}

.validation-auto-merge-dialog__done {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.validation-auto-merge-dialog__done-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.validation-auto-merge-dialog__done-skips-count {
  margin: 0;
  font-size: 13px;
  color: var(--text-muted);
}

.validation-auto-merge-dialog__skips {
  margin: 0;
  padding-left: 18px;
  list-style: none;
  font-size: 12px;
  color: var(--text-muted);
  max-height: 220px;
  overflow: auto;
}

.validation-auto-merge-dialog__skip-title {
  color: var(--text-base, inherit);
  font-weight: 500;
}

.validation-auto-merge-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.validation-auto-merge-dialog__btn {
  padding: 7px 16px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: transparent;
  font-size: 13px;
  cursor: pointer;
}

.validation-auto-merge-dialog__btn--primary {
  border-color: var(--primary);
  background: var(--primary);
  color: #fff;
}

.validation-auto-merge-dialog__btn--danger {
  border-color: var(--danger);
  color: var(--danger);
}
</style>
