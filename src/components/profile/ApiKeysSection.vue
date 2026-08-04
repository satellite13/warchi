<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue"
import { useI18n } from "vue-i18n"
import MultiSelect from "@/components/forms/MultiSelect.vue"
import type { MultiSelectOption } from "@/components/forms/MultiSelect.vue"
import UiIcon from "@/components/ui/UiIcon.vue"
import { apiDelete, apiGet, apiPatch, apiPost } from "@/composables/useApi"
import type { ModelData, PaginatedResponse } from "@/types/entities"
import type {
  ApiKey,
  ApiKeyScope,
  CreateApiKeyRequest,
  CreateApiKeyResponse,
} from "@/types/apiKeys"

const { t } = useI18n()

const keys = ref<ApiKey[]>([])
const isLoading = ref(false)
const isCreating = ref(false)
const errorMessage = ref<string | null>(null)
const createdPlaintext = ref<string | null>(null)
const copied = ref(false)

const newName = ref("")
const scopeRead = ref(true)
const scopeWrite = ref(false)
const restrictModels = ref(false)
const selectedModelIds = ref<string[]>([])
const showCreateForm = ref(false)

const modelOptions = ref<MultiSelectOption[]>([])
const modelsById = ref<Map<string, string>>(new Map())
const isLoadingModels = ref(false)
const modelsLoaded = ref(false)

const loadKeys = async (): Promise<void> => {
  isLoading.value = true
  errorMessage.value = null
  const result = await apiGet<PaginatedResponse<ApiKey>>("/api-keys")
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
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }))

  modelOptions.value = options
  modelsById.value = new Map(options.map((o) => [o.id, o.label]))
  modelsLoaded.value = true
  isLoadingModels.value = false
}

watch(showCreateForm, (open) => {
  if (open) {
    void loadModels()
  }
})

watch(restrictModels, (enabled) => {
  if (!enabled) {
    selectedModelIds.value = []
  } else {
    void loadModels()
  }
})

const createKey = async (): Promise<void> => {
  const name = newName.value.trim()
  if (!name) {
    errorMessage.value = t("profile.apiKeysNameRequired")
    return
  }
  const scopes: ApiKeyScope[] = []
  if (scopeRead.value) scopes.push("models:read")
  if (scopeWrite.value) scopes.push("models:write")
  if (scopes.length === 0) {
    errorMessage.value = t("profile.apiKeysScopeRequired")
    return
  }
  if (restrictModels.value && selectedModelIds.value.length === 0) {
    errorMessage.value = t("profile.apiKeysModelsRequired")
    return
  }

  isCreating.value = true
  errorMessage.value = null
  copied.value = false
  const body: CreateApiKeyRequest = {
    name,
    scopes,
    modelIds: restrictModels.value ? selectedModelIds.value : null,
  }
  const result = await apiPost<CreateApiKeyResponse>("/api-keys", body)
  isCreating.value = false
  if (!result.success) {
    errorMessage.value = result.error.message
    return
  }

  createdPlaintext.value = result.data.key
  newName.value = ""
  restrictModels.value = false
  selectedModelIds.value = []
  scopeRead.value = true
  scopeWrite.value = false
  showCreateForm.value = false
  await loadKeys()
}

const revokeKey = async (id: string): Promise<void> => {
  if (!window.confirm(t("profile.apiKeysRevokeConfirm"))) return
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
  const next = window.prompt(t("profile.apiKeysRenamePrompt"), key.name)
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
    errorMessage.value = t("profile.apiKeysCopyError")
  }
}

const dismissCreatedKey = (): void => {
  createdPlaintext.value = null
  copied.value = false
}

const formatScopes = (scopes: string[]): string =>
  scopes
    .map((s) => (s === "models:write" ? t("profile.apiKeysScopeWrite") : t("profile.apiKeysScopeRead")))
    .join(", ")

