<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import BaseModal from "./BaseModal.vue";
import ShareGrantForm from "./ShareGrantForm.vue";
import { useAccessShares } from "../../composables/useAccessShares";
import { useUserSearch } from "../../composables/useUserSearch";
import type { SharePermission, ShareResourceType } from "../../types/api";

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

const {
  userSearchEmail,
  searchError,
  selectedUser,
  searchResults,
  searchPerformed,
  searchUsers: doSearchUsers,
  selectUser,
  resetSearch,
} = useUserSearch();

const selectedPermission = ref<SharePermission>("VIEW");
const shareWithAllUsers = ref(false);

const canSubmit = computed(
  () => (shareWithAllUsers.value || selectedUser.value !== null) && !isSubmitting.value
);

const load = async () => {
  await loadShares(props.resourceType, props.resourceId);
};

const searchUsers = async (): Promise<void> => {
  if (shareWithAllUsers.value) return;
  await doSearchUsers();
};

const submitShare = async () => {
  if (!canSubmit.value) return;
  const user = selectedUser.value;
  if (!shareWithAllUsers.value && !user) return;

  const ok = await grantShare({
    resourceType: props.resourceType,
    resourceId: props.resourceId,
    granteeUserId: shareWithAllUsers.value ? null : user?.id,
    permission: selectedPermission.value
  });
  if (ok) {
    resetSearch();
    selectedPermission.value = "VIEW";
    shareWithAllUsers.value = false;
  }
};

const revoke = async (shareId: string) => {
  await revokeShare(props.resourceType, props.resourceId, shareId);
};

watch(shareWithAllUsers, (enabled) => {
  if (!enabled) return;
  resetSearch();
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
        <ShareGrantForm
          v-model:share-with-all-users="shareWithAllUsers"
          v-model:user-search-email="userSearchEmail"
          v-model:selected-permission="selectedPermission"
          :selected-user="selectedUser"
          :search-results="searchResults"
          :search-performed="searchPerformed"
          :search-error="searchError"
          :error-message="errorMessage"
          :disabled="isSubmitting"
          @search="searchUsers"
          @select-user="selectUser"
        />
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
              class="btn btn--soft-danger"
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
      <button
        type="button"
        class="btn btn--secondary"
        @click="emit('close')"
      >
        {{ t("common.close") }}
      </button>
      <button
        type="submit"
        class="btn btn--primary"
        :disabled="!canSubmit"
        @click="submitShare"
      >
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
</style>
