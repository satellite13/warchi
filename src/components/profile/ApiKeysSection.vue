<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import MultiSelect from '@/components/forms/MultiSelect.vue'
import type { MultiSelectOption } from '@/components/forms/MultiSelect.vue'
import AppAlert from '@/components/ui/AppAlert.vue'
import UiIcon from '@/components/ui/UiIcon.vue'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/composables/useApi'
import type { ModelData, PaginatedResponse } from '@/types/entities'
import type {
  ApiKey,
  ApiKeyGrant,
  ApiKeyMode,
  ApiKeyScope,
  CreateApiKeyRequest,
  CreateApiKeyResponse,
} from '@/types/apiKeys'
import { formatApiKeySummary } from '@/utils/apiKeySummary'
import ApiKeyList from '@/components/profile/ApiKeyList.vue'

const MAX_GRANTS = 50

type GrantFlags = { read: boolean; write: boolean }

const { t } = useI18n()

const keys = ref<ApiKey[]>([])
const isLoading = ref(false)
const isCreating = ref(false)
const errorMessage = ref<string | null>(null)
const createdPlaintext = ref<string | null>(null)
const copied = ref(false)

const newName = ref('')
const mode = ref<ApiKeyMode>('all')
const scopeRead = ref(true)
const scopeWrite = ref(false)
const selectedModelIds = ref<string[]>([])
const grantFlags = reactive<Record<string, GrantFlags>>({})
const showCreateForm = ref(false)

const modelOptions = ref<MultiSelectOption[]>([])
const modelsById = ref<Map<string, string>>(new Map())
const isLoadingModels = ref(false)
const modelsLoaded = ref(false)

const loadKeys = async (): Promise<void> => {
  isLoading.value = true
  errorMessage.value = null
  const result = await apiGet<PaginatedResponse<ApiKey>>('/api-keys')
  isLoading.value = false
  if (!result.success) {
    errorMessage.value = result.error.message
    return
  }
  keys.value = (result.data.items ?? []).filter((k) => !k.revokedAt)
}