const formatModelAllowlist = (modelIds: string[] | null | undefined): string => {
  if (!modelIds?.length) return ""
  const labels = modelIds.map((id) => modelsById.value.get(id) ?? id.slice(0, 8) + "…")
  if (labels.length <= 2) return labels.join(", ")
  return t("profile.apiKeysModelsSelected", {
    names: labels.slice(0, 2).join(", "),
    count: labels.length - 2,
  })
}

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
        <h2>{{ t("profile.apiKeysTitle") }}</h2>
        <p>{{ t("profile.apiKeysSubtitle") }}</p>
      </div>
      <button
        type="button"
        class="btn btn--primary"
        :disabled="isLoading || isCreating"
        @click="showCreateForm = !showCreateForm"
      >
        <UiIcon name="add" />
        {{ t("profile.apiKeysCreate") }}
      </button>
    </div>

    <div v-if="createdPlaintext" class="api-keys__created">
      <p class="api-keys__created-warn">{{ t("profile.apiKeysCreatedOnce") }}</p>
      <code class="api-keys__secret">{{ createdPlaintext }}</code>
      <div class="api-keys__created-actions">
        <button type="button" class="btn btn--primary" @click="copyCreatedKey">
          <UiIcon name="content_copy" />
          {{ copied ? t("profile.apiKeysCopied") : t("profile.apiKeysCopy") }}
        </button>
        <button type="button" class="btn btn--secondary" @click="dismissCreatedKey">
          {{ t("profile.apiKeysDismiss") }}
        </button>
      </div>
    </div>

    <form v-if="showCreateForm" class="api-keys__form" @submit.prevent="createKey">
      <label class="field">
        <span>{{ t("profile.apiKeysName") }}</span>
        <input v-model="newName" type="text" :placeholder="t('profile.apiKeysNamePlaceholder')" />
      </label>
      <div class="api-keys__scopes">
        <span class="api-keys__scopes-label">{{ t("profile.apiKeysScopes") }}</span>
        <label class="api-keys__check">
          <input v-model="scopeRead" type="checkbox" />
          {{ t("profile.apiKeysScopeRead") }}
        </label>
        <label class="api-keys__check">
          <input v-model="scopeWrite" type="checkbox" />
          {{ t("profile.apiKeysScopeWrite") }}
        </label>
      </div>
      <div class="field">
        <label class="api-keys__check api-keys__restrict">
          <input v-model="restrictModels" type="checkbox" />
          {{ t("profile.apiKeysRestrictModels") }}
        </label>
        <p class="api-keys__hint">{{ t("profile.apiKeysRestrictModelsHint") }}</p>
        <MultiSelect
          v-if="restrictModels"
          v-model="selectedModelIds"
          :options="modelOptions"
          :disabled="modelSelectDisabled"
          force-search
          :placeholder="
            isLoadingModels
              ? t('common.loading')
              : t('profile.apiKeysModelsPlaceholder')
          "
          :search-placeholder="t('profile.apiKeysModelsSearch')"
          :empty-text="t('profile.apiKeysModelsEmpty')"
          :max-visible-labels="2"
        />
      </div>
      <button type="submit" class="btn btn--primary" :disabled="isCreating || isLoadingModels">
        {{ isCreating ? t("common.saving") : t("profile.apiKeysCreateSubmit") }}
      </button>
    </form>

    <div v-if="errorMessage" class="msg msg--error">{{ errorMessage }}</div>

    <p v-if="isLoading" class="api-keys__empty">{{ t("common.loading") }}</p>
    <p v-else-if="keys.length === 0" class="api-keys__empty">{{ t("profile.apiKeysEmpty") }}</p>
    <ul v-else class="api-keys__list">
      <li v-for="key in keys" :key="key.id" class="api-keys__item">
        <div class="api-keys__meta">
          <strong>{{ key.name }}</strong>
          <span class="api-keys__prefix">warchi_ak_{{ key.tokenPrefix }}…</span>
          <span class="api-keys__scopes-text">{{ formatScopes(key.scopes) }}</span>
          <span v-if="key.modelIds?.length" class="api-keys__models">
            {{ formatModelAllowlist(key.modelIds) }}
          </span>
          <span v-else class="api-keys__models">{{ t("profile.apiKeysAllModels") }}</span>
        </div>
        <div class="api-keys__actions">
          <button type="button" class="btn btn--secondary" @click="renameKey(key)">
            {{ t("profile.apiKeysRename") }}
          </button>
          <button type="button" class="btn btn--danger" @click="revokeKey(key.id)">
            {{ t("profile.apiKeysRevoke") }}
          </button>
        </div>
      </li>
    </ul>
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

.field input[type="text"] {
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--base-text);
  font-family: inherit;
  font-size: 14px;
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

.api-keys__restrict {
  font-weight: 600;
  color: var(--text-muted);
  font-size: 13px;
}

.api-keys__hint {
  margin: 0;
  font-size: 12px;
  color: var(--text-subtle);
}

.msg {
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  font-size: 14px;
  margin-bottom: 12px;
}

.msg--error {
  border: 1px solid rgba(220, 53, 69, 0.12);
  background: var(--danger-soft);
  color: var(--danger);
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
.api-keys__scopes-text,
.api-keys__models {
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
  .api-keys__item {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
