import { apiGet, apiPost } from "../api/apiClient";
import { getUserDisplayName } from "./userDisplay";
import type { PaginatedResponse, UserInfo } from "../types/entities";
import { paginatedContent } from "./paginatedResponse";

interface CurrentUserLike {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}

export function normalizeOwnerId(id: string | null | undefined): string {
  return (id ?? "").trim().toLowerCase();
}

export function getOwnerDisplayNameFromMap(
  names: Map<string, string>,
  ownerId: string | null | undefined,
  fallback: string
): string {
  const key = normalizeOwnerId(ownerId);
  if (!key) return fallback;
  return names.get(key) ?? fallback;
}

export function resolveOwnerLabel(
  names: Map<string, string>,
  ownerId: string | null | undefined,
  currentUser: CurrentUserLike | null | undefined,
  fallback: string,
  ownerEmail?: string | null,
  ownerDisplayName?: string | null
): string {
  const fromMap = getOwnerDisplayNameFromMap(names, ownerId, fallback);
  if (fromMap !== fallback) return fromMap;

  const user = currentUser;
  if (user?.id && ownerId && normalizeOwnerId(user.id) === normalizeOwnerId(ownerId)) {
    const selfName = getUserDisplayName(user, "");
    if (selfName) return selfName;
  }

  const displayName = ownerDisplayName?.trim();
  if (displayName) return displayName;

  const email = ownerEmail?.trim();
  if (email) return email;

  return fallback;
}

function copyOwnerNameMap(existing: Map<string, string>, fallback: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const [id, name] of existing) {
    const key = normalizeOwnerId(id);
    if (key && name !== fallback) result.set(key, name);
  }
  return result;
}

function needsOwnerNameLoad(
  result: Map<string, string>,
  ownerId: string,
  fallback: string
): boolean {
  const key = normalizeOwnerId(ownerId);
  if (!key) return false;
  const cached = result.get(key);
  return cached === undefined || cached === fallback;
}

function hasResolvableDisplayName(user: CurrentUserLike): boolean {
  return getUserDisplayName(user, "") !== "";
}

export async function resolveOwnerDisplayNames(
  ownerIds: string[],
  existing: Map<string, string>,
  currentUser: CurrentUserLike | null | undefined,
  fallback: string
): Promise<Map<string, string>> {
  const result = copyOwnerNameMap(existing, fallback);

  if (currentUser?.id && hasResolvableDisplayName(currentUser)) {
    result.set(
      normalizeOwnerId(currentUser.id),
      getUserDisplayName(currentUser, fallback)
    );
  }

  const toLoad = [...new Set(ownerIds.map((id) => id.trim()))].filter((id) =>
    needsOwnerNameLoad(result, id, fallback)
  );
  if (toLoad.length === 0) return result;

  const batchResult = await apiPost<PaginatedResponse<UserInfo>>(
    "/users/public/batch",
    { ids: toLoad }
  );
  if (batchResult.success) {
    for (const user of paginatedContent(batchResult.data)) {
      result.set(
        normalizeOwnerId(user.id),
        getUserDisplayName(user, user.email ?? fallback)
      );
    }
    for (const id of toLoad) {
      const key = normalizeOwnerId(id);
      if (!result.has(key) || result.get(key) === fallback) {
        result.set(key, fallback);
      }
    }
    return result;
  }

  await Promise.all(
    toLoad.map(async (id) => {
      const key = normalizeOwnerId(id);
      const res = await apiGet<UserInfo>(`/users/${id}/public`);
      if (res.success) {
        result.set(key, getUserDisplayName(res.data, res.data.email ?? fallback));
      } else {
        result.set(key, fallback);
      }
    })
  );

  return result;
}