const loadModels = async (): Promise<void> => {
  if (modelsLoaded.value || isLoadingModels.value) return
  isLoadingModels.value = true
  const collected: ModelData[] = []
  let page = 0
  const size = 100
  let total = Number.POSITIVE_INFINITY

  while (collected.length < total && page < 20) {
    const result = await apiGet<PaginatedResponse<ModelData>>(
      `/models?page=${page}&size=${size}`
    )
    if (!result.success) {
      errorMessage.value = result.error.message
      isLoadingModels.value = false
      return
    }
    const items = result.data.items ?? result.data.content ?? []
    collected.push(...items)
    total = result.data.page?.totalElements ?? result.data.totalElements ?? items.length
    if (items.length < size) break
    page += 1
  }

  const options = collected
    .map((m) => ({
      id: m.id,
      label: `${m.name} · v${m.version}`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))

  modelOptions.value = options
  modelsById.value = new Map(options.map((o) => [o.id, o.label]))
  modelsLoaded.value = true
  isLoadingModels.value = false
}

const resetCreateForm = (): void => {
  newName.value = ''
  mode.value = 'all'
  scopeRead.value = true
  scopeWrite.value = false
  selectedModelIds.value = []
  for (const id of Object.keys(grantFlags)) {
    delete grantFlags[id]
  }
}

watch(showCreateForm, (open) => {
  if (open) {
    void loadModels()
  }
})

watch(mode, (next) => {
  if (next === 'grants') {
    void loadModels()
  } else {
    selectedModelIds.value = []
    for (const id of Object.keys(grantFlags)) {
      delete grantFlags[id]
    }
  }
})

watch(scopeWrite, (enabled) => {
  if (enabled) {
    scopeRead.value = true
  }
})

watch(
  selectedModelIds,
  (ids) => {
    const selected = new Set(ids)
    for (const id of Object.keys(grantFlags)) {
      if (!selected.has(id)) {
        delete grantFlags[id]
      }
    }
    for (const id of ids) {
      if (!grantFlags[id]) {
        grantFlags[id] = { read: true, write: false }
      }
    }
  },
  { deep: true }
)

const setGrantWrite = (modelId: string, write: boolean): void => {
  const flags = grantFlags[modelId]
  if (!flags) return
  flags.write = write
  if (write) {
    flags.read = true
  }
}

const setGrantRead = (modelId: string, read: boolean): void => {
  const flags = grantFlags[modelId]
  if (!flags || flags.write) return
  flags.read = read
}

const buildGrantScopes = (flags: GrantFlags): ApiKeyScope[] => {
  if (flags.write) return ['models:read', 'models:write']
  if (flags.read) return ['models:read']
  return []
}

const grantRows = computed(() =>
  selectedModelIds.value.map((modelId) => ({
    modelId,
    label: modelsById.value.get(modelId) ?? modelId.slice(0, 8) + '…',
    flags: grantFlags[modelId] ?? { read: true, write: false },
  }))
)

const hasAllScopes = computed(() => scopeWrite.value || scopeRead.value)

const grantsValid = computed(() => {
  const ids = selectedModelIds.value
  if (ids.length === 0 || ids.length > MAX_GRANTS) return false
  return ids.every((id) => {
    const flags = grantFlags[id]
    return flags != null && (flags.read || flags.write)
  })
})

const canSubmit = computed(() => {
  if (isCreating.value || isLoadingModels.value) return false
  if (!newName.value.trim()) return false
  if (mode.value === 'all') return hasAllScopes.value
  return grantsValid.value
})

const createKey = async (): Promise<void> => {
  const name = newName.value.trim()
  if (!name) {
    errorMessage.value = t('profile.apiKeysNameRequired')
    return
  }

  let body: CreateApiKeyRequest
  if (mode.value === 'all') {
    if (!hasAllScopes.value) {
      errorMessage.value = t('profile.apiKeysScopeRequired')
      return
    }
    const scopes: ApiKeyScope[] = scopeWrite.value
      ? ['models:read', 'models:write']
      : ['models:read']
    body = { name, mode: 'all', scopes, grants: null }
  } else {
    if (selectedModelIds.value.length === 0) {
      errorMessage.value = t('profile.apiKeysModelsRequired')
      return
    }
    if (selectedModelIds.value.length > MAX_GRANTS) {
      errorMessage.value = t('profile.apiKeysGrantsMax')
      return
    }
    const grants: ApiKeyGrant[] = []
    for (const modelId of selectedModelIds.value) {
      const flags = grantFlags[modelId] ?? { read: true, write: false }
      const scopes = buildGrantScopes(flags)
      if (scopes.length === 0) {
        errorMessage.value = t('profile.apiKeysGrantScopesRequired')
        return
      }
      grants.push({ modelId, scopes })
    }
    body = { name, mode: 'grants', scopes: null, grants }
  }

  isCreating.value = true
  errorMessage.value = null
  copied.value = false
  const result = await apiPost<CreateApiKeyResponse>('/api-keys', body)
  isCreating.value = false
  if (!result.success) {
    errorMessage.value = result.error.message
    return
  }

  createdPlaintext.value = result.data.key
  resetCreateForm()
  showCreateForm.value = false
  await loadKeys()
}

const revokeKey = async (id: string): Promise<void> => {
  if (!window.confirm(t('profile.apiKeysRevokeConfirm'))) return
  errorMessage.value = null
  const result = await apiDelete<void>(`/api-keys/${id}`)
  if (!result.success) {
    errorMessage.value = result.error.message
    return
  }
  if (createdPlaintext.value) {
    createdPlaintext.value = null
  }
  await loadKeys()
}

const renameKey = async (key: ApiKey): Promise<void> => {
  const next = window.prompt(t('profile.apiKeysRenamePrompt'), key.name)
  if (next == null) return
  const name = next.trim()
  if (!name || name === key.name) return
  errorMessage.value = null
  const result = await apiPatch<ApiKey>(`/api-keys/${key.id}`, { name })
  if (!result.success) {
    errorMessage.value = result.error.message
    return
  }
  await loadKeys()
}

const copyCreatedKey = async (): Promise<void> => {
  if (!createdPlaintext.value) return
  try {
    await navigator.clipboard.writeText(createdPlaintext.value)
    copied.value = true
  } catch {
    errorMessage.value = t('profile.apiKeysCopyError')
  }
}

const dismissCreatedKey = (): void => {
  createdPlaintext.value = null
  copied.value = false
}

const formatKeySummary = (key: ApiKey): string => formatApiKeySummary(key, t)

const modelSelectDisabled = computed(() => isLoadingModels.value || isCreating.value)

onMounted(() => {
  void loadKeys()
  void loadModels()
})
</script>

<template>
  <section class="api-keys panel">
    <div class="api-keys__header">
      <div class="api-keys__titles">
        <h2>{{ t('profile.apiKeysTitle') }}</h2>
        <p>{{ t('profile.apiKeysSubtitle') }}</p>
      </div>
      <button
        type="button"
        class="btn btn--primary"
        :disabled="isLoading || isCreating"
        @click="showCreateForm = !showCreateForm"
      >
        <UiIcon name="add" />
        {{ t('profile.apiKeysCreate') }}
      </button>
    </div>

    <div v-if="createdPlaintext" class="api-keys__created">
      <p class="api-keys__created-warn">{{ t('profile.apiKeysCreatedOnce') }}</p>
      <code class="api-keys__secret">{{ createdPlaintext }}</code>
      <div class="api-keys__created-actions">
        <button type="button" class="btn btn--primary" @click="copyCreatedKey">
          <UiIcon name="content_copy" />
          {{ copied ? t('profile.apiKeysCopied') : t('profile.apiKeysCopy') }}
        </button>
        <button type="button" class="btn btn--secondary" @click="dismissCreatedKey">
          {{ t('profile.apiKeysDismiss') }}
        </button>
      </div>
    </div>

    <form v-if="showCreateForm" class="api-keys__form" @submit.prevent="createKey">
      <label class="field">
        <span>{{ t('profile.apiKeysName') }}</span>
        <input
          v-model="newName"
          class="form-input form-input--lg"
          type="text"
          :placeholder="t('profile.apiKeysNamePlaceholder')"
        />
      </label>

      <fieldset class="api-keys__mode">
        <legend class="api-keys__mode-label">{{ t('profile.apiKeysModeLabel') }}</legend>
        <label class="api-keys__check">
          <input v-model="mode" type="radio" value="all" />
          {{ t('profile.apiKeysModeAll') }}
        </label>
        <label class="api-keys__check">
          <input v-model="mode" type="radio" value="grants" />
          {{ t('profile.apiKeysModeGrants') }}
        </label>
        <p class="api-keys__hint">
          {{ mode === 'all' ? t('profile.apiKeysModeAllHint') : t('profile.apiKeysModeGrantsHint') }}
        </p>
      </fieldset>

      <div v-if="mode === 'all'" class="api-keys__scopes">
        <span class="api-keys__scopes-label">{{ t('profile.apiKeysScopes') }}</span>
        <label class="api-keys__check">
          <input v-model="scopeRead" type="checkbox" :disabled="scopeWrite" />
          {{ t('profile.apiKeysScopeRead') }}
        </label>
        <label class="api-keys__check">
          <input v-model="scopeWrite" type="checkbox" />
          {{ t('profile.apiKeysScopeWrite') }}
        </label>
        <p class="api-keys__hint">{{ t('profile.apiKeysWriteImpliesRead') }}</p>
      </div>

      <div v-else class="field">
        <span>{{ t('profile.apiKeysModeGrants') }}</span>
        <MultiSelect
          v-model="selectedModelIds"
          :options="modelOptions"
          :disabled="modelSelectDisabled"
          force-search
          :placeholder="
            isLoadingModels ? t('common.loading') : t('profile.apiKeysModelsPlaceholder')
          "
          :search-placeholder="t('profile.apiKeysModelsSearch')"
          :empty-text="t('profile.apiKeysModelsEmpty')"
          :max-visible-labels="2"
        />
        <ul v-if="grantRows.length" class="api-keys__grants">
          <li v-for="row in grantRows" :key="row.modelId" class="api-keys__grant">
            <span class="api-keys__grant-name" :title="row.label">{{ row.label }}</span>
            <div class="api-keys__grant-scopes" :aria-label="t('profile.apiKeysGrantRowScopes')">
              <label class="api-keys__check">
                <input
                  type="checkbox"
                  :checked="row.flags.read"
                  :disabled="row.flags.write"
                  @change="
                    setGrantRead(row.modelId, ($event.target as HTMLInputElement).checked)
                  "
                />
                {{ t('profile.apiKeysScopeRead') }}
              </label>
              <label class="api-keys__check">
                <input
                  type="checkbox"
                  :checked="row.flags.write"
                  @change="
                    setGrantWrite(row.modelId, ($event.target as HTMLInputElement).checked)
                  "
                />
                {{ t('profile.apiKeysScopeWrite') }}
              </label>
            </div>
          </li>
        </ul>
        <p v-if="selectedModelIds.length > MAX_GRANTS" class="api-keys__hint api-keys__hint--error">
          {{ t('profile.apiKeysGrantsMax') }}
        </p>
        <p v-else class="api-keys__hint">{{ t('profile.apiKeysWriteImpliesRead') }}</p>
      </div>

      <button type="submit" class="btn btn--primary" :disabled="!canSubmit">
        {{ isCreating ? t('common.saving') : t('profile.apiKeysCreateSubmit') }}
      </button>
    </form>

    <div v-if="errorMessage" class="api-keys__alert">
      <AppAlert type="error" :message="errorMessage" />
    </div>

    <ApiKeyList
      :keys="keys"
      :is-loading="isLoading"
      :loading-text="t('common.loading')"
      :empty-text="t('profile.apiKeysEmpty')"
      :revoke-label="t('profile.apiKeysRevoke')"
      :rename-label="t('profile.apiKeysRename')"
      :format-summary="formatKeySummary"
      show-rename
      @revoke="revokeKey"
      @rename="renameKey"
    />
  </section>
</template>

<style scoped>
.panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 20px;
  min-height: 100%;
}

