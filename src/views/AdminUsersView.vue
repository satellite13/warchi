<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { apiGet, apiPut } from '../composables/useApi'
import { pagedListParams } from '../api/queryHelpers'
import type { PaginatedResponse, User, UserRole } from '../types/entities'
import { formatDate } from '../utils/formatDate'
import { paginatedContent } from '../utils/paginatedResponse'
import { normalizeUserRole } from '../utils/userRole'
import AdminAlert from '@/components/admin/AdminAlert.vue'
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue'
import AdminTableShell from '@/components/admin/AdminTableShell.vue'
import { useUserProfileEdit, useUserPasswordEdit } from './composables/useUserAdminForms'

type EditableUser = User & {
  role: UserRole
  isActive: boolean
}

type UserUpdatePayload = {
  email?: string
  attrs?: string | null
  role?: UserRole
  isActive?: boolean
  password?: string
  firstName?: string
  lastName?: string
  middleName?: string
  position?: string
}

const users = ref<EditableUser[]>([])
const { t, locale } = useI18n()
const isLoading = ref(false)
const isSavingId = ref<string | null>(null)
const errorMessage = ref<string | null>(null)
const successMessage = ref<string | null>(null)
const searchEmail = ref('')

const roleOptions: UserRole[] = ['USER', 'ADMIN']

const roleMeta: Record<UserRole, { label: string; cls: string }> = {
  USER: { label: 'User', cls: 'role--user' },
  ADMIN: { label: 'Admin', cls: 'role--admin' },
}

const stats = computed(() => {
  const total = users.value.length
  const active = users.value.filter((u) => u.isActive).length
  const admins = users.value.filter((u) => u.role === 'ADMIN').length
  return { total, active, inactive: total - active, admins }
})

const normalizeUser = (raw: User): EditableUser => ({
  ...raw,
  role: normalizeUserRole(raw.role),
  isActive: raw.isActive ?? true,
})

const loadUsers = async (): Promise<void> => {
  isLoading.value = true
  errorMessage.value = null
  successMessage.value = null

  const query = pagedListParams(0, 200)
  query.set('sort', 'email,asc')

  if (searchEmail.value.trim()) {
    query.set('email', searchEmail.value.trim())
  }

  const result = await apiGet<PaginatedResponse<User>>(`/users?${query.toString()}`)

  isLoading.value = false

  if (!result.success) {
    errorMessage.value = result.error.message
    users.value = []
    return
  }

  users.value = paginatedContent(result.data).map(normalizeUser)
}

const updateUser = async (userId: string, patch: UserUpdatePayload): Promise<void> => {
  isSavingId.value = userId
  errorMessage.value = null
  successMessage.value = null

  const result = await apiPut<EditableUser>(`/users/${userId}`, patch)

  if (!result.success) {
    errorMessage.value = result.error.message
    isSavingId.value = null
    return
  }

  users.value = users.value.map((item) =>
    item.id === userId ? normalizeUser(result.data) : item,
  )
  isSavingId.value = null
}

const handleRoleChange = async (user: EditableUser, event: Event): Promise<void> => {
  const target = event.target as HTMLSelectElement
  const role = target.value as UserRole
  if (!roleOptions.includes(role)) return
  await updateUser(user.id, { role })
}

const handleActiveToggle = async (user: EditableUser): Promise<void> => {
  await updateUser(user.id, { isActive: !user.isActive })
}

const fullName = (user: EditableUser): string => {
  const parts = [user.lastName, user.firstName, user.middleName]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
  return parts.length > 0 ? parts.join(' ') : t('adminUsers.profileNotFilled')
}

const {
  profileEditId,
  openProfileEdit,
  closeProfileEdit,
  getProfileDraft,
  submitProfileChange,
} = useUserProfileEdit(isSavingId, errorMessage, successMessage, updateUser)

const {
  passwordEditId,
  passwordDraft,
  openPasswordEdit,
  closePasswordEdit,
  submitPasswordChange,
} = useUserPasswordEdit(isSavingId, errorMessage, successMessage, updateUser)

const clearSearch = () => {
  searchEmail.value = ''
  loadUsers()
}

onMounted(() => {
  loadUsers()
})
</script>

