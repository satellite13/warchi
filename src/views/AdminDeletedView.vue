<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { apiDelete, apiGet } from "@/composables/useApi";
import type { ModelData, NotationData, PaginatedResponse } from "@/types/entities";
import { formatDate } from "@/utils/formatDate";

const { t } = useI18n();

const deletedModels = ref<ModelData[]>([]);
const deletedNotations = ref<NotationData[]>([]);
const loadingModels = ref(false);
const loadingNotations = ref(false);
const deletingId = ref<string | null>(null);
const errorMessage = ref<string | null>(null);
const successMessage = ref<string | null>(null);

const PAGE_SIZE = 50;

const loadDeletedModels = async (): Promise<void> => {
  loadingModels.value = true;
  const result = await apiGet<PaginatedResponse<ModelData>>(
    `/models/deleted?page=0&size=${PAGE_SIZE}&sort=updatedAt,desc`
  );
  loadingModels.value = false;
  if (result.success && Array.isArray(result.data.content)) {
    deletedModels.value = result.data.content;
  } else {
    deletedModels.value = [];
  }
};

const loadDeletedNotations = async (): Promise<void> => {
  loadingNotations.value = true;
  const result = await apiGet<PaginatedResponse<NotationData>>(
    `/notations/deleted?page=0&size=${PAGE_SIZE}&sort=updatedAt,desc`
  );
  loadingNotations.value = false;
  if (result.success && Array.isArray(result.data.content)) {
    deletedNotations.value = result.data.content;
  } else {
    deletedNotations.value = [];
  }
};

const loadAll = (): void => {
  errorMessage.value = null;
  successMessage.value = null;
  loadDeletedModels();
  loadDeletedNotations();
};

const deleteModelPermanently = async (id: string): Promise<void> => {
  if (!confirm(t("adminDeleted.confirmPermanently"))) return;
  deletingId.value = id;
  errorMessage.value = null;
  const result = await apiDelete<void>(`/models/${id}/permanent`);
  deletingId.value = null;
  if (result.success) {
    deletedModels.value = deletedModels.value.filter((m) => m.id !== id);
    successMessage.value = t("adminDeleted.deletedSuccess");
  } else {
    errorMessage.value = result.error.message;
  }
};

const deleteNotationPermanently = async (id: string): Promise<void> => {
  if (!confirm(t("adminDeleted.confirmPermanently"))) return;
  deletingId.value = id;
  errorMessage.value = null;
  const result = await apiDelete<void>(`/notations/${id}/permanent`);
  deletingId.value = null;
  if (result.success) {
    deletedNotations.value = deletedNotations.value.filter((n) => n.id !== id);
    successMessage.value = t("adminDeleted.deletedSuccess");
  } else {
    errorMessage.value = result.error.message;
  }
};

onMounted(() => {
  loadAll();
});
</script>

<template>
  <div class="admin-deleted">
    <div class="title-bar">
      <div>
        <h1 class="title-bar__heading">{{ t("adminDeleted.title") }}</h1>
        <p class="title-bar__sub">{{ t("adminDeleted.subtitle") }}</p>
      </div>
    </div>

    <div v-if="errorMessage" class="message message--error">{{ errorMessage }}</div>
    <div v-if="successMessage" class="message message--success">{{ successMessage }}</div>

    <section class="admin-deleted__section">
      <h2 class="admin-deleted__section-title">{{ t("adminDeleted.deletedModels") }}</h2>
      <div v-if="loadingModels" class="admin-deleted__loading">
        <span>{{ t("adminDeleted.loading") }}</span>
      </div>
      <div v-else-if="deletedModels.length === 0" class="admin-deleted__empty">
        {{ t("adminDeleted.emptyModels") }}
      </div>
      <div v-else class="table-card">
        <table class="table">
          <thead>
            <tr>
              <th>{{ t("adminDeleted.name") }}</th>
              <th>{{ t("adminDeleted.version") }}</th>
              <th>{{ t("adminDeleted.updated") }}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in deletedModels" :key="m.id">
              <td>{{ m.name }}</td>
              <td>{{ m.version }}</td>
              <td>{{ formatDate(m.updatedAt) }}</td>
              <td>
                <button
                  type="button"
                  class="btn btn--danger btn--sm"
                  :disabled="deletingId === m.id"
                  @click="deleteModelPermanently(m.id)"
                >
                  {{ deletingId === m.id ? t("common.loading") : t("adminDeleted.deletePermanently") }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="admin-deleted__section">
      <h2 class="admin-deleted__section-title">{{ t("adminDeleted.deletedNotations") }}</h2>
      <div v-if="loadingNotations" class="admin-deleted__loading">
        <span>{{ t("adminDeleted.loading") }}</span>
      </div>
      <div v-else-if="deletedNotations.length === 0" class="admin-deleted__empty">
        {{ t("adminDeleted.emptyNotations") }}
      </div>
      <div v-else class="table-card">
        <table class="table">
          <thead>
            <tr>
              <th>{{ t("adminDeleted.name") }}</th>
              <th>{{ t("adminDeleted.version") }}</th>
              <th>{{ t("adminDeleted.updated") }}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="n in deletedNotations" :key="n.id">
              <td>{{ n.name }}</td>
              <td>{{ n.version }}</td>
              <td>{{ formatDate(n.updatedAt) }}</td>
              <td>
                <button
                  type="button"
                  class="btn btn--danger btn--sm"
                  :disabled="deletingId === n.id"
                  @click="deleteNotationPermanently(n.id)"
                >
                  {{ deletingId === n.id ? t("common.loading") : t("adminDeleted.deletePermanently") }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<style scoped>
.admin-deleted__section {
  margin-bottom: 2rem;
}

.admin-deleted__section-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 12px;
  color: var(--base-text);
}

.admin-deleted__loading,
.admin-deleted__empty {
  padding: 24px;
  text-align: center;
  color: var(--text-muted);
  background: var(--surface-muted);
  border-radius: var(--radius-sm);
}

.message {
  padding: 12px 16px;
  border-radius: var(--radius-sm);
  margin-bottom: 1rem;
}

.message--error {
  background: var(--danger-bg, #fef2f2);
  color: var(--danger);
}

.message--success {
  background: var(--success-bg, #f0fdf4);
  color: var(--success);
}

.table-card {
  overflow: auto;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  background: var(--surface);
}

.table {
  width: 100%;
  border-collapse: collapse;
}

.table th,
.table td {
  padding: 12px 16px;
  text-align: left;
  border-bottom: 1px solid var(--border-subtle);
}

.table th {
  font-weight: 600;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.table tbody tr:last-child td {
  border-bottom: none;
}

.btn--danger {
  background: var(--danger);
  color: white;
  border: none;
}

.btn--danger:hover:not(:disabled) {
  filter: brightness(1.1);
}

.btn--sm {
  padding: 6px 12px;
  font-size: 13px;
}
</style>
