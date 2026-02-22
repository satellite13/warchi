import type { AccessPermission } from "@/types/entities"

export function toAccessLabel(permission?: AccessPermission | null): string {
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

