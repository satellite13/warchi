import type { AccessPermission } from "@/types/entities"

export function toAccessLabel(permission?: AccessPermission | null): string {
  const locale =
    typeof window !== "undefined" && window.localStorage.getItem("warchi.locale") === "en"
      ? "en"
      : "ru"

  switch (permission) {
    case "OWNER":
      return locale === "en" ? "Mine" : "Мой"
    case "EDIT":
      return locale === "en" ? "Shared: edit" : "Общий: редактирование"
    case "VIEW":
      return locale === "en" ? "Shared: view" : "Общий: просмотр"
    case "ADMIN":
      return locale === "en" ? "Admin access" : "Админ-доступ"
    default:
      return ""
  }
}