<template>
  <div class="au">
    <AdminPageHeader :title="t('adminUsers.title')" :subtitle="t('adminUsers.subtitle')">
      <template #toolbar>
        <form class="au-search" @submit.prevent="loadUsers">
          <div class="au-search__wrap">
            <svg class="au-search__icon" viewBox="0 0 20 20" fill="none">
              <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" stroke-width="1.5" />
              <path
                d="M13 13l4 4"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
              />
            </svg>
            <input
              v-model="searchEmail"
              class="au-search__input"
              type="text"
              :placeholder="t('adminUsers.searchByEmail')"
              :disabled="isLoading"
            />
            <button v-if="searchEmail" type="button" class="au-search__clear" @click="clearSearch">
              <svg viewBox="0 0 16 16" fill="none">
                <path
                  d="M4 4l8 8M12 4l-8 8"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                />
              </svg>
            </button>
          </div>
          <button type="submit" class="btn btn--primary btn--sm" :disabled="isLoading">
            {{ t('common.find') }}
          </button>
        </form>
      </template>
    </AdminPageHeader>

    <!-- Stats strip -->
    <div class="au-stats">
      <div class="au-stat">
        <span class="au-stat__num">{{ stats.total }}</span>
        <span class="au-stat__label">{{ t('adminUsers.total') }}</span>
      </div>
      <div class="au-stat au-stat--accent">
        <span class="au-stat__num">{{ stats.active }}</span>
        <span class="au-stat__label">{{ t('adminUsers.active') }}</span>
      </div>
      <div class="au-stat au-stat--warn">
        <span class="au-stat__num">{{ stats.inactive }}</span>
        <span class="au-stat__label">{{ t('adminUsers.inactive') }}</span>
      </div>
      <div class="au-stat au-stat--primary">
        <span class="au-stat__num">{{ stats.admins }}</span>
        <span class="au-stat__label">{{ t('adminUsers.admins') }}</span>
      </div>
    </div>

    <AdminAlert v-if="errorMessage" type="error" :message="errorMessage" />
    <AdminAlert v-if="successMessage" type="success" :message="successMessage" />

    <AdminTableShell
      class="au-table-wrap"
      :loading="isLoading"
      :empty="users.length === 0"
      :loading-text="t('adminUsers.loadingUsers')"
      :empty-text="t('adminUsers.usersNotFound')"
    >
      <template #emptyIcon>
        <svg class="au-empty__icon" viewBox="0 0 48 48" fill="none">
          <circle cx="24" cy="24" r="20" stroke="currentColor" stroke-width="1.5" opacity="0.3" />
          <circle cx="24" cy="20" r="6" stroke="currentColor" stroke-width="1.5" />
          <path
            d="M12 40c0-6.627 5.373-12 12-12s12 5.373 12 12"
            stroke="currentColor"
            stroke-width="1.5"
          />
        </svg>
      </template>
      <template #head>
        <tr>
          <th>{{ t('adminUsers.user') }}</th>
          <th>{{ t('adminUsers.role') }}</th>
          <th>{{ t('adminUsers.status') }}</th>
          <th>{{ t('adminUsers.updated') }}</th>
          <th>{{ t('adminUsers.profile') }}</th>
          <th>{{ t('adminUsers.password') }}</th>
        </tr>
      </template>
      <TransitionGroup tag="tbody" name="au-row">
        <tr
          v-for="user in users"
          :key="user.id"
          class="au-table__row"
          :class="{
            'au-table__row--saving': isSavingId === user.id,
            'au-table__row--off': !user.isActive,
          }"
        >
            <!-- User -->
            <td>
              <div class="au-user">
                <div class="au-user__avatar" :class="{ 'au-user__avatar--off': !user.isActive }">
                  {{ user.email.charAt(0).toUpperCase() }}
                </div>
                <div class="au-user__meta">
                  <span class="au-user__email">{{ user.email }}</span>
                  <span class="au-user__id">{{ user.id }}</span>
                </div>
              </div>
            </td>

            <!-- Role -->
            <td>
              <div class="au-role">
                <span class="au-role__badge" :class="roleMeta[user.role].cls">
                  {{ roleMeta[user.role].label }}
                </span>
                <select
                  class="au-role__select"
                  :value="user.role"
                  :disabled="isSavingId === user.id"
                  @change="handleRoleChange(user, $event)"
                >
                  <option v-for="role in roleOptions" :key="role" :value="role">
                    {{ role }}
                  </option>
                </select>
              </div>
            </td>

            <!-- Status -->
            <td>
              <button
                type="button"
                class="au-toggle"
                :class="{ 'au-toggle--on': user.isActive }"
                :disabled="isSavingId === user.id"
                @click="handleActiveToggle(user)"
              >
                <span class="au-toggle__track">
                  <span class="au-toggle__thumb"></span>
                </span>
                <span class="au-toggle__text">{{
                  user.isActive ? t('adminUsers.statusActive') : t('adminUsers.statusBlocked')
                }}</span>
              </button>
            </td>

            <!-- Updated -->
            <td class="au-date">{{ formatDate(user.updatedAt, locale, false) }}</td>

            <!-- Profile -->
            <td>
              <div class="au-profile">
                <template v-if="profileEditId !== user.id">
                  <div class="au-profile__info">
                    <span class="au-profile__name">{{ fullName(user) }}</span>
                    <span class="au-profile__pos">{{
                      user.position || t('common.loadingDash')
                    }}</span>
                  </div>
                  <button
                    type="button"
                    class="au-btn-inline"
                    :disabled="isSavingId === user.id"
                    @click="openProfileEdit(user)"
                  >
                    {{ t('common.edit') }}
                  </button>
                </template>

                <form
                  v-else
                  class="au-profile__form"
                  @submit.prevent="submitProfileChange(user)"
                >
                  <input
                    v-model="getProfileDraft(user.id).lastName"
                    class="form-input form-input--compact"
                    type="text"
                    :placeholder="t('auth.labelLastName')"
                    :disabled="isSavingId === user.id"
                  />
                  <input
                    v-model="getProfileDraft(user.id).firstName"
                    class="form-input form-input--compact"
                    type="text"
                    :placeholder="t('auth.labelFirstName')"
                    :disabled="isSavingId === user.id"
                  />
                  <input
                    v-model="getProfileDraft(user.id).middleName"
                    class="form-input form-input--compact"
                    type="text"
                    :placeholder="t('profile.middleName')"
                    :disabled="isSavingId === user.id"
                  />
                  <input
                    v-model="getProfileDraft(user.id).position"
                    class="form-input form-input--compact"
                    type="text"
                    :placeholder="t('profile.position')"
                    :disabled="isSavingId === user.id"
                  />
                  <div class="au-profile__actions">
                    <button
                      type="submit"
                      class="btn btn--primary btn--xs"
                      :disabled="isSavingId === user.id"
                    >
                      {{ t('common.save') }}
                    </button>
                    <button
                      type="button"
                      class="btn btn--ghost btn--xs"
                      :disabled="isSavingId === user.id"
                      @click="closeProfileEdit"
                    >
                      {{ t('common.cancel') }}
                    </button>
                  </div>
                </form>
              </div>
            </td>

            <!-- Password -->
            <td>
              <div class="au-pwd">
                <button
                  v-if="passwordEditId !== user.id"
                  type="button"
                  class="au-btn-inline"
                  :disabled="isSavingId === user.id"
                  @click="openPasswordEdit(user.id)"
                >
                  {{ t('adminUsers.changePassword') }}
                </button>

                <form
                  v-else
                  class="au-pwd__form"
                  @submit.prevent="submitPasswordChange(user)"
                >
                  <input
                    v-model="passwordDraft[user.id]"
                    class="form-input form-input--compact"
                    type="password"
                    :placeholder="t('adminUsers.newPassword')"
                    minlength="6"
                    :disabled="isSavingId === user.id"
                  />
                  <div class="au-pwd__actions">
                    <button
                      type="submit"
                      class="btn btn--primary btn--xs"
                      :disabled="isSavingId === user.id"
                    >
                      {{ t('common.save') }}
                    </button>
                    <button
                      type="button"
                      class="btn btn--ghost btn--xs"
                      :disabled="isSavingId === user.id"
                      @click="closePasswordEdit"
                    >
                      {{ t('common.cancel') }}
                    </button>
                  </div>
                </form>
              </div>
            </td>
        </tr>
      </TransitionGroup>
    </AdminTableShell>
  </div>
