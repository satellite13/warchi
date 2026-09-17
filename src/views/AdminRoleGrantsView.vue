<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { apiGet, apiPut } from '@/composables/useApi'
import { FEATURE_GRANT_KEYS } from '@/domain/featureGrants/catalog'
import AppAlert from '@/components/ui/AppAlert.vue'
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue'

type MatrixRole = 'architect' | 'editor' | 'reader' | 'viewer'

type RoleFeatureGrantsMatrixResponse = {
  roles: Record<string, string[]>
  catalog: string[]
}

type FeatureGrantsUpdateResponse = {
  grants: string[]
}

const MATRIX_ROLES: MatrixRole[] = ['architect', 'editor', 'reader', 'viewer']

const { t } = useI18n()

const isLoading = ref(false)
const isSaving = ref(false)
const errorMessage = ref<string | null>(null)
const successMessage = ref<string | null>(null)

const catalog = ref<string[]>([...FEATURE_GRANT_KEYS])
const draft = ref<Record<MatrixRole, Set<string>>>({
  architect: new Set(),
  editor: new Set(),
  reader: new Set(),
  viewer: new Set(),
})
const saved = ref<Record<MatrixRole, Set<string>>>({
  architect: new Set(),
  editor: new Set(),
  reader: new Set(),
  viewer: new Set(),
})

const dirtyRoles = computed(() =>
  MATRIX_ROLES.filter((role) => !setsEqual(draft.value[role], saved.value[role])),
)

const hasDirty = computed(() => dirtyRoles.value.length > 0)

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false
  for (const key of a) {
    if (!b.has(key)) return false
  }
  return true
}

function cloneRoleSets(
  source: Record<MatrixRole, Set<string>>,
): Record<MatrixRole, Set<string>> {
  return {
    architect: new Set(source.architect),
    editor: new Set(source.editor),
    reader: new Set(source.reader),
    viewer: new Set(source.viewer),
  }
}

function applyMatrix(data: RoleFeatureGrantsMatrixResponse): void {
  const nextCatalog =
    Array.isArray(data.catalog) && data.catalog.length > 0
      ? data.catalog
      : [...FEATURE_GRANT_KEYS]
  catalog.value = nextCatalog

  const next: Record<MatrixRole, Set<string>> = {
    architect: new Set(),
    editor: new Set(),
    reader: new Set(),
    viewer: new Set(),
  }
  for (const role of MATRIX_ROLES) {
    const grants = data.roles?.[role] ?? []
    next[role] = new Set(grants.filter((key) => nextCatalog.includes(key)))
  }
  draft.value = next
  saved.value = cloneRoleSets(next)
}

function grantLabel(key: string): string {
  return t(`featureGrants.keys.${key}`)
}

function roleLabel(role: MatrixRole): string {
  return t(`featureGrants.roles.${role}`)
}

function isChecked(role: MatrixRole, key: string): boolean {
  return draft.value[role].has(key)
}

function toggleGrant(role: MatrixRole, key: string, checked: boolean): void {
  const next = new Set(draft.value[role])
  if (checked) next.add(key)
  else next.delete(key)
  draft.value = { ...draft.value, [role]: next }
}

async function loadMatrix(): Promise<void> {
  isLoading.value = true
  errorMessage.value = null
  successMessage.value = null
  const result = await apiGet<RoleFeatureGrantsMatrixResponse>('/admin/role-feature-grants')
  isLoading.value = false
  if (!result.success) {
    errorMessage.value = result.error.message
    return
  }
  applyMatrix(result.data)
}

async function saveDirtyRoles(): Promise<void> {
  if (!hasDirty.value || isSaving.value) return
  isSaving.value = true
  errorMessage.value = null
  successMessage.value = null

  const rolesToSave = [...dirtyRoles.value]
  for (const role of rolesToSave) {
    const grants = [...draft.value[role]].sort()
    const result = await apiPut<FeatureGrantsUpdateResponse>(
      `/admin/role-feature-grants/${role}`,
      { grants },
    )
    if (!result.success) {
      errorMessage.value = t('adminRoleGrants.saveError', {
        role: roleLabel(role),
        message: result.error.message,
      })
      isSaving.value = false
      return
    }
    saved.value = {
      ...saved.value,
      [role]: new Set(result.data.grants),
    }
    draft.value = {
      ...draft.value,
      [role]: new Set(result.data.grants),
    }
  }

  successMessage.value = t('adminRoleGrants.saved')
  isSaving.value = false
}

