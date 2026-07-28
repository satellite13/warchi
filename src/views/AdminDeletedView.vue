<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { apiDelete, apiGet } from '@/composables/useApi'
import AdminAlert from '@/components/admin/AdminAlert.vue'
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue'
import AdminTableShell from '@/components/admin/AdminTableShell.vue'
import EntityDeleteModal from '@/components/modals/EntityDeleteModal.vue'
import type { NodeShapeResponse, OwnedTypeResponse } from '@/types/api'
import type { ModelData, NotationData, PaginatedResponse } from '@/types/entities'
import { formatDate } from '@/utils/formatDate'
import { paginatedContent } from '@/utils/paginatedResponse'

type TrashKind = 'model' | 'notation' | 'nodeType' | 'linkType' | 'shape'

type PendingDelete = {
  kind: TrashKind
  id: string
  name: string
  version?: string
}

type NamedTrashItem = {
  id: string
  name: string
  version?: string
  updatedAt?: string | null
}

const { t, locale } = useI18n()

const deletedModels = ref<ModelData[]>([])
const deletedNotations = ref<NotationData[]>([])
const deletedNodeTypes = ref<OwnedTypeResponse[]>([])
const deletedLinkTypes = ref<OwnedTypeResponse[]>([])
const deletedShapes = ref<NodeShapeResponse[]>([])
const loadingModels = ref(false)
const loadingNotations = ref(false)
const loadingNodeTypes = ref(false)
const loadingLinkTypes = ref(false)
const loadingShapes = ref(false)
const deletingId = ref<string | null>(null)
const errorMessage = ref<string | null>(null)
const successMessage = ref<string | null>(null)
const pendingDelete = ref<PendingDelete | null>(null)
const deleteError = ref<string | null>(null)

const PAGE_SIZE = 50

const totalDeleted = computed(
  () =>
    deletedModels.value.length +
    deletedNotations.value.length +
    deletedNodeTypes.value.length +
    deletedLinkTypes.value.length +
    deletedShapes.value.length,
)

const entityLabelByKind: Record<TrashKind, string> = {
  model: 'models.entityLabelAccusative',
  notation: 'notations.entityLabelAccusative',
  nodeType: 'adminDeleted.entityNodeType',
  linkType: 'adminDeleted.entityLinkType',
  shape: 'adminDeleted.entityShape',
}

const permanentPathByKind: Record<TrashKind, (id: string) => string> = {
  model: id => `/models/${id}/permanent`,
  notation: id => `/notations/${id}/permanent`,
  nodeType: id => `/node-types/${id}/permanent`,
  linkType: id => `/link-types/${id}/permanent`,
  shape: id => `/node-shapes/${id}/permanent`,
}

const pendingEntityLabel = computed(() => {
  if (!pendingDelete.value) return ''
  return t(entityLabelByKind[pendingDelete.value.kind])
})

const pendingEntityName = computed(() => {
  if (!pendingDelete.value) return ''
  const { name, version } = pendingDelete.value
  return version ? `${name} v${version}` : name
})

async function loadDeletedList<T>(
  path: string,
  loading: { value: boolean },
  target: { value: T[] },
): Promise<void> {
  loading.value = true
  const result = await apiGet<PaginatedResponse<T>>(
    `${path}?page=0&size=${PAGE_SIZE}&sort=updatedAt,desc`,
  )
  loading.value = false
  target.value = result.success ? paginatedContent(result.data) : []
}

const loadAll = (): void => {
  errorMessage.value = null
  successMessage.value = null
  void loadDeletedList('/models/deleted', loadingModels, deletedModels)
  void loadDeletedList('/notations/deleted', loadingNotations, deletedNotations)
  void loadDeletedList('/node-types/deleted', loadingNodeTypes, deletedNodeTypes)
  void loadDeletedList('/link-types/deleted', loadingLinkTypes, deletedLinkTypes)
  void loadDeletedList('/node-shapes/deleted', loadingShapes, deletedShapes)
}

