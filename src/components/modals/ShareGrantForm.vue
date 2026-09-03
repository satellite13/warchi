<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { SharePermission } from '@/types/api'
import type { UserInfo } from '@/types/entities'

defineProps<{
  shareWithAllUsers: boolean
  userSearchEmail: string
  selectedPermission: SharePermission
  selectedUser: UserInfo | null
  searchResults: UserInfo[]
  searchPerformed: boolean
  searchError: string | null
  errorMessage?: string | null
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:shareWithAllUsers': [value: boolean]
  'update:userSearchEmail': [value: string]
  'update:selectedPermission': [value: SharePermission]
  search: []
  selectUser: [user: UserInfo]
}>()

const { t } = useI18n()
</script>

<template>
  <div class="share-grant">
    <h4 class="share-grant__subtitle">{{ t('share.grantAccess') }}</h4>
    <div class="share-grant__grid">
      <label class="share-grant__field">
        <span>{{ t('share.scope') }}</span>
        <label class="share-grant__permission-option">
          <input
            type="checkbox"
            :checked="shareWithAllUsers"
            :disabled="disabled"
            @change="emit('update:shareWithAllUsers', ($event.target as HTMLInputElement).checked)"
          />
          <span>{{ t('share.allUsers') }}</span>
        </label>
      </label>
      <label class="share-grant__field">
        <span>{{ t('share.userEmail') }}</span>
        <div class="share-grant__inline">
          <input
            class="form-input"
            type="text"
            placeholder="user@example.com"
            :value="userSearchEmail"
            :disabled="disabled || shareWithAllUsers"
            @input="emit('update:userSearchEmail', ($event.target as HTMLInputElement).value)"
          />
          <button
            type="button"
            class="btn btn--secondary"
            :disabled="disabled || shareWithAllUsers || userSearchEmail.trim().length === 0"
            @click="emit('search')"
          >
            {{ t('common.find') }}
          </button>
        </div>
      </label>
      <label class="share-grant__field">
        <span>{{ t('share.accessLevel') }}</span>
        <div class="share-grant__permission-group">
          <label class="share-grant__permission-option">
            <input
              type="radio"
              value="VIEW"
              :checked="selectedPermission === 'VIEW'"
              :disabled="disabled"
              @change="emit('update:selectedPermission', 'VIEW')"
            />
            <span>{{ t('share.viewOnly') }}</span>
          </label>
          <label class="share-grant__permission-option">
            <input
              type="radio"
              value="EDIT"
              :checked="selectedPermission === 'EDIT'"
              :disabled="disabled"
              @change="emit('update:selectedPermission', 'EDIT')"
            />
            <span>{{ t('share.edit') }}</span>
          </label>
        </div>
      </label>
    </div>

    <div v-if="shareWithAllUsers" class="share-grant__found">
      {{ t('share.shareWithAllHint') }}
    </div>
    <div v-else-if="selectedUser" class="share-grant__found">
      {{ t('share.userFound') }}: <strong>{{ selectedUser.email }}</strong>
    </div>
    <div v-if="searchError" class="share-grant__error">{{ searchError }}</div>
    <div v-else-if="searchPerformed && searchResults.length === 0" class="share-grant__empty">
      {{ t('share.usersNotFound') }}
    </div>
    <div v-else-if="searchResults.length > 0" class="share-grant__results">
      <button
        v-for="user in searchResults"
        :key="user.id"
        type="button"
        class="share-grant__user-item"
        :class="{ 'share-grant__user-item--selected': selectedUser?.id === user.id }"
        @click="emit('selectUser', user)"
      >
        <strong>{{ user.email }}</strong>
        <small v-if="user.firstName || user.lastName">
          {{ [user.lastName, user.firstName, user.middleName].filter(Boolean).join(' ') }}
        </small>
      </button>
    </div>
    <div v-if="errorMessage" class="share-grant__error">{{ errorMessage }}</div>
  </div>
</template>

<style scoped>
.share-grant {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.share-grant__subtitle {
  margin: 0;
  font-size: 14px;
}

.share-grant__grid {
  display: grid;
  gap: 8px;
}

.share-grant__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--text-muted);
}

.share-grant__inline {
  display: flex;
  gap: 8px;
}

.share-grant__permission-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 10px;
}

.share-grant__permission-option {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--base-text);
}

.share-grant__error {
  font-size: 12px;
  color: var(--danger);
  background: var(--danger-soft);
  border-radius: 8px;
  padding: 8px;
}

.share-grant__found {
  font-size: 12px;
  color: var(--text-muted);
  background: var(--surface-strong);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px;
}

.share-grant__results {
  border: 1px solid var(--border);
  border-radius: 8px;
  max-height: 220px;
  overflow: auto;
}

.share-grant__user-item {
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

.share-grant__user-item:last-child {
  border-bottom: 0;
}

.share-grant__user-item:hover {
  background: var(--surface-strong);
}

.share-grant__user-item--selected {
  background: color-mix(in srgb, var(--primary) 10%, transparent);
}

.share-grant__empty {
  font-size: 13px;
  color: var(--text-subtle);
}
</style>
