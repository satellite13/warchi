<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { useI18n } from "vue-i18n"
import { DEFAULT_ENTITY_ICONS } from "@/config/iconOptions"
import BaseModal from "./BaseModal.vue"
import ShareGrantForm from "./ShareGrantForm.vue"
import { apiPost } from "../../composables/useApi"
import { useUserSearch } from "../../composables/useUserSearch"
import type { SharePermission, ShareResourceType, AccessShareRequest, AccessShareResponse } from "../../types/api"

export interface BatchShareItem {
  id: string
  name: string
  resourceType: ShareResourceType
}

const props = defineProps<{
  items: BatchShareItem[]
}>()

const emit = defineEmits<{
  close: []
  done: []
}>()

const { t } = useI18n()

const {
  userSearchEmail,
  searchError,
  selectedUser,
  searchResults,
  searchPerformed,
  searchUsers: doSearchUsers,
  selectUser,
  resetSearch,
} = useUserSearch()

const selectedPermission = ref<SharePermission>("VIEW")
const shareWithAllUsers = ref(false)

type BatchState = "form" | "progress" | "done"

const batchState = ref<BatchState>("form")
const progressDone = ref(0)
const progressTotal = ref(0)
const resultSuccess = ref(0)
const resultFailed = ref(0)
const errorMessage = ref<string | null>(null)

const canSubmit = computed(
  () => (shareWithAllUsers.value || selectedUser.value !== null) && batchState.value === "form"
)

const searchUsers = async (): Promise<void> => {
  if (shareWithAllUsers.value) return
  await doSearchUsers()
}

const submitBatch = async () => {
  if (!canSubmit.value) return

  batchState.value = "progress"
  progressTotal.value = props.items.length
  progressDone.value = 0
  resultSuccess.value = 0
  resultFailed.value = 0
  errorMessage.value = null

  const granteeUserId = shareWithAllUsers.value ? null : selectedUser.value?.id
  const permission = selectedPermission.value

  const results = await Promise.allSettled(
    props.items.map(async (item) => {
      const payload: AccessShareRequest = {
        resourceType: item.resourceType,
        resourceId: item.id,
        granteeUserId: granteeUserId ?? null,
        permission
      }
      const result = await apiPost<AccessShareResponse>("/access/shares", payload)
      progressDone.value++
      if (!result.success) {
        throw new Error(result.error.message)
      }
      return result.data
    })
  )

  resultSuccess.value = results.filter(r => r.status === "fulfilled").length
  resultFailed.value = results.filter(r => r.status === "rejected").length
  batchState.value = "done"
}

const handleClose = () => {
  if (batchState.value === "done") {
    emit("done")
  }
  emit("close")
}

watch(shareWithAllUsers, (enabled) => {
  if (!enabled) return
  resetSearch()
})
</script>