const openDelete = (kind: TrashKind, item: NamedTrashItem): void => {
  errorMessage.value = null
  successMessage.value = null
  deleteError.value = null
  pendingDelete.value = {
    kind,
    id: item.id,
    name: item.name,
    version: item.version,
  }
}

const closeDeleteModal = (): void => {
  if (deletingId.value) return
  pendingDelete.value = null
  deleteError.value = null
}

const removeFromList = (kind: TrashKind, id: string): void => {
  switch (kind) {
    case 'model':
      deletedModels.value = deletedModels.value.filter(m => m.id !== id)
      break
    case 'notation':
      deletedNotations.value = deletedNotations.value.filter(n => n.id !== id)
      break
    case 'nodeType':
      deletedNodeTypes.value = deletedNodeTypes.value.filter(n => n.id !== id)
      break
    case 'linkType':
      deletedLinkTypes.value = deletedLinkTypes.value.filter(n => n.id !== id)
      break
    case 'shape':
      deletedShapes.value = deletedShapes.value.filter(s => s.id !== id)
      break
  }
}

const confirmPermanentDelete = async (): Promise<void> => {
  const target = pendingDelete.value
  if (!target) return

  deletingId.value = target.id
  deleteError.value = null
  errorMessage.value = null

  const result = await apiDelete<void>(permanentPathByKind[target.kind](target.id))
  deletingId.value = null

  if (result.success) {
    removeFromList(target.kind, target.id)
    pendingDelete.value = null
    successMessage.value = t('adminDeleted.deletedSuccess')
    return
  }

  if (result.error.status === 409) {
    if (target.kind === 'notation') {
      deleteError.value = t('adminDeleted.deleteConflictActiveModels')
    } else if (target.kind === 'nodeType') {
      deleteError.value = t('adminDeleted.deleteConflictNodeType')
    } else if (target.kind === 'linkType') {
      deleteError.value = t('adminDeleted.deleteConflictLinkType')
    } else {
      deleteError.value = result.error.message
    }
  } else {
    deleteError.value = result.error.message
  }
}

onMounted(() => {
  loadAll()
})
</script>

