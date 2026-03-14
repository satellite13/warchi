<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { apiGet, apiPut } from "../composables/useApi";
import type { PaginatedResponse, User, UserRole } from "../types/entities";
import { formatDate } from "../utils/formatDate";
import { normalizeUserRole } from "../utils/userRole";

type EditableUser = User & {
  role: UserRole;
  isActive: boolean;
};

type UserUpdatePayload = {
  email?: string;
  attrs?: string | null;
  role?: UserRole;
  isActive?: boolean;
  password?: string;
  firstName?: string;
  lastName?: string;
  middleName?: string;
  position?: string;
};

const users = ref<EditableUser[]>([]);
const { t, locale } = useI18n();
const isLoading = ref(false);
const isSavingId = ref<string | null>(null);
const errorMessage = ref<string | null>(null);
const successMessage = ref<string | null>(null);
const searchEmail = ref("");
const passwordEditId = ref<string | null>(null);
const passwordDraft = ref<Record<string, string>>({});
const profileEditId = ref<string | null>(null);
const profileDraft = ref<
  Record<string, { firstName: string; lastName: string; middleName: string; position: string }>
>({});

const roleOptions: UserRole[] = ["USER", "ADMIN"];

const roleMeta: Record<UserRole, { label: string; cls: string }> = {
  USER: { label: "User", cls: "role--user" },
  ADMIN: { label: "Admin", cls: "role--admin" },
};

const stats = computed(() => {
  const total = users.value.length;
  const active = users.value.filter((u) => u.isActive).length;
  const admins = users.value.filter((u) => u.role === "ADMIN").length;
  return { total, active, inactive: total - active, admins };
});

const normalizeUser = (raw: User): EditableUser => ({
  ...raw,
  role: normalizeUserRole(raw.role),
  isActive: raw.isActive ?? true,
});

const loadUsers = async (): Promise<void> => {
  isLoading.value = true;
  errorMessage.value = null;
  successMessage.value = null;

  const query = new URLSearchParams({
    page: "0",
    size: "200",
    sort: "email,asc",
  });

  if (searchEmail.value.trim()) {
    query.set("email", searchEmail.value.trim());
  }

  const result = await apiGet<PaginatedResponse<User>>(`/users?${query.toString()}`);

  isLoading.value = false;

  if (!result.success) {
    errorMessage.value = result.error.message;
    users.value = [];
    return;
  }

  const rawUsers = Array.isArray(result.data.content) ? result.data.content : [];
  users.value = rawUsers.map(normalizeUser);
};

const updateUser = async (userId: string, patch: UserUpdatePayload): Promise<void> => {
  isSavingId.value = userId;
  errorMessage.value = null;
  successMessage.value = null;

  const result = await apiPut<EditableUser>(`/users/${userId}`, patch);

  if (!result.success) {
    errorMessage.value = result.error.message;
    isSavingId.value = null;
    return;
  }

  users.value = users.value.map((item) =>
    item.id === userId ? normalizeUser(result.data) : item
  );
  isSavingId.value = null;
};

const handleRoleChange = async (user: EditableUser, event: Event): Promise<void> => {
  const target = event.target as HTMLSelectElement;
  const role = target.value as UserRole;
  if (!roleOptions.includes(role)) return;
  await updateUser(user.id, { role });
};

const handleActiveToggle = async (user: EditableUser): Promise<void> => {
  await updateUser(user.id, { isActive: !user.isActive });
};

const fullName = (user: EditableUser): string => {
  const parts = [user.lastName, user.firstName, user.middleName]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" ") : t("adminUsers.profileNotFilled");
};

const openProfileEdit = (user: EditableUser): void => {
  profileEditId.value = user.id;
  profileDraft.value[user.id] = {
    firstName: user.firstName?.trim() ?? "",
    lastName: user.lastName?.trim() ?? "",
    middleName: user.middleName?.trim() ?? "",
    position: user.position?.trim() ?? ""
  };
  errorMessage.value = null;
  successMessage.value = null;
};

const closeProfileEdit = (): void => {
  if (!profileEditId.value) return;
  delete profileDraft.value[profileEditId.value];
  profileEditId.value = null;
};

const getProfileDraft = (userId: string) => {
  if (!profileDraft.value[userId]) {
    profileDraft.value[userId] = {
      firstName: "",
      lastName: "",
      middleName: "",
      position: ""
    };
  }
  return profileDraft.value[userId];
};

