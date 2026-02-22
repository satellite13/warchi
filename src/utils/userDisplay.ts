type UserNameSource = {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
};

const trimOrNull = (value?: string | null): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

export const getUserDisplayName = (
  user: UserNameSource | null | undefined,
  fallback = "Неизвестный пользователь"
): string => {
  if (!user) return fallback;

  const firstName = trimOrNull(user.firstName);
  const lastName = trimOrNull(user.lastName);
  const fullName = [firstName, lastName].filter((part): part is string => Boolean(part)).join(" ");
  if (fullName) return fullName;

  return trimOrNull(user.email) ?? fallback;
};

export const getDisplayInitials = (value?: string | null): string => {
  const normalized = trimOrNull(value);
  if (!normalized) return "?";

  if (normalized.includes("@")) {
    const local = normalized.split("@")[0] ?? "";
    const parts = local.split(/[._-]/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
    }
    return local.slice(0, 2).toUpperCase();
  }

  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0]?.[0] ?? ""}${words[1]?.[0] ?? ""}`.toUpperCase();
  }
  return normalized.slice(0, 2).toUpperCase();
};
