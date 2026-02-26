import { apiGet } from "../composables/useApi";
import { getUserDisplayName } from "./userDisplay";
import type { UserInfo } from "../types/entities";

interface CurrentUserLike {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}

export async function resolveOwnerDisplayNames(
  ownerIds: string[],
  existing: Map<string, string>,
  currentUser: CurrentUserLike | null | undefined,
  fallback: string
): Promise<Map<string, string>> {
  const result = new Map(existing);

  if (currentUser?.id) {
    result.set(currentUser.id, getUserDisplayName(currentUser, fallback));
  }

  const toLoad = [...new Set(ownerIds)].filter((id) => id && !result.has(id));

  await Promise.all(
    toLoad.map(async (id) => {
      const res = await apiGet<UserInfo>(`/users/${id}/public`);
      if (res.success) {
        result.set(id, getUserDisplayName(res.data, res.data.email ?? fallback));
      } else {
        result.set(id, fallback);
      }
    })
  );

  return result;
}