const submitProfileChange = async (user: EditableUser): Promise<void> => {
  const draft = profileDraft.value[user.id];
  if (!draft) return;

  const firstName = draft.firstName.trim();
  const lastName = draft.lastName.trim();
  const middleName = draft.middleName.trim();
  const position = draft.position.trim();

  if (!firstName) {
    errorMessage.value = t("auth.validationFirstNameRequired");
    return;
  }
  if (!lastName) {
    errorMessage.value = t("auth.validationLastNameRequired");
    return;
  }

  await updateUser(user.id, {
    firstName,
    lastName,
    middleName,
    position
  });

  if (isSavingId.value === null && !errorMessage.value) {
    successMessage.value = t("adminUsers.profileUpdated", { email: user.email });
    closeProfileEdit();
  }
};

const openPasswordEdit = (userId: string): void => {
  passwordEditId.value = userId;
  passwordDraft.value[userId] = "";
  errorMessage.value = null;
  successMessage.value = null;
};

const closePasswordEdit = (): void => {
  if (!passwordEditId.value) return;
  delete passwordDraft.value[passwordEditId.value];
  passwordEditId.value = null;
};

const submitPasswordChange = async (user: EditableUser): Promise<void> => {
  const nextPassword = (passwordDraft.value[user.id] ?? "").trim();
  if (nextPassword.length < 6) {
    errorMessage.value = t("adminUsers.passwordMinLength");
    return;
  }

  await updateUser(user.id, { password: nextPassword });
  if (isSavingId.value === null && !errorMessage.value) {
    successMessage.value = t("adminUsers.passwordUpdated", { email: user.email });
    closePasswordEdit();
  }
};

const clearSearch = () => {
  searchEmail.value = "";
  loadUsers();
};

onMounted(() => {
  loadUsers();
});
</script>