.api-keys {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.api-keys__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.api-keys__titles {
  min-width: 0;
}

.api-keys h2 {
  margin: 0 0 4px;
  font-size: 17px;
}

.api-keys__titles p {
  margin: 0;
  color: var(--text-muted);
  font-size: 13px;
}

.api-keys__created {
  margin-bottom: 14px;
  padding: 12px 14px;
  border-radius: var(--radius-sm);
  border: 1px solid color-mix(in srgb, var(--warning) 35%, transparent);
  background: color-mix(in srgb, var(--warning) 12%, transparent);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.api-keys__created-warn {
  margin: 0;
  font-size: 13px;
  color: var(--base-text);
  font-weight: 600;
}

.api-keys__secret {
  display: block;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  background: var(--surface-muted);
  border: 1px solid var(--border);
  font-size: 12px;
  word-break: break-all;
}

.api-keys__created-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.api-keys__form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 14px;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-muted);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field > span {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted);
}


.api-keys__mode {
  margin: 0;
  padding: 0;
  border: none;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.api-keys__mode-label {
  flex-basis: 100%;
  padding: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted);
}

.api-keys__scopes {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.api-keys__scopes-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted);
}

.api-keys__check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
}

.api-keys__hint {
  margin: 0;
  font-size: 12px;
  color: var(--text-subtle);
  flex-basis: 100%;
}

.api-keys__hint--error {
  color: var(--danger);
}

.api-keys__grants {
  list-style: none;
  margin: 4px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.api-keys__grant {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
}

.api-keys__grant-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

.api-keys__grant-scopes {
  display: flex;
  flex-shrink: 0;
  gap: 10px;
}

.api-keys__alert {
  margin-bottom: 12px;
}

.api-keys__empty {
  margin: 8px 0 0;
  color: var(--text-subtle);
  font-size: 13px;
}

.api-keys__list {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.api-keys__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-muted);
}

.api-keys__meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.api-keys__prefix,
.api-keys__summary {
  font-size: 12px;
  color: var(--text-muted);
}

.api-keys__actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

@media (max-width: 640px) {
  .api-keys__header,
  .api-keys__item,
  .api-keys__grant {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
