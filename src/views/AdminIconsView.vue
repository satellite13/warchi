<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { apiDelete, apiGet, apiPost } from '@/composables/useApi'
import { apiUpload } from '@/api/apiClient'
import AppAlert from '@/components/ui/AppAlert.vue'
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue'
import AdminTableShell from '@/components/admin/AdminTableShell.vue'
import ListHeader from '@/components/list/ListHeader.vue'
import BaseModal from '@/components/modals/BaseModal.vue'
import { useLibraryIcons } from '@/composables/useLibraryIcons'
import { svgToDataUrl, type LibraryIconRecord } from '@/utils/libraryIconResolve'

type Bundle = {
  format: string
  version: number
  exportedAt?: string
  icons: { name: string; svg: string }[]
}

const { t } = useI18n()
const { icons, refresh } = useLibraryIcons()
const loading = ref(false)
const errorMessage = ref<string | null>(null)
const successMessage = ref<string | null>(null)
const deletingId = ref<string | null>(null)
const pendingOverwrite = ref<Bundle | null>(null)
const pendingDelete = ref<LibraryIconRecord | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const jsonInput = ref<HTMLInputElement | null>(null)
const searchQuery = ref('')

const filteredIcons = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return icons.value
  return icons.value.filter((icon) => {
    const name = icon.name.toLowerCase()
    return name.includes(query) || name.replace(/_/g, ' ').includes(query)
  })
})

const count = computed(() => filteredIcons.value.length)
const emptyText = computed(() =>
  icons.value.length === 0 ? t('adminIcons.empty') : t('common.nothingFound'),
)

onMounted(() => {
  void load()
})

async function load(): Promise<void> {
  loading.value = true
  errorMessage.value = null
  await refresh()
  loading.value = false
}

function clearMessages(): void {
  errorMessage.value = null
  successMessage.value = null
}

async function uploadSvgs(files: FileList | null): Promise<void> {
  if (!files?.length) return
  clearMessages()
  const body = new FormData()
  for (const file of Array.from(files)) {
    body.append('files', file)
  }
  const result = await apiUpload<LibraryIconRecord[]>('/library-icons/upload', body)
  if (!result.success) {
    errorMessage.value = result.error.message
    return
  }
  successMessage.value = t('adminIcons.uploaded', { count: result.data.length })
  await refresh()
}

function requestRemove(icon: LibraryIconRecord): void {
  pendingDelete.value = icon
}

async function confirmRemove(): Promise<void> {
  const icon = pendingDelete.value
  if (!icon) return
  deletingId.value = icon.id
  const result = await apiDelete<void>(`/library-icons/${icon.id}`)
  deletingId.value = null
  if (!result.success) {
    errorMessage.value = result.error.message
    return
  }
  pendingDelete.value = null
  await refresh()
}