<template>
  <div class="admin-users-content">
    <!-- Title bar -->
      <div class="title-bar">
        <div>
          <h1 class="title-bar__heading">{{ t("adminUsers.title") }}</h1>
          <p class="title-bar__sub">{{ t("adminUsers.subtitle") }}</p>
        </div>

        <form class="search" @submit.prevent="loadUsers">
          <div class="search__field">
            <svg class="search__icon" viewBox="0 0 20 20" fill="none">
              <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" stroke-width="1.5" />
              <path d="M13 13l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            </svg>
            <input
              v-model="searchEmail"
              class="search__input"
              type="text"
              :placeholder="t('adminUsers.searchByEmail')"
              :disabled="isLoading"
            >
            <button
              v-if="searchEmail"
              type="button"
              class="search__clear"
              @click="clearSearch"
            >
              <svg viewBox="0 0 16 16" fill="none">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
              </svg>
            </button>
          </div>
          <button type="submit" class="btn btn--primary btn--sm" :disabled="isLoading">{{ t("common.find") }}</button>
        </form>
      </div>

      <!-- Stats -->
      <div class="stats-row">
        <div class="stat">
          <span class="stat__value">{{ stats.total }}</span>
          <span class="stat__label">{{ t("adminUsers.total") }}</span>
        </div>
        <div class="stat stat--accent">
          <span class="stat__value">{{ stats.active }}</span>
          <span class="stat__label">{{ t("adminUsers.active") }}</span>
        </div>
        <div class="stat stat--warn">
          <span class="stat__value">{{ stats.inactive }}</span>
          <span class="stat__label">{{ t("adminUsers.inactive") }}</span>
        </div>
        <div class="stat stat--purple">
          <span class="stat__value">{{ stats.admins }}</span>
          <span class="stat__label">{{ t("adminUsers.admins") }}</span>
        </div>
      </div>

      <!-- Error -->
      <Transition name="fade">
        <div v-if="errorMessage" class="alert alert--error">
          <svg class="alert__icon" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="1.5" />
            <path d="M10 6v5M10 13.5v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
          {{ errorMessage }}
        </div>
      </Transition>
      <Transition name="fade">
        <div v-if="successMessage" class="alert alert--success">
          <svg class="alert__icon" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="1.5" />
            <path d="M6.5 10.5l2.3 2.3 4.8-5.3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
          {{ successMessage }}
        </div>
      </Transition>

      <!-- Table card -->
      <div class="table-card">
        <!-- Loading -->
        <div v-if="isLoading" class="empty-state">
          <div class="spinner"></div>
          <span>{{ t("adminUsers.loadingUsers") }}</span>
        </div>

        <!-- Empty -->
        <div v-else-if="users.length === 0" class="empty-state">
          <svg class="empty-state__icon" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="20" stroke="currentColor" stroke-width="1.5" opacity="0.3" />
            <circle cx="24" cy="20" r="6" stroke="currentColor" stroke-width="1.5" />
            <path d="M12 40c0-6.627 5.373-12 12-12s12 5.373 12 12" stroke="currentColor" stroke-width="1.5" />
          </svg>
          <span>{{ t("adminUsers.usersNotFound") }}</span>
        </div>

        <!-- Table -->
        <table v-else class="table">
          <thead>
            <tr>
              <th>{{ t("adminUsers.user") }}</th>
              <th>{{ t("adminUsers.role") }}</th>
              <th>{{ t("adminUsers.status") }}</th>
              <th>{{ t("adminUsers.updated") }}</th>
              <th>{{ t("adminUsers.profile") }}</th>
              <th>{{ t("adminUsers.password") }}</th>
            </tr>
          </thead>
          <TransitionGroup tag="tbody" name="row">
            <tr
              v-for="user in users"
              :key="user.id"
              class="table__row"
              :class="{ 'table__row--saving': isSavingId === user.id, 'table__row--inactive': !user.isActive }"
            >
              <td>
                <div class="user-cell">
                  <div class="user-cell__avatar" :class="{ 'user-cell__avatar--off': !user.isActive }">
                    {{ user.email.charAt(0).toUpperCase() }}
                  </div>
                  <div class="user-cell__info">
                    <span class="user-cell__email">{{ user.email }}</span>
                    <span class="user-cell__id">{{ user.id }}</span>
                  </div>
                </div>
              </td>
              <td>
                <div class="role-wrap">
                  <span class="role-badge" :class="roleMeta[user.role].cls">
                    {{ roleMeta[user.role].label }}
                  </span>
                  <select
                    class="role-select"
                    :value="user.role"
                    :disabled="isSavingId === user.id"
                    @change="handleRoleChange(user, $event)"
                  >
                    <option v-for="role in roleOptions" :key="role" :value="role">{{ role }}</option>
                  </select>
                </div>
              </td>
              <td>
                <button
                  type="button"
                  class="toggle"
                  :class="{ 'toggle--on': user.isActive }"
                  :disabled="isSavingId === user.id"
                  @click="handleActiveToggle(user)"
                >
                  <span class="toggle__track">
                    <span class="toggle__thumb"></span>
                  </span>
                  <span class="toggle__label">{{ user.isActive ? t("adminUsers.statusActive") : t("adminUsers.statusBlocked") }}</span>
                </button>
              </td>
              <td class="date-cell">{{ formatDate(user.updatedAt, locale, false) }}</td>
              <td>
                <div class="profile-cell">
                  <template v-if="profileEditId !== user.id">
                    <div class="profile-meta">
                      <span class="profile-meta__name">{{ fullName(user) }}</span>
                      <span class="profile-meta__position">{{ user.position || t("common.loadingDash") }}</span>
                    </div>
                    <button
                      type="button"
                      class="btn btn--ghost btn--sm"
                      :disabled="isSavingId === user.id"
                      @click="openProfileEdit(user)"
                    >
                      {{ t("common.edit") }}
                    </button>
                  </template>

                  <form
                    v-else
                    class="profile-form"
                    @submit.prevent="submitProfileChange(user)"
                  >
                    <input
                      v-model="getProfileDraft(user.id).lastName"
                      class="form-input form-input--compact"
                      type="text"
                      :placeholder="t('auth.labelLastName')"
                      :disabled="isSavingId === user.id"
                    >
                    <input
                      v-model="getProfileDraft(user.id).firstName"
                      class="form-input form-input--compact"
                      type="text"
                      :placeholder="t('auth.labelFirstName')"
                      :disabled="isSavingId === user.id"
                    >
                    <input
                      v-model="getProfileDraft(user.id).middleName"
                      class="form-input form-input--compact"
                      type="text"
                      :placeholder="t('profile.middleName')"
                      :disabled="isSavingId === user.id"
                    >
                    <input
                      v-model="getProfileDraft(user.id).position"
                      class="form-input form-input--compact"
                      type="text"
                      :placeholder="t('profile.position')"
                      :disabled="isSavingId === user.id"
                    >
                    <div class="profile-form__actions">
                      <button type="submit" class="btn btn--primary btn--xs" :disabled="isSavingId === user.id">
                        {{ t("common.save") }}
                      </button>
                      <button type="button" class="btn btn--ghost btn--xs" :disabled="isSavingId === user.id" @click="closeProfileEdit">
                        {{ t("common.cancel") }}
                      </button>
                    </div>
                  </form>
                </div>
              </td>
              <td>
                <div class="password-cell">
                  <button
                    v-if="passwordEditId !== user.id"
                    type="button"
                    class="btn btn--ghost btn--sm"
                    :disabled="isSavingId === user.id"
                    @click="openPasswordEdit(user.id)"
                  >
                    {{ t("adminUsers.changePassword") }}
                  </button>

                  <form
                    v-else
                    class="password-form"
                    @submit.prevent="submitPasswordChange(user)"
                  >
                    <input
                      v-model="passwordDraft[user.id]"
                      class="form-input form-input--compact"
                      type="password"
                      :placeholder="t('adminUsers.newPassword')"
                      minlength="6"
                      :disabled="isSavingId === user.id"
                    >
                    <div class="password-form__actions">
                      <button
                        type="submit"
                        class="btn btn--primary btn--xs"
                        :disabled="isSavingId === user.id"
                      >
                        {{ t("common.save") }}
                      </button>
                      <button
                        type="button"
                        class="btn btn--ghost btn--xs"
                        :disabled="isSavingId === user.id"
                        @click="closePasswordEdit"
                      >
                        {{ t("common.cancel") }}
                      </button>
                    </div>
                  </form>
                </div>
              </td>
            </tr>
          </TransitionGroup>
        </table>
      </div>
  </div>
