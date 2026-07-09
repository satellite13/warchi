import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { apiDelete, apiGet, apiPost } from "./useApi";
import { getUserDisplayName } from "../utils/userDisplay";
import { paginatedContent } from "../utils/paginatedResponse";
import type { PaginatedResponse, UserInfo } from "../types/entities";
import type {
  AccessShareRequest,
  AccessShareResponse,
  ShareResourceType
} from "../types/api";

export type AccessShareView = AccessShareResponse & {
  granteeDisplayName: string;
  grantedByDisplayName: string;
  permissionLabel: string;
};

export function useAccessShares() {
  const { t } = useI18n();
  const shares = ref<AccessShareView[]>([]);
  const isLoading = ref(false);
  const isSubmitting = ref(false);
  const errorMessage = ref<string | null>(null);

  const userNameCache = new Map<string, string>();

  const resolveUserName = async (userId?: string | null): Promise<string> => {
    const fallback = t("common.unknownUser");
    if (!userId) return t("share.allUsers");
    const cached = userNameCache.get(userId);
    if (cached) return cached;

    const userResult = await apiGet<UserInfo>(`/users/${userId}/public`);
    const nextValue = userResult.success
      ? getUserDisplayName(userResult.data, userResult.data.email)
      : fallback;
    userNameCache.set(userId, nextValue);
    return nextValue;
  };

  const loadShares = async (resourceType: ShareResourceType, resourceId: string): Promise<void> => {
    isLoading.value = true;
    errorMessage.value = null;

    try {
      const result = await apiGet<PaginatedResponse<AccessShareResponse> | AccessShareResponse[]>(
        `/access/shares/${resourceType}/${encodeURIComponent(resourceId)}`
      );
      if (!result.success) {
        throw new Error(result.error.message);
      }

      const rawShares = paginatedContent(result.data);
      const viewRows = await Promise.all(
        rawShares.map(async (share) => ({
          ...share,
          granteeDisplayName: await resolveUserName(share.granteeUserId),
          grantedByDisplayName: await resolveUserName(share.grantedByUserId),
          permissionLabel: share.permission === "EDIT" ? t("share.edit") : t("share.viewOnly")
        }))
      );
      shares.value = viewRows;
    } catch (error) {
      errorMessage.value =
        error instanceof Error ? error.message : t("share.loadSharesError");
      shares.value = [];
    } finally {
      isLoading.value = false;
    }
  };

  const grantShare = async (payload: AccessShareRequest): Promise<boolean> => {
    isSubmitting.value = true;
    errorMessage.value = null;
    try {
      const result = await apiPost<AccessShareResponse>("/access/shares", payload);
      if (!result.success) {
        throw new Error(result.error.message);
      }
      await loadShares(payload.resourceType, payload.resourceId);
      return true;
    } catch (error) {
      errorMessage.value =
        error instanceof Error ? error.message : t("share.grantShareError");
      return false;
    } finally {
      isSubmitting.value = false;
    }
  };

  const revokeShare = async (
    resourceType: ShareResourceType,
    resourceId: string,
    shareId: string
  ): Promise<boolean> => {
    isSubmitting.value = true;
    errorMessage.value = null;
    try {
      const result = await apiDelete<void>(`/access/shares/${shareId}`);
      if (!result.success) {
        throw new Error(result.error.message);
      }
      await loadShares(resourceType, resourceId);
      return true;
    } catch (error) {
      errorMessage.value =
        error instanceof Error ? error.message : t("share.revokeShareError");
      return false;
    } finally {
      isSubmitting.value = false;
    }
  };

  return {
    shares,
    isLoading,
    isSubmitting,
    errorMessage,
    loadShares,
    grantShare,
    revokeShare
  };
}
