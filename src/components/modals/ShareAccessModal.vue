<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import BaseModal from "./BaseModal.vue";
import { apiGet } from "../../composables/useApi";
import { useAccessShares } from "../../composables/useAccessShares";
import type { SharePermission, ShareResourceType } from "../../types/api";
import type { PaginatedResponse, UserInfo } from "../../types/entities";

const props = defineProps<{
  title: string;
  resourceType: ShareResourceType;
  resourceId: string;
}>();
const { t } = useI18n();

const emit = defineEmits<{
  close: [];
}>();

const {
  shares,
  isLoading,
  isSubmitting,
  errorMessage,
  loadShares,
  grantShare,
  revokeShare
} = useAccessShares();

const userSearchEmail = ref("");
const searchError = ref<string | null>(null);
const selectedUser = ref<UserInfo | null>(null);
const searchResults = ref<UserInfo[]>([]);
const searchPerformed = ref(false);
const selectedPermission = ref<SharePermission>("VIEW");

const canSubmit = computed(
  () => selectedUser.value !== null && !isSubmitting.value
);

const load = async () => {
  await loadShares(props.resourceType, props.resourceId);
};

const searchUsers = async (): Promise<void> => {
  const email = userSearchEmail.value.trim();
  searchError.value = null;
  searchPerformed.value = true;
  selectedUser.value = null;
  searchResults.value = [];

  if (!email) {
    searchError.value = t("share.enterEmailForSearch");
    return;
  }

  const query = new URLSearchParams({
    page: "0",
    size: "10",
    sort: "email,asc",
    email
  });

  const result = await apiGet<PaginatedResponse<UserInfo>>(`/users/public/search?${query.toString()}`);
  if (!result.success) {
    searchError.value = result.error.message;
    return;
  }

  searchResults.value = Array.isArray(result.data.content) ? result.data.content : [];
};

const submitShare = async () => {
  if (!canSubmit.value) return;
  const user = selectedUser.value;
  if (!user) return;

  const ok = await grantShare({
    resourceType: props.resourceType,
    resourceId: props.resourceId,
    granteeUserId: user.id,
    permission: selectedPermission.value
  });
  if (ok) {
    userSearchEmail.value = "";
    selectedUser.value = null;
    searchResults.value = [];
    searchPerformed.value = false;
    selectedPermission.value = "VIEW";
  }
};

const revoke = async (shareId: string) => {
  await revokeShare(props.resourceType, props.resourceId, shareId);
};

const selectUser = (user: UserInfo) => {
  selectedUser.value = user;
};

watch(userSearchEmail, () => {
  selectedUser.value = null;
  searchError.value = null;
  searchResults.value = [];
  searchPerformed.value = false;
});

watch(
  () => [props.resourceType, props.resourceId] as const,
  () => {
    load();
  }
);

onMounted(load);
</script>

