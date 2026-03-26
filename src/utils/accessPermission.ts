import type { AccessPermission } from "@/types/entities"

export function toAccessLabel(permission?: AccessPermission | null, locale?: string): string {
  if (locale === "fr") {
    switch (permission) {
      case "OWNER":
        return "À moi"
      case "EDIT":
        return "Partagé : édition"
      case "VIEW":
        return "Partagé : lecture"
      case "ADMIN":
        return "Accès administrateur"
      default:
        return ""
    }
  }
  if (locale === "en") {
    switch (permission) {
      case "OWNER":
        return "Mine"
      case "EDIT":
        return "Shared: edit"
      case "VIEW":
        return "Shared: view"
      case "ADMIN":
        return "Admin access"
      default:
        return ""
    }
  }
  switch (permission) {
    case "OWNER":
      return "Мой"
    case "EDIT":
      return "Общий: редактирование"
    case "VIEW":
      return "Общий: просмотр"
    case "ADMIN":
      return "Админ-доступ"
    default:
      return ""
  }
}