<template>
  <BaseModal :title="t('share.batchShareTitle')" max-width="640px" @close="handleClose">
    <div class="batch-share">
      <!-- Items list -->
      <div class="batch-share__block">
        <h4 class="batch-share__subtitle">{{ t("share.batchShareHint") }}</h4>
        <div class="batch-share__items">
          <div v-for="item in items" :key="item.id" class="batch-share__item">
            <UiIcon :name="item.resourceType === 'LINK_TYPE' ? DEFAULT_ENTITY_ICONS.link : DEFAULT_ENTITY_ICONS.nodeType" class="batch-share__item-icon" />
            <span class="batch-share__item-name">{{ item.name }}</span>
          </div>
        </div>
      </div>

      <!-- Form (visible in "form" state) -->
      <template v-if="batchState === 'form'">
        <div class="batch-share__block">
          <ShareGrantForm
            v-model:share-with-all-users="shareWithAllUsers"
            v-model:user-search-email="userSearchEmail"
            v-model:selected-permission="selectedPermission"
            :selected-user="selectedUser"
            :search-results="searchResults"
            :search-performed="searchPerformed"
            :search-error="searchError"
            :error-message="errorMessage"
            @search="searchUsers"
            @select-user="selectUser"
          />
        </div>
      </template>

      <!-- Progress -->
      <div v-else-if="batchState === 'progress'" class="batch-share__progress">
        <div class="batch-share__progress-bar">
          <div
            class="batch-share__progress-fill"
            :style="{ width: `${progressTotal > 0 ? (progressDone / progressTotal) * 100 : 0}%` }"
          />
        </div>
        <span class="batch-share__progress-text">
          {{ t("share.batchShareProgress", { done: progressDone, total: progressTotal }) }}
        </span>
      </div>

      <!-- Done -->
      <div v-else-if="batchState === 'done'" class="batch-share__done">
        <UiIcon
          :name="resultFailed === 0 ? 'check_circle' : 'warning'"
          class="batch-share__done-icon"
          :class="resultFailed === 0 ? 'batch-share__done-icon--success' : 'batch-share__done-icon--warning'"
        />
        <span>{{ t("share.batchShareDone", { success: resultSuccess, failed: resultFailed }) }}</span>
      </div>
    </div>

    <template #footer>
      <button
        type="button"
        class="btn btn--secondary"
        @click="handleClose"
      >
        {{ t("common.close") }}
      </button>
      <button
        v-if="batchState === 'form'"
        type="submit"
        class="btn btn--primary"
        :disabled="!canSubmit"
        @click="submitBatch"
      >
        {{ t("share.batchShareSubmit") }}
      </button>
    </template>
  </BaseModal>
</template>

<style scoped>
.batch-share {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.batch-share__block {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.batch-share__subtitle {
  margin: 0;
  font-size: 14px;
}

.batch-share__items {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-height: 120px;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px;
}

.batch-share__item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 6px;
  background: var(--surface-strong);
  font-size: 12px;
  font-weight: 500;
  color: var(--base-text);
}

.batch-share__item-icon {
  width: 14px;
  height: 14px;
  color: var(--text-subtle);
}

.batch-share__item-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 160px;
}

.batch-share__grid {
  display: grid;
  gap: 8px;
}

.batch-share__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--text-muted);
}

.batch-share__inline {
  display: flex;
  gap: 8px;
}

.batch-share__permission-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 10px;
}

.batch-share__permission-option {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--base-text);
}

.batch-share__error {
  font-size: 12px;
  color: var(--danger);
  background: var(--danger-soft);
  border-radius: 8px;
  padding: 8px;
}

.batch-share__found {
  font-size: 12px;
  color: var(--text-muted);
  background: var(--surface-strong);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px;
}

.batch-share__results {
  border: 1px solid var(--border);
  border-radius: 8px;
  max-height: 160px;
  overflow: auto;
}

.batch-share__user-item {
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

.batch-share__user-item:last-child {
  border-bottom: 0;
}

.batch-share__user-item:hover {
  background: var(--surface-strong);
}

.batch-share__user-item--selected {
  background: color-mix(in srgb, var(--primary) 10%, transparent);
}

.batch-share__empty {
  font-size: 13px;
  color: var(--text-subtle);
}

.batch-share__progress {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px 0;
}

.batch-share__progress-bar {
  height: 6px;
  border-radius: 3px;
  background: var(--surface-strong);
  overflow: hidden;
}

.batch-share__progress-fill {
  height: 100%;
  background: var(--primary);
  border-radius: 3px;
  transition: width 0.2s ease;
}

.batch-share__progress-text {
  font-size: 13px;
  color: var(--text-muted);
  text-align: center;
}

.batch-share__done {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 0;
  font-size: 14px;
  font-weight: 500;
  color: var(--base-text);
}

.batch-share__done-icon {
  width: 24px;
  height: 24px;
}

.batch-share__done-icon--success {
  color: var(--success);
}

.batch-share__done-icon--warning {
  color: var(--warning);
}
</style>