</template>

<style scoped>
/* ─── Content (used inside AdminLayout) ────────── */
.admin-users-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-height: 0;
}

/* ─── Title bar ───────────────────────────────── */
.title-bar {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20px;
}

.title-bar__heading {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  color: var(--base-text);
  letter-spacing: -0.03em;
}

.title-bar__sub {
  margin: 4px 0 0;
  font-size: 14px;
  color: var(--text-muted);
}

/* ─── Search ──────────────────────────────────── */
.search {
  display: flex;
  gap: 8px;
  align-items: center;
}

.search__field {
  position: relative;
  display: flex;
  align-items: center;
}

.search__icon {
  position: absolute;
  left: 12px;
  width: 16px;
  height: 16px;
  color: var(--text-subtle);
  pointer-events: none;
}

.search__input {
  width: 240px;
  padding: 9px 32px 9px 36px;
  font-size: 14px;
  font-family: inherit;
  border: 1.5px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  color: var(--base-text);
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.search__input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-soft);
}

.search__input::placeholder {
  color: var(--text-subtle);
}

.search__clear {
  position: absolute;
  right: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--surface-strong);
  color: var(--text-muted);
  cursor: pointer;
  transition: background 0.15s;
}

.search__clear svg {
  width: 12px;
  height: 12px;
}

.search__clear:hover {
  background: var(--border);
}


/* ─── Stats row ───────────────────────────────── */
.stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.stat {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  transition: box-shadow 0.2s;
}

.stat:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
}

.stat__value {
  font-size: 26px;
  font-weight: 700;
  color: var(--base-text);
  letter-spacing: -0.03em;
  line-height: 1.2;
}

.stat__label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-subtle);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.stat--accent .stat__value { color: var(--accent); }
.stat--warn .stat__value { color: var(--warning); }
.stat--purple .stat__value { color: var(--primary); }

/* ─── Alert ───────────────────────────────────── */
.alert {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 500;
}

.alert--error {
  background: var(--danger-soft);
  color: var(--danger);
  border: 1px solid rgba(220, 53, 69, 0.12);
}

.alert--success {
  background: color-mix(in srgb, var(--success) 14%, transparent);
  color: var(--success);
  border: 1px solid color-mix(in srgb, var(--success) 28%, transparent);
}

.alert__icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

/* ─── Table card ──────────────────────────────── */
.table-card {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  overflow: auto;
}

/* ─── Table ───────────────────────────────────── */
.table {
  width: 100%;
  border-collapse: collapse;
}

