import type { AccessPermission } from "@/types/entities"

export function toAccessLabel(permission?: AccessPermission | null, locale?: string): string {
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