<template>
  <div class="ad">
    <AdminPageHeader :title="t('adminDeleted.title')" :subtitle="t('adminDeleted.subtitle')">
      <template v-if="totalDeleted > 0" #badge>
        <div class="ad__counter">{{ totalDeleted }}</div>
      </template>
    </AdminPageHeader>

    <AdminAlert v-if="errorMessage" type="error" :message="errorMessage" />
    <AdminAlert v-if="successMessage" type="success" :message="successMessage" />

    <section class="ad-section">
      <div class="ad-section__head">
        <h2 class="ad-section__title">{{ t('adminDeleted.deletedModels') }}</h2>
        <span v-if="deletedModels.length > 0" class="ad-section__count">
          {{ deletedModels.length }}
        </span>
      </div>
      <AdminTableShell
        :loading="loadingModels"
        :empty="deletedModels.length === 0"
        :loading-text="t('adminDeleted.loading')"
        :empty-text="t('adminDeleted.emptyModels')"
      >
        <template #head>
          <tr>
            <th>{{ t('adminDeleted.name') }}</th>
            <th>{{ t('adminDeleted.version') }}</th>
            <th>{{ t('adminDeleted.updated') }}</th>
            <th></th>
          </tr>
        </template>
        <TransitionGroup tag="tbody" name="ad-row">
          <tr
            v-for="m in deletedModels"
            :key="m.id"
            class="ad-table__row"
            :class="{ 'ad-table__row--busy': deletingId === m.id }"
          >
            <td class="ad-table__name">{{ m.name }}</td>
            <td>
              <span class="ad-version">{{ m.version }}</span>
            </td>
            <td class="ad-table__date">{{ formatDate(m.updatedAt, locale, false) }}</td>
            <td class="ad-table__action">
              <button
                type="button"
                class="ad-btn-delete"
                :disabled="deletingId === m.id"
                @click="openDelete('model', m)"
              >
                {{ t('adminDeleted.deletePermanently') }}
              </button>
            </td>
          </tr>
        </TransitionGroup>
      </AdminTableShell>
    </section>

    <section class="ad-section">
      <div class="ad-section__head">
        <h2 class="ad-section__title">{{ t('adminDeleted.deletedNotations') }}</h2>
        <span v-if="deletedNotations.length > 0" class="ad-section__count">
          {{ deletedNotations.length }}
        </span>
      </div>
      <AdminTableShell
        :loading="loadingNotations"
        :empty="deletedNotations.length === 0"
        :loading-text="t('adminDeleted.loading')"
        :empty-text="t('adminDeleted.emptyNotations')"
      >
        <template #head>
          <tr>
            <th>{{ t('adminDeleted.name') }}</th>
            <th>{{ t('adminDeleted.version') }}</th>
            <th>{{ t('adminDeleted.updated') }}</th>
            <th></th>
          </tr>
        </template>
        <TransitionGroup tag="tbody" name="ad-row">
          <tr
            v-for="n in deletedNotations"
            :key="n.id"
            class="ad-table__row"
            :class="{ 'ad-table__row--busy': deletingId === n.id }"
          >
            <td class="ad-table__name">{{ n.name }}</td>
            <td>
              <span class="ad-version">{{ n.version }}</span>
            </td>
            <td class="ad-table__date">{{ formatDate(n.updatedAt, locale, false) }}</td>
            <td class="ad-table__action">
              <button
                type="button"
                class="ad-btn-delete"
                :disabled="deletingId === n.id"
                @click="openDelete('notation', n)"
              >
                {{ t('adminDeleted.deletePermanently') }}
              </button>
            </td>
          </tr>
        </TransitionGroup>
      </AdminTableShell>
    </section>

    <section class="ad-section">
      <div class="ad-section__head">
        <h2 class="ad-section__title">{{ t('adminDeleted.deletedNodeTypes') }}</h2>
        <span v-if="deletedNodeTypes.length > 0" class="ad-section__count">
          {{ deletedNodeTypes.length }}
        </span>
      </div>
      <AdminTableShell
        :loading="loadingNodeTypes"
        :empty="deletedNodeTypes.length === 0"
        :loading-text="t('adminDeleted.loading')"
        :empty-text="t('adminDeleted.emptyNodeTypes')"
      >
        <template #head>
          <tr>
            <th>{{ t('adminDeleted.name') }}</th>
            <th>{{ t('adminDeleted.updated') }}</th>
            <th></th>
          </tr>
        </template>
        <TransitionGroup tag="tbody" name="ad-row">
          <tr
            v-for="item in deletedNodeTypes"
            :key="item.id"
            class="ad-table__row"
            :class="{ 'ad-table__row--busy': deletingId === item.id }"
          >
            <td class="ad-table__name">{{ item.name }}</td>
            <td class="ad-table__date">{{ formatDate(item.updatedAt, locale, false) }}</td>
            <td class="ad-table__action">
              <button
                type="button"
                class="ad-btn-delete"
                :disabled="deletingId === item.id"
                @click="openDelete('nodeType', item)"
              >
                {{ t('adminDeleted.deletePermanently') }}
              </button>
            </td>
          </tr>
        </TransitionGroup>
      </AdminTableShell>
    </section>

    <section class="ad-section">
      <div class="ad-section__head">
        <h2 class="ad-section__title">{{ t('adminDeleted.deletedLinkTypes') }}</h2>
        <span v-if="deletedLinkTypes.length > 0" class="ad-section__count">
          {{ deletedLinkTypes.length }}
        </span>
      </div>
      <AdminTableShell
        :loading="loadingLinkTypes"
        :empty="deletedLinkTypes.length === 0"
        :loading-text="t('adminDeleted.loading')"
        :empty-text="t('adminDeleted.emptyLinkTypes')"
      >
        <template #head>
          <tr>
            <th>{{ t('adminDeleted.name') }}</th>
            <th>{{ t('adminDeleted.updated') }}</th>
            <th></th>
          </tr>
        </template>
        <TransitionGroup tag="tbody" name="ad-row">
          <tr
            v-for="item in deletedLinkTypes"
            :key="item.id"
            class="ad-table__row"
            :class="{ 'ad-table__row--busy': deletingId === item.id }"
          >
            <td class="ad-table__name">{{ item.name }}</td>
            <td class="ad-table__date">{{ formatDate(item.updatedAt, locale, false) }}</td>
            <td class="ad-table__action">
              <button
                type="button"
                class="ad-btn-delete"
                :disabled="deletingId === item.id"
                @click="openDelete('linkType', item)"
              >
                {{ t('adminDeleted.deletePermanently') }}
              </button>
            </td>
          </tr>
        </TransitionGroup>
      </AdminTableShell>
    </section>

    <section class="ad-section">
      <div class="ad-section__head">
        <h2 class="ad-section__title">{{ t('adminDeleted.deletedShapes') }}</h2>
        <span v-if="deletedShapes.length > 0" class="ad-section__count">
          {{ deletedShapes.length }}
        </span>
      </div>
      <AdminTableShell
        :loading="loadingShapes"
        :empty="deletedShapes.length === 0"
        :loading-text="t('adminDeleted.loading')"
        :empty-text="t('adminDeleted.emptyShapes')"
      >
        <template #head>
          <tr>
            <th>{{ t('adminDeleted.name') }}</th>
            <th>{{ t('adminDeleted.updated') }}</th>
            <th></th>
          </tr>
        </template>
        <TransitionGroup tag="tbody" name="ad-row">
          <tr
            v-for="item in deletedShapes"
            :key="item.id"
            class="ad-table__row"
            :class="{ 'ad-table__row--busy': deletingId === item.id }"
          >
            <td class="ad-table__name">{{ item.name }}</td>
            <td class="ad-table__date">{{ formatDate(item.updatedAt, locale, false) }}</td>
            <td class="ad-table__action">
              <button
                type="button"
                class="ad-btn-delete"
                :disabled="deletingId === item.id"
                @click="openDelete('shape', item)"
              >
                {{ t('adminDeleted.deletePermanently') }}
              </button>
            </td>
          </tr>
        </TransitionGroup>
      </AdminTableShell>
    </section>

    <EntityDeleteModal
      v-if="pendingDelete"
      :title="t('adminDeleted.deletePermanently')"
      :entity-label="pendingEntityLabel"
      :entity-name="pendingEntityName"
      :is-deleting="deletingId === pendingDelete.id"
      :error="deleteError"
      :confirm-label="t('adminDeleted.deletePermanently')"
      @close="closeDeleteModal"
      @confirm="confirmPermanentDelete"
    />
  </div>