</template>

<style scoped>
/* ─── Root ─────────────────────────────────────── */
.au {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-height: 0;
}

/* ─── Header ───────────────────────────────────── */
.au__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20px;
}

.au__heading {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  color: var(--base-text);
  letter-spacing: -0.03em;
}

.au__sub {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--text-muted);
}

/* ─── Search ───────────────────────────────────── */
.au-search {
  display: flex;
  gap: 8px;
  align-items: center;
}

.au-search__wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.au-search__icon {
  position: absolute;
  left: 12px;
  width: 15px;
  height: 15px;
  color: var(--text-subtle);
  pointer-events: none;
  transition: color 0.2s;
}

.au-search__wrap:focus-within .au-search__icon {
  color: var(--primary);
}

.au-search__input {
  width: 220px;
  padding: 8px 30px 8px 34px;
  font-size: 13px;
  font-family: inherit;
  border: 1.5px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  color: var(--base-text);
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.au-search__input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-soft);
}

.au-search__input::placeholder {
  color: var(--text-subtle);
}

.au-search__clear {
  position: absolute;
  right: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--surface-strong);
  color: var(--text-muted);
  cursor: pointer;
  transition: background 0.15s;
}

.au-search__clear svg {
  width: 11px;
  height: 11px;
}

.au-search__clear:hover {
  background: var(--border);
}

