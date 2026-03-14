<script setup lang="ts">
import { ref, watch } from "vue"
import { useRouter } from "vue-router"
import { useI18n } from "vue-i18n"
import BaseModal from "@/components/modals/BaseModal.vue"
import type { ModelData } from "@/types/entities"
import type {
  DiagramDiffItem,
  LinkDiffItem,
  ModelVersionDiff,
  NodeDiffItem,
} from "@/utils/modelDiff"

const router = useRouter()
const props = defineProps<{
  modelId: string
  modelVersion: string
  relatedVersions: ModelData[]
  relatedVersionsLoading: boolean
  compareTargetId: string | null
  compareTargetLoading: boolean
  compareTargetError: string | null
  diff: ModelVersionDiff | null
}>()

const emit = defineEmits<{
  close: []
  selectVersion: [modelId: string]
}>()

const { t } = useI18n()
const activeTab = ref<"nodes" | "links" | "diagrams">("nodes")

const otherVersions = () =>
  props.relatedVersions.filter((m) => m.id !== props.modelId)

function onSelectVersion(ev: Event) {
  const val = (ev.target as HTMLSelectElement).value
  if (val) emit("selectVersion", val)
}

watch(
  () => props.relatedVersions.length,
  () => {
    if (otherVersions().length === 1 && !props.compareTargetId) {
      emit("selectVersion", otherVersions()[0]!.id)
    }
  }
)
</script>

<template>
  <BaseModal
    :title="t('models.compareTitle')"
    max-width="720px"
    @close="emit('close')"
  >
    <div class="model-diff-modal">
      <div class="model-diff-modal__versions">
        <label class="model-diff-modal__label">
          {{ t('models.compareSelectVersion') }}
        </label>
        <select
          ref="versionSelectEl"
          class="model-diff-modal__select"
          :value="compareTargetId ?? ''"
          :disabled="relatedVersionsLoading || compareTargetLoading"
          @change="onSelectVersion"
        >
          <option value="">
            {{ relatedVersionsLoading ? t('models.compareLoadingVersions') : t('models.compareSelectVersion') }}
          </option>
          <option
            v-for="v in otherVersions()"
            :key="v.id"
            :value="v.id"
          >
            {{ v.name }} {{ v.version }}
          </option>
        </select>
        <p v-if="!relatedVersionsLoading && otherVersions().length === 0" class="model-diff-modal__hint">
          {{ t('models.compareNoVersions') }}
        </p>
        <p v-if="compareTargetError" class="model-diff-modal__error">
          {{ compareTargetError }}
        </p>
        <p v-if="compareTargetLoading" class="model-diff-modal__hint">
          {{ t('models.compareLoadingTarget') }}
        </p>
      </div>

      <template v-if="diff">
        <div class="model-diff-modal__tabs">
          <button
            type="button"
            class="model-diff-modal__tab"
            :class="{ 'model-diff-modal__tab--active': activeTab === 'nodes' }"
            @click="activeTab = 'nodes'"
          >
            {{ t('models.compareDiffNodes') }} ({{ diff.nodes.length }})
          </button>
          <button
            type="button"
            class="model-diff-modal__tab"
            :class="{ 'model-diff-modal__tab--active': activeTab === 'links' }"
            @click="activeTab = 'links'"
          >
            {{ t('models.compareDiffLinks') }} ({{ diff.links.length }})
          </button>
          <button
            type="button"
            class="model-diff-modal__tab"
            :class="{ 'model-diff-modal__tab--active': activeTab === 'diagrams' }"
            @click="activeTab = 'diagrams'"
          >
            {{ t('models.compareDiffDiagrams') }} ({{ diff.diagrams.length }})
          </button>
        </div>

        <div class="model-diff-modal__list">
          <template v-if="activeTab === 'nodes'">
            <div
              v-for="(item, i) in diff.nodes as NodeDiffItem[]"
              :key="`n-${i}`"
              class="model-diff-modal__row"
              :class="`model-diff-modal__row--${item.kind}`"
            >
              <span class="model-diff-modal__badge">{{ item.kind === 'added' ? t('models.compareDiffAdded') : item.kind === 'removed' ? t('models.compareDiffRemoved') : t('models.compareDiffModified') }}</span>
              <span class="model-diff-modal__path">{{ item.path }}</span>
            </div>
            <p v-if="diff.nodes.length === 0" class="model-diff-modal__empty">
              {{ t('models.compareNoChanges') }}
            </p>
          </template>
          <template v-else-if="activeTab === 'links'">
            <div
              v-for="(item, i) in diff.links as LinkDiffItem[]"
              :key="`l-${i}`"
              class="model-diff-modal__row"
              :class="`model-diff-modal__row--${item.kind}`"
            >
              <span class="model-diff-modal__badge">{{ item.kind === 'added' ? t('models.compareDiffAdded') : item.kind === 'removed' ? t('models.compareDiffRemoved') : t('models.compareDiffModified') }}</span>
              <span class="model-diff-modal__path">{{ item.sourcePath }} → {{ item.targetPath }}</span>
            </div>
            <p v-if="diff.links.length === 0" class="model-diff-modal__empty">
              {{ t('models.compareNoChanges') }}
            </p>
          </template>
          <template v-else>
            <div
              v-for="(item, i) in diff.diagrams as DiagramDiffItem[]"
              :key="`d-${i}`"
              class="model-diff-modal__row"
              :class="`model-diff-modal__row--${item.kind}`"
            >
              <span class="model-diff-modal__badge">{{ item.kind === 'added' ? t('models.compareDiffAdded') : item.kind === 'removed' ? t('models.compareDiffRemoved') : t('models.compareDiffModified') }}</span>
              <span class="model-diff-modal__path">{{ item.name }}</span>
            </div>
            <p v-if="diff.diagrams.length === 0" class="model-diff-modal__empty">
              {{ t('models.compareNoChanges') }}
            </p>
          </template>
        </div>
      </template>
    </div>

    <template #footer>
      <button
        type="button"
        class="btn btn--secondary"
        @click="
          emit('close');
          router.push({ name: 'model-visual-compare', params: { id: modelId } });
        "
      >
        {{ t('models.compareVisualOpen') }}
      </button>
      <button type="button" class="btn btn--secondary" @click="emit('close')">
        {{ t('models.compareClose') }}
      </button>
    </template>
  </BaseModal>
