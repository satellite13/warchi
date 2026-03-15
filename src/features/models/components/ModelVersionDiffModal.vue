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

/** Убирает скрытый корень "Root/" из пути для отображения. */
function pathForDisplay(path: string): string {
  return path.startsWith("Root/") ? path.slice(5) : path
}

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
    <div class="mdm">
      <!-- Version selector -->
      <div class="mdm__selector">
        <span class="mdm__selector-label">{{ t('models.compareSelectVersion') }}</span>
        <select
          ref="versionSelectEl"
          class="mdm__select"
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
        <p v-if="!relatedVersionsLoading && otherVersions().length === 0" class="mdm__msg mdm__msg--muted">
          {{ t('models.compareNoVersions') }}
        </p>
        <p v-if="compareTargetError" class="mdm__msg mdm__msg--error">
          {{ compareTargetError }}
        </p>
        <p v-if="compareTargetLoading" class="mdm__msg mdm__msg--muted">
          {{ t('models.compareLoadingTarget') }}
        </p>
      </div>

      <!-- Diff content -->
      <template v-if="diff">
        <div class="mdm__tabs">
          <button
            type="button"
            class="mdm__tab"
            :class="{ 'mdm__tab--active': activeTab === 'nodes' }"
            @click="activeTab = 'nodes'"
          >
            <span class="mdm__tab-text">{{ t('models.compareDiffNodes') }}</span>
            <span class="mdm__tab-count" :class="{ 'mdm__tab-count--zero': diff.nodes.length === 0 }">
              {{ diff.nodes.length }}
            </span>
          </button>
          <button
            type="button"
            class="mdm__tab"
            :class="{ 'mdm__tab--active': activeTab === 'links' }"
            @click="activeTab = 'links'"
          >
            <span class="mdm__tab-text">{{ t('models.compareDiffLinks') }}</span>
            <span class="mdm__tab-count" :class="{ 'mdm__tab-count--zero': diff.links.length === 0 }">
              {{ diff.links.length }}
            </span>
          </button>
          <button
            type="button"
            class="mdm__tab"
            :class="{ 'mdm__tab--active': activeTab === 'diagrams' }"
            @click="activeTab = 'diagrams'"
          >
            <span class="mdm__tab-text">{{ t('models.compareDiffDiagrams') }}</span>
            <span class="mdm__tab-count" :class="{ 'mdm__tab-count--zero': diff.diagrams.length === 0 }">
              {{ diff.diagrams.length }}
            </span>
          </button>
        </div>

        <div class="mdm__list">
          <template v-if="activeTab === 'nodes'">
            <div
              v-for="(item, i) in diff.nodes as NodeDiffItem[]"
              :key="`n-${i}`"
              class="mdm__row"
              :class="`mdm__row--${item.kind}`"
            >
              <span class="mdm__badge" :class="`mdm__badge--${item.kind}`">
                {{ item.kind === 'added' ? t('models.compareDiffAdded') : item.kind === 'removed' ? t('models.compareDiffRemoved') : t('models.compareDiffModified') }}
              </span>
              <span class="mdm__path">{{ pathForDisplay(item.path) }}</span>
            </div>
            <div v-if="diff.nodes.length === 0" class="mdm__empty">
              {{ t('models.compareNoChanges') }}
            </div>
          </template>
          <template v-else-if="activeTab === 'links'">
            <div
              v-for="(item, i) in diff.links as LinkDiffItem[]"
              :key="`l-${i}`"
              class="mdm__row"
              :class="`mdm__row--${item.kind}`"
            >
              <span class="mdm__badge" :class="`mdm__badge--${item.kind}`">
                {{ item.kind === 'added' ? t('models.compareDiffAdded') : item.kind === 'removed' ? t('models.compareDiffRemoved') : t('models.compareDiffModified') }}
              </span>
              <span class="mdm__path">{{ pathForDisplay(item.sourcePath) }} → {{ pathForDisplay(item.targetPath) }}</span>
            </div>
            <div v-if="diff.links.length === 0" class="mdm__empty">
              {{ t('models.compareNoChanges') }}
            </div>
          </template>
          <template v-else>
            <div
              v-for="(item, i) in diff.diagrams as DiagramDiffItem[]"
              :key="`d-${i}`"
              class="mdm__row"
              :class="`mdm__row--${item.kind}`"
            >
              <span class="mdm__badge" :class="`mdm__badge--${item.kind}`">
                {{ item.kind === 'added' ? t('models.compareDiffAdded') : item.kind === 'removed' ? t('models.compareDiffRemoved') : t('models.compareDiffModified') }}
              </span>
              <span class="mdm__path">{{ item.name }}</span>
            </div>
            <div v-if="diff.diagrams.length === 0" class="mdm__empty">
              {{ t('models.compareNoChanges') }}
            </div>
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
.mdm {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 200px;
}

/* ── Version selector ── */
.mdm__selector {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mdm__selector-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-subtle);
}

.mdm__select {
  max-width: 360px;
  height: 36px;
  padding: 0 32px 0 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-muted);
  color: var(--base-text);
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: border-color 0.15s ease;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%239a9a9a' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
}
.mdm__select:hover {
  border-color: var(--border-strong);
}
.mdm__select:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 2px var(--primary-soft);
}

.mdm__msg {
  margin: 0;
  font-size: 12px;
}
.mdm__msg--muted {
  color: var(--text-muted);
}
.mdm__msg--error {
  color: var(--danger);
}

/* ── Tabs ── */
.mdm__tabs {
  display: flex;
  gap: 4px;
  background: var(--surface-muted);
  padding: 4px;
  border-radius: 10px;
}

.mdm__tab {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  justify-content: center;
  padding: 7px 12px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  transition: all 0.15s ease;
}
.mdm__tab:hover:not(.mdm__tab--active) {
  background: var(--surface);
  color: var(--base-text);
}
.mdm__tab--active {
  background: var(--surface);
  color: var(--base-text);
  box-shadow: var(--shadow-sm);
}

.mdm__tab-text {
  white-space: nowrap;
}

.mdm__tab-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  font-size: 10px;
  font-weight: 600;
  background: var(--primary-soft);
  color: var(--primary);
}
.mdm__tab-count--zero {
  background: var(--surface-strong);
  color: var(--text-subtle);
}

/* ── Diff list ── */
.mdm__list {
  max-height: 360px;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: 10px;
}

.mdm__row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
  transition: background 0.1s ease;
}
.mdm__row:last-child {
  border-bottom: none;
}
.mdm__row:hover {
  background: var(--surface-muted);
}

.mdm__row--added {
  border-left: 3px solid var(--success);
}
.mdm__row--removed {
  border-left: 3px solid var(--danger);
}
.mdm__row--modified {
  border-left: 3px solid var(--warning);
}

.mdm__badge {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  min-width: 72px;
  padding: 2px 8px;
  border-radius: 5px;
  text-align: center;
}
.mdm__badge--added {
  color: var(--success);
  background: var(--success-soft);
}
.mdm__badge--removed {
  color: var(--danger);
  background: var(--danger-soft);
}
.mdm__badge--modified {
  color: var(--warning);
  background: var(--warning-soft);
}

.mdm__path {
  font-size: 13px;
  font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
  word-break: break-all;
  color: var(--base-text);
}

.mdm__empty {
  padding: 24px;
  text-align: center;
  color: var(--text-subtle);
  font-size: 13px;
}
</style>