/* ─── Stats ────────────────────────────────────── */
.au-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}

.au-stat {
  position: relative;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px 18px;
  display: flex;
  align-items: baseline;
  gap: 10px;
  overflow: hidden;
  transition: box-shadow 0.2s;
}

.au-stat::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--border-strong);
  border-radius: 3px 0 0 3px;
  transition: background 0.2s;
}

.au-stat:hover {
  box-shadow: var(--shadow-sm);
}

.au-stat--accent::before {
  background: var(--accent);
}

.au-stat--warn::before {
  background: var(--warning);
}

.au-stat--primary::before {
  background: var(--primary);
}

.au-stat__num {
  font-size: 24px;
  font-weight: 700;
  color: var(--base-text);
  letter-spacing: -0.03em;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.au-stat--accent .au-stat__num {
  color: var(--accent);
}

.au-stat--warn .au-stat__num {
  color: var(--warning);
}

.au-stat--primary .au-stat__num {
  color: var(--primary);
}

.au-stat__label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-subtle);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

/* ─── Alerts ───────────────────────────────────── */
.au-alert {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 16px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 500;
}

.au-alert--error {
  background: var(--danger-soft);
  color: var(--danger);
  border: 1px solid color-mix(in srgb, var(--danger) 16%, transparent);
}

.au-alert--success {
  background: var(--success-soft);
  color: var(--success);
  border: 1px solid color-mix(in srgb, var(--success) 20%, transparent);
}

.au-alert__icon {
  width: 17px;
  height: 17px;
  flex-shrink: 0;
}

.au-alert-enter-active,
.au-alert-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}

.au-alert-enter-from,
.au-alert-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

/* ─── Table wrapper ────────────────────────────── */
.au-table-wrap {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  overflow: auto;
}

/* ─── Table ────────────────────────────────────── */
.au-table {
  width: 100%;
  border-collapse: collapse;
}

.au-table thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 12px 18px;
  text-align: left;
  font-size: 11px;
  font-weight: 700;
  color: var(--text-subtle);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: var(--surface-muted);
  border-bottom: 1px solid var(--border);
}

.au-table tbody td {
  padding: 12px 18px;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
  vertical-align: middle;
}

.au-table tbody tr:last-child td {
  border-bottom: none;
}

.au-table__row {
  transition: background 0.15s;
}

.au-table__row:hover {
  background: var(--surface-muted);
}

.au-table__row--saving {
  opacity: 0.5;
  pointer-events: none;
}

.au-table__row--off {
  background: repeating-linear-gradient(
    -45deg,
    transparent,
    transparent 8px,
    rgba(0, 0, 0, 0.012) 8px,
    rgba(0, 0, 0, 0.012) 16px
  );
}