</template>

<style scoped>
.model-diff-modal {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-height: 200px;
}
.model-diff-modal__versions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.model-diff-modal__label {
  font-weight: 500;
  color: var(--base-text);
}
.model-diff-modal__select {
  max-width: 320px;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--base-text);
}
.model-diff-modal__hint,
.model-diff-modal__error {
  margin: 0;
  font-size: 0.875rem;
}
.model-diff-modal__error {
  color: var(--danger);
}
.model-diff-modal__hint {
  color: var(--text-muted);
}
.model-diff-modal__tabs {
  display: flex;
  gap: 0.25rem;
}
.model-diff-modal__tab {
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-muted);
  color: var(--text-muted);
  cursor: pointer;
  font-size: 0.875rem;
}
.model-diff-modal__tab--active {
  background: var(--surface);
  color: var(--primary);
  border-color: var(--primary);
}
.model-diff-modal__list {
  max-height: 360px;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.5rem;
}
.model-diff-modal__row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.35rem 0.5rem;
  border-radius: 4px;
  font-size: 0.875rem;
}
.model-diff-modal__row--added {
  background: rgba(30, 163, 85, 0.1);
}
.model-diff-modal__row--removed {
  background: rgba(220, 53, 69, 0.1);
}
.model-diff-modal__row--modified {
  background: rgba(230, 126, 34, 0.1);
}
.model-diff-modal__badge {
  flex-shrink: 0;
  font-weight: 500;
  min-width: 5rem;
}
.model-diff-modal__row--added .model-diff-modal__badge {
  color: var(--success);
}
.model-diff-modal__row--removed .model-diff-modal__badge {
  color: var(--danger);
}
.model-diff-modal__row--modified .model-diff-modal__badge {
  color: var(--warning);
}
.model-diff-modal__path {
  word-break: break-all;
  color: var(--base-text);
}
.model-diff-modal__empty {
  margin: 0;
  padding: 0.5rem;
  color: var(--text-muted);
  font-size: 0.875rem;
}
</style>