async function exportBundle(): Promise<void> {
  clearMessages()
  const result = await apiGet<Bundle>('/library-icons/bundle')
  if (!result.success) {
    errorMessage.value = result.error.message
    return
  }
  const blob = new Blob([JSON.stringify(result.data, null, 2)], {
    type: 'application/json;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'warchi-icon-bundle.json'
  link.click()
  URL.revokeObjectURL(url)
}

function parseImportFile(text: string): Bundle | null {
  const raw = JSON.parse(text) as {
    format?: string
    version?: number
    icons?: { name?: string; svg?: string }[]
  }
  if (raw.format === 'warchi-icon-bundle') {
    return {
      format: 'warchi-icon-bundle',
      version: 1,
      icons: (raw.icons ?? [])
        .filter((item) => item.name && item.svg)
        .map((item) => ({ name: item.name!, svg: item.svg! })),
    }
  }
  if (raw.format === 'warchi-notation-export') {
    const iconsFromDoc = (raw.icons ?? [])
      .filter((item) => item.name && item.svg)
      .map((item) => ({ name: item.name!, svg: item.svg! }))
    return {
      format: 'warchi-icon-bundle',
      version: 1,
      icons: iconsFromDoc,
    }
  }
  return null
}

async function onJsonSelected(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  clearMessages()
  try {
    const bundle = parseImportFile(await file.text())
    if (!bundle) {
      errorMessage.value = t('adminIcons.invalidFile')
      return
    }
    if (bundle.icons.length === 0) {
      errorMessage.value = t('adminIcons.emptyIcons')
      return
    }
    const existing = new Set(icons.value.map((icon) => icon.name))
    const willOverwrite = bundle.icons.some((icon) => existing.has(icon.name))
    if (willOverwrite) {
      pendingOverwrite.value = bundle
      return
    }
    await importBundle(bundle)
  } catch {
    errorMessage.value = t('adminIcons.invalidFile')
  }
}

async function confirmOverwrite(): Promise<void> {
  if (pendingOverwrite.value) await importBundle(pendingOverwrite.value)
}

async function importBundle(bundle: Bundle): Promise<void> {
  const result = await apiPost<{ created: number; overwritten: number }>(
    '/library-icons/bundle',
    bundle,
  )
  pendingOverwrite.value = null
  if (!result.success) {
    errorMessage.value = result.error.message
    return
  }
  successMessage.value = t('adminIcons.imported', {
    created: result.data.created,
    overwritten: result.data.overwritten,
  })
  await refresh()
}
</script>

<template>
  <div class="admin-icons">
    <AdminPageHeader :title="t('adminIcons.title')" :subtitle="t('adminIcons.subtitle')" />
    <div class="admin-icons__toolbar">
      <div class="admin-icons__actions">
        <button type="button" class="btn btn--secondary btn--xs btn--toolbar" @click="fileInput?.click()">
          <UiIcon name="upload" />
          <span>{{ t('adminIcons.upload') }}</span>
        </button>
        <button type="button" class="btn btn--secondary btn--xs btn--toolbar" @click="jsonInput?.click()">
          <UiIcon name="upload_file" />
          <span>{{ t('adminIcons.importJson') }}</span>
        </button>
        <button type="button" class="btn btn--secondary btn--xs btn--toolbar" @click="exportBundle">
          <UiIcon name="download" />
          <span>{{ t('adminIcons.exportBundle') }}</span>
        </button>
      </div>
      <ListHeader
        v-model="searchQuery"
        class="admin-icons__search"
        :placeholder="t('adminIcons.searchPlaceholder')"
        :count="count"
        :loading="loading"
      />
    </div>

    <input
      ref="fileInput"
      type="file"
      accept=".svg,image/svg+xml"
      multiple
      hidden
      @change="uploadSvgs(($event.target as HTMLInputElement).files)"
    >
    <input
      ref="jsonInput"
      type="file"
      accept="application/json,.json"
      hidden
      @change="onJsonSelected"
    >

    <AppAlert v-if="errorMessage" type="error" :message="errorMessage" />
    <AppAlert v-if="successMessage" type="success" :message="successMessage" />

    <AdminTableShell
      v-if="loading || filteredIcons.length === 0"
      :loading="loading"
      :empty="!loading && filteredIcons.length === 0"
      :empty-text="emptyText"
    />

    <div v-else class="admin-icons__grid">
      <article
        v-for="icon in filteredIcons"
        :key="icon.id"
        class="admin-icons__card"
        :class="{ 'admin-icons__card--busy': deletingId === icon.id }"
      >
        <button
          type="button"
          class="admin-icons__card-delete"
          :disabled="deletingId === icon.id"
          :aria-label="t('common.delete')"
          :title="t('common.delete')"
          @click="requestRemove(icon)"
        >
          <UiIcon name="delete" />
        </button>
        <div class="admin-icons__card-preview">
          <img :src="svgToDataUrl(icon.svg)" :alt="icon.name">
        </div>
        <p class="admin-icons__card-name" :title="icon.name">{{ icon.name }}</p>
      </article>
    </div>

    <BaseModal
      v-if="pendingOverwrite"
      :title="t('adminIcons.overwriteTitle')"
      @close="pendingOverwrite = null"
    >
      <p class="admin-icons__modal-text">{{ t('adminIcons.overwriteConfirm') }}</p>
      <template #footer>
        <button type="button" class="btn btn--secondary" @click="pendingOverwrite = null">
          {{ t('common.cancel') }}
        </button>
        <button type="button" class="btn btn--primary" @click="confirmOverwrite">
          {{ t('adminIcons.overwrite') }}
        </button>
      </template>
    </BaseModal>

    <BaseModal
      v-if="pendingDelete"
      :title="t('adminIcons.deleteTitle')"
      @close="pendingDelete = null"
    >
      <p class="admin-icons__modal-text">
        {{ t('adminIcons.deleteConfirm', { name: pendingDelete.name }) }}
      </p>
      <template #footer>
        <button
          type="button"
          class="btn btn--secondary"
          :disabled="deletingId === pendingDelete.id"
          @click="pendingDelete = null"
        >
          {{ t('common.cancel') }}
        </button>
        <button
          type="button"
          class="btn btn--danger"
          :disabled="deletingId === pendingDelete.id"
          @click="confirmRemove"
        >
          {{ deletingId === pendingDelete.id ? t('common.deleting') : t('common.delete') }}
        </button>
      </template>
    </BaseModal>
  </div>
</template>

<style scoped>
.admin-icons {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.admin-icons__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.admin-icons__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.admin-icons__search {
  flex: 1;
  min-width: 220px;
  display: flex;
  justify-content: flex-end;
}
.admin-icons__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
  gap: 12px;
}
.admin-icons__card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 12px 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}
.admin-icons__card--busy {
  opacity: 0.45;
  pointer-events: none;
}
.admin-icons__card-preview {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 88px;
  border-radius: 10px;
  background: var(--surface-muted);
}
.admin-icons__card-preview img {
  width: 48px;
  height: 48px;
  object-fit: contain;
}
.admin-icons__card-name {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--base-text);
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.admin-icons__card-delete {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--text-subtle);
  cursor: pointer;
}
.admin-icons__card-delete :deep(.ui-icon) {
  width: 16px;
  height: 16px;
}
.admin-icons__card-delete:hover:not(:disabled) {
  background: var(--danger-soft);
  color: var(--danger);
  border-color: color-mix(in srgb, var(--danger) 25%, transparent);
}
.admin-icons__modal-text {
  margin: 0;
  font-size: 14px;
  color: var(--base-text);
  line-height: 1.55;
}
</style>