/* ─── User cell ────────────────────────────────── */
.au-user {
  display: flex;
  align-items: center;
  gap: 10px;
}

.au-user__avatar {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  background: linear-gradient(135deg, var(--primary-soft), color-mix(in srgb, var(--primary) 18%, transparent));
  color: var(--primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  flex-shrink: 0;
}

.au-user__avatar--off {
  background: var(--surface-strong);
  color: var(--text-subtle);
}

.au-user__meta {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.au-user__email {
  font-size: 13px;
  font-weight: 600;
  color: var(--base-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.au-user__id {
  font-size: 11px;
  color: var(--text-subtle);
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ─── Role ─────────────────────────────────────── */
.au-role {
  position: relative;
  display: inline-flex;
}

.au-role__badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 700;
  border-radius: 6px;
  letter-spacing: 0.03em;
  pointer-events: none;
  text-transform: uppercase;
}

.role--user {
  background: var(--surface-strong);
  color: var(--text-muted);
}

.role--admin {
  background: var(--primary-soft);
  color: var(--primary);
}

.au-role__select {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
  font-size: 14px;
}

.au-role__select:disabled {
  cursor: not-allowed;
}

/* ─── Toggle ───────────────────────────────────── */
.au-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  font-family: inherit;
}

.au-toggle:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.au-toggle__track {
  position: relative;
  width: 36px;
  height: 20px;
  border-radius: 10px;
  background: var(--border-strong);
  transition: background 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  flex-shrink: 0;
}

.au-toggle--on .au-toggle__track {
  background: var(--accent);
}

.au-toggle__thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18);
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.au-toggle--on .au-toggle__thumb {
  transform: translateX(16px);
}

.au-toggle__text {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted);
  transition: color 0.2s;
  white-space: nowrap;
}

.au-toggle--on .au-toggle__text {
  color: var(--accent);
}

/* ─── Date ─────────────────────────────────────── */
.au-date {
  font-size: 12px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* ─── Inline action button ─────────────────────── */
.au-btn-inline {
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  color: var(--primary);
  background: var(--primary-soft);
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
  white-space: nowrap;
}

.au-btn-inline:hover:not(:disabled) {
  background: color-mix(in srgb, var(--primary) 18%, transparent);
}

.au-btn-inline:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ─── Profile cell ─────────────────────────────── */
.au-profile {
  min-width: 200px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.au-profile__info {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.au-profile__name {
  font-size: 13px;
  font-weight: 500;
  color: var(--base-text);
}

.au-profile__pos {
  font-size: 11px;
  color: var(--text-subtle);
}

.au-profile__form {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.au-profile__actions {
  display: flex;
  gap: 5px;
  padding-top: 2px;
}

/* ─── Password cell ────────────────────────────── */
.au-pwd {
  min-width: 160px;
}

.au-pwd__form {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.au-pwd__actions {
  display: flex;
  gap: 5px;
}

/* ─── Empty / loading ──────────────────────────── */
.au-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 56px 20px;
  color: var(--text-subtle);
  font-size: 13px;
}

.au-empty__icon {
  width: 48px;
  height: 48px;
  color: var(--text-subtle);
}

.au-spinner {
  width: 22px;
  height: 22px;
  border: 2.5px solid var(--border);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: au-spin 0.7s linear infinite;
}

@keyframes au-spin {
  to {
    transform: rotate(360deg);
  }
}

/* ─── Row transitions ──────────────────────────── */
.au-row-enter-active {
  transition: all 0.3s ease;
}

.au-row-leave-active {
  transition: all 0.2s ease;
}

.au-row-enter-from {
  opacity: 0;
  transform: translateY(-6px);
}

.au-row-leave-to {
  opacity: 0;
}

/* ─── Responsive ───────────────────────────────── */
@media (max-width: 768px) {
  .au__header {
    flex-direction: column;
    gap: 14px;
  }

  .au-search {
    width: 100%;
  }

  .au-search__input {
    width: 100%;
  }

  .au-stats {
    grid-template-columns: repeat(2, 1fr);
  }

  .au-table-wrap {
    overflow: auto;
  }

  .au-table {
    min-width: 1080px;
  }
}
</style>
