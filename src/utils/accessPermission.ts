import type { AccessPermission } from '@/types/entities'

export type AccessEditSource = {
  accessPermission?: AccessPermission | null
  canEdit?: boolean | null
}

function legacyCanEdit(permission?: AccessPermission | null): boolean {
  return permission === 'OWNER' || permission === 'EDIT' || permission === 'ADMIN'
}

/**
 * Prefer explicit `canEdit` from API (Cerbos EDIT for effective role).
 * Fall back to accessPermission labels only when `canEdit` is absent (older payloads).
 */
export function canEditByAccessPermission(
  permissionOrEntity?: AccessPermission | AccessEditSource | null,
  canEditFlag?: boolean | null
): boolean {
  if (permissionOrEntity && typeof permissionOrEntity === 'object') {
    if (typeof permissionOrEntity.canEdit === 'boolean') return permissionOrEntity.canEdit
    return legacyCanEdit(permissionOrEntity.accessPermission)
  }
  if (typeof canEditFlag === 'boolean') return canEditFlag
  return legacyCanEdit(permissionOrEntity)
}

export function toAccessLabel(permission?: AccessPermission | null, locale?: string): string {
  if (locale === 'en') {
    switch (permission) {
      case 'OWNER':
        return 'Mine'
      case 'EDIT':
        return 'Shared: edit'
      case 'VIEW':
        return 'Shared: view'
      case 'ADMIN':
        return 'Admin access'
      default:
        return ''
    }
  }
  switch (permission) {
    case 'OWNER':
      return 'Мой'
    case 'EDIT':
      return 'Общий: редактирование'
    case 'VIEW':
      return 'Общий: просмотр'
    case 'ADMIN':
      return 'Админ-доступ'
    default:
      return ''
  }
}