</template>

<style scoped>
.ad {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.ad__counter {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 28px;
  padding: 0 10px;
  border-radius: 14px;
  background: var(--danger-soft);
  color: var(--danger);
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.ad-section__head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.ad-section__title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--base-text);
  letter-spacing: -0.01em;
}

.ad-section__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 7px;
  border-radius: 11px;
  background: var(--surface-strong);
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.ad-table__row--busy {
  opacity: 0.45;
  pointer-events: none;
}

.ad-table__name {
  font-size: 13px;
  font-weight: 500;
  color: var(--base-text);
}

.ad-table__date {
  font-size: 12px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.ad-table__action {
  text-align: right;
  white-space: nowrap;
}

.ad-version {
  display: inline-block;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--text-muted);
  background: var(--surface-strong);
  border-radius: 5px;
  letter-spacing: 0.02em;
}

.ad-btn-delete {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  color: var(--danger);
  background: transparent;
  border: 1px solid color-mix(in srgb, var(--danger) 30%, transparent);
  border-radius: 7px;
  cursor: pointer;
  transition:
    background 0.15s,
    border-color 0.15s;
}

.ad-btn-delete:hover:not(:disabled) {
  background: var(--danger-soft);
  border-color: color-mix(in srgb, var(--danger) 45%, transparent);
}

.ad-btn-delete:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ad-row-enter-active {
  transition: all 0.25s ease;
}

.ad-row-leave-active {
  transition: all 0.2s ease;
}

.ad-row-enter-from {
  opacity: 0;
  transform: translateY(-4px);
}

.ad-row-leave-to {
  opacity: 0;
}
</style>