<template>
  <BaseModal :title="title" max-width="640px" @close="emit('close')">
    <div class="share-modal">
      <div class="share-modal__block">
        <h4 class="share-modal__subtitle">{{ t("share.grantAccess") }}</h4>
        <div class="share-modal__grid">
          <label class="share-modal__field">
            <span>{{ t("share.userEmail") }}</span>
            <div class="share-modal__inline">
              <input
                v-model="userSearchEmail"
                class="share-modal__input"
                type="text"
                placeholder="user@example.com"
                :disabled="isSubmitting"
              >
              <button
                type="button"
                class="btn btn--secondary"
                :disabled="isSubmitting || userSearchEmail.trim().length === 0"
                @click="searchUsers"
              >
                {{ t("common.find") }}
              </button>
            </div>
          </label>
          <label class="share-modal__field">
            <span>{{ t("share.accessLevel") }}</span>
            <div class="share-modal__permission-group">
              <label class="share-modal__permission-option">
                <input
                  v-model="selectedPermission"
                  type="radio"
                  value="VIEW"
                  :disabled="isSubmitting"
                >
                <span>{{ t("share.viewOnly") }}</span>
              </label>
              <label class="share-modal__permission-option">
                <input
                  v-model="selectedPermission"
                  type="radio"
                  value="EDIT"
                  :disabled="isSubmitting"
                >
                <span>{{ t("share.edit") }}</span>
              </label>
            </div>
          </label>
        </div>

        <div v-if="selectedUser" class="share-modal__found">
          {{ t("share.userFound") }}: <strong>{{ selectedUser.email }}</strong>
        </div>
        <div v-if="searchError" class="share-modal__error">{{ searchError }}</div>
        <div v-else-if="searchPerformed && searchResults.length === 0" class="share-modal__empty">
          {{ t("share.usersNotFound") }}
        </div>
        <div v-else-if="searchResults.length > 0" class="share-modal__results">
          <button
            v-for="user in searchResults"
            :key="user.id"
            type="button"
            class="share-modal__user-item"
            :class="{ 'share-modal__user-item--selected': selectedUser?.id === user.id }"
            @click="selectUser(user)"
          >
            <strong>{{ user.email }}</strong>
            <small v-if="user.firstName || user.lastName">
              {{ [user.lastName, user.firstName, user.middleName].filter(Boolean).join(" ") }}
            </small>
          </button>
        </div>
        <div v-if="errorMessage" class="share-modal__error">{{ errorMessage }}</div>
      </div>

      <div class="share-modal__block">
        <h4 class="share-modal__subtitle">{{ t("share.currentAccess") }}</h4>
        <div v-if="isLoading" class="share-modal__empty">{{ t("common.loading") }}</div>
        <div v-else-if="shares.length === 0" class="share-modal__empty">{{ t("share.noAccessGranted") }}</div>
        <ul v-else class="share-modal__list">
          <li v-for="share in shares" :key="share.id" class="share-modal__list-item">
            <div class="share-modal__meta">
              <strong>{{ share.granteeDisplayName }}</strong>
              <small>{{ t("share.levelLabel") }}: {{ share.permissionLabel }}</small>
              <small>{{ t("share.grantedByLabel") }}: {{ share.grantedByDisplayName }}</small>
            </div>
            <button
              type="button"
              class="btn btn--danger"
              :disabled="isSubmitting"
              @click="revoke(share.id)"
            >
              {{ t("share.revoke") }}
            </button>
          </li>
        </ul>
      </div>
    </div>
    <template #footer>
      <button type="button" class="btn btn--secondary" @click="emit('close')">{{ t("common.close") }}</button>
      <button type="button" class="btn btn--primary" :disabled="!canSubmit" @click="submitShare">
        {{ t("share.grantAccess") }}
      </button>
    </template>
  </BaseModal>
</template>

<style scoped>
.share-modal {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.share-modal__block {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.share-modal__subtitle {
  margin: 0;
  font-size: 14px;
}

.share-modal__grid {
  display: grid;
  gap: 8px;
}

.share-modal__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--text-muted);
}

.share-modal__input {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 13px;
}

.share-modal__inline {
  display: flex;
  gap: 8px;
}

.share-modal__permission-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 10px;
}

.share-modal__permission-option {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--base-text);
}

.share-modal__error {
  font-size: 12px;
  color: var(--danger);
  background: var(--danger-soft);
  border-radius: 8px;
  padding: 8px;
}

.share-modal__found {
  font-size: 12px;
  color: var(--text-muted);
  background: var(--surface-strong);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px;
}

.share-modal__results {
  border: 1px solid var(--border);
  border-radius: 8px;
  max-height: 220px;
  overflow: auto;
}

.share-modal__user-item {
  width: 100%;
  border: 0;
  border-bottom: 1px solid var(--border);
  background: transparent;
  text-align: left;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  cursor: pointer;
}

.share-modal__user-item:last-child {
  border-bottom: 0;
}

.share-modal__user-item:hover {
  background: var(--surface-strong);
}

.share-modal__user-item--selected {
  background: color-mix(in srgb, var(--primary) 10%, transparent);
}

.share-modal__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.share-modal__list-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 10px;
}

.share-modal__meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.share-modal__empty {
  font-size: 13px;
  color: var(--text-subtle);
}

.btn {
  border: none;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 13px;
  cursor: pointer;
}

.btn--primary {
  background: var(--primary);
  color: #fff;
}

.btn--secondary {
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-muted);
}

.btn--danger {
  background: var(--danger-soft);
  color: var(--danger);
}
</style>