.table thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 14px 20px;
  text-align: left;
  font-size: 11px;
  font-weight: 700;
  color: var(--text-subtle);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  background: var(--surface-muted);
  border-bottom: 1px solid var(--border);
  box-shadow: 0 1px 0 var(--border);
}

.table tbody td {
  padding: 14px 20px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.04);
  vertical-align: middle;
}

.table tbody tr:last-child td {
  border-bottom: none;
}

.table__row {
  transition: background 0.2s, opacity 0.3s;
}

.table__row:hover {
  background: var(--surface-muted);
}

.table__row--saving {
  opacity: 0.55;
  pointer-events: none;
}

.table__row--inactive {
  background: repeating-linear-gradient(
    -45deg,
    transparent,
    transparent 8px,
    rgba(0, 0, 0, 0.008) 8px,
    rgba(0, 0, 0, 0.008) 16px
  );
}

/* ─── User cell ───────────────────────────────── */
.user-cell {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-cell__avatar {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--primary-soft);
  color: var(--primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 700;
  flex-shrink: 0;
  transition: background 0.2s, color 0.2s;
}

.user-cell__avatar--off {
  background: var(--surface-strong);
  color: var(--text-subtle);
}

.user-cell__info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.user-cell__email {
  font-size: 14px;
  font-weight: 600;
  color: var(--base-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-cell__id {
  font-size: 11px;
  color: var(--text-subtle);
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ─── Role ────────────────────────────────────── */
.role-wrap {
  position: relative;
  display: inline-flex;
}

.role-badge {
  display: inline-flex;
  align-items: center;
  padding: 5px 12px;
  font-size: 12px;
  font-weight: 700;
  border-radius: 8px;
  letter-spacing: 0.03em;
  pointer-events: none;
}

.role--user {
  background: var(--surface-strong);
  color: var(--text-muted);
}

.role--admin {
  background: var(--primary-soft);
  color: var(--primary);
}

.role-select {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
  font-size: 14px;
}

.role-select:disabled {
  cursor: not-allowed;
}

/* ─── Toggle ──────────────────────────────────── */
.toggle {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  font-family: inherit;
}

.toggle:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.toggle__track {
  position: relative;
  width: 38px;
  height: 22px;
  border-radius: 11px;
  background: var(--border-strong);
  transition: background 0.25s ease;
  flex-shrink: 0;
}

.toggle--on .toggle__track {
  background: var(--accent);
}

.toggle__thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
  transition: transform 0.25s ease;
}

.toggle--on .toggle__thumb {
  transform: translateX(16px);
}

.toggle__label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-muted);
  transition: color 0.2s;
}

.toggle--on .toggle__label {
  color: var(--accent);
}

/* ─── Date cell ───────────────────────────────── */
.date-cell {
  font-size: 13px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.password-cell {
  min-width: 180px;
}

.profile-cell {
  min-width: 220px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.profile-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.profile-meta__name {
  font-size: 13px;
  font-weight: 600;
  color: var(--base-text);
}

.profile-meta__position {
  font-size: 12px;
  color: var(--text-muted);
}

.profile-form {
  display: flex;
  flex-direction: column;
  gap: 6px;
}


.profile-form__actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.password-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}


.password-form__actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

/* ─── Empty / loading ─────────────────────────── */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 56px 20px;
  color: var(--text-subtle);
  font-size: 14px;
}

.empty-state__icon {
  width: 48px;
  height: 48px;
  color: var(--text-subtle);
}

.spinner {
  width: 24px;
  height: 24px;
  border: 2.5px solid var(--border);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ─── Transitions ─────────────────────────────── */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.row-enter-active {
  transition: all 0.3s ease;
}

.row-leave-active {
  transition: all 0.2s ease;
}

.row-enter-from {
  opacity: 0;
  transform: translateY(-8px);
}

.row-leave-to {
  opacity: 0;
}

/* ─── Responsive ──────────────────────────────── */
@media (max-width: 768px) {
  .admin-users-content {
    padding: 0;
  }

  .title-bar {
    flex-direction: column;
    gap: 16px;
  }

  .search {
    width: 100%;
  }

  .search__input {
    width: 100%;
  }

  .stats-row {
    grid-template-columns: repeat(2, 1fr);
  }

  .table-card {
    overflow: auto;
  }

  .table {
    min-width: 1080px;
  }
}
</style>