function resetDraft(): void {
  draft.value = cloneRoleSets(saved.value)
  errorMessage.value = null
  successMessage.value = null
}

onMounted(() => {
  void loadMatrix()
})
</script>

<template>
  <div class="arg">
    <AdminPageHeader
      :title="t('adminRoleGrants.title')"
      :subtitle="t('adminRoleGrants.subtitle')"
    >
      <template #badge>
        <span class="arg-badge">{{ t('adminRoleGrants.adminAlwaysAll') }}</span>
      </template>
      <template #toolbar>
        <button
          type="button"
          class="btn btn--ghost btn--sm"
          :disabled="isLoading || isSaving || !hasDirty"
          @click="resetDraft"
        >
          {{ t('common.cancel') }}
        </button>
        <button
          type="button"
          class="btn btn--primary btn--sm"
          :disabled="isLoading || isSaving || !hasDirty"
          @click="saveDirtyRoles"
        >
          {{ isSaving ? t('adminRoleGrants.saving') : t('adminRoleGrants.save') }}
        </button>
      </template>
    </AdminPageHeader>

    <AppAlert v-if="errorMessage" type="error" :message="errorMessage" />
    <AppAlert v-if="successMessage" type="success" :message="successMessage" />

    <div v-if="isLoading" class="arg-state">{{ t('adminRoleGrants.loading') }}</div>

    <div v-else class="arg-table-wrap">
      <table class="arg-table">
        <thead>
          <tr>
            <th class="arg-table__grant">{{ t('adminRoleGrants.grant') }}</th>
            <th v-for="role in MATRIX_ROLES" :key="role" class="arg-table__role">
              {{ roleLabel(role) }}
              <span v-if="dirtyRoles.includes(role)" class="arg-table__dirty">●</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="key in catalog" :key="key">
            <td class="arg-table__grant">
              <span class="arg-table__label">{{ grantLabel(key) }}</span>
              <span class="arg-table__key">{{ key }}</span>
            </td>
            <td v-for="role in MATRIX_ROLES" :key="`${role}-${key}`" class="arg-table__cell">
              <label class="arg-check">
                <input
                  type="checkbox"
                  :checked="isChecked(role, key)"
                  :disabled="isSaving"
                  @change="
                    toggleGrant(role, key, ($event.target as HTMLInputElement).checked)
                  "
                />
              </label>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.arg {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 20px;
  min-height: 0;
}

.arg-badge {
  display: inline-flex;
  align-items: center;
  padding: 5px 10px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  border-radius: 6px;
  background: var(--primary-soft);
  color: var(--primary);
  white-space: nowrap;
}

.arg-state {
  padding: 28px;
  text-align: center;
  color: var(--text-muted);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
}

.arg-table-wrap {
  flex: 1;
  min-height: 0;
  overflow: auto;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
}

.arg-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.arg-table th,
.arg-table td {
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  text-align: left;
  vertical-align: middle;
}

.arg-table thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--surface);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-subtle);
}

.arg-table__grant {
  min-width: 240px;
}

.arg-table__role,
.arg-table__cell {
  width: 110px;
  text-align: center;
}

.arg-table__dirty {
  margin-left: 4px;
  color: var(--primary);
  font-size: 10px;
}

.arg-table__label {
  display: block;
  font-weight: 560;
  color: var(--base-text);
}

.arg-table__key {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  color: var(--text-subtle);
  font-variant-numeric: tabular-nums;
}

.arg-table tbody tr:hover {
  background: var(--surface-muted);
}

.arg-check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.arg-check input {
  width: 16px;
  height: 16px;
  accent-color: var(--primary);
  cursor: pointer;
}

.arg-check input:disabled {
  cursor: not-allowed;
}

@media (max-width: 768px) {
  .arg-table__role,
  .arg-table__cell {
    width: 88px;
  }
}
</style>
