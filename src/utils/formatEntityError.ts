import i18n from '@/i18n'

type SaveAction = 'create' | 'update' | 'delete'

const ACTION_KEYS: Record<SaveAction, string> = {
  create: 'common.saveActionCreate',
  update: 'common.saveActionUpdate',
  delete: 'common.saveActionDelete',
}

export function formatEntitySaveError(
  context: string,
  action: SaveAction | 'создания' | 'обновления' | 'удаления',
  entity: string,
  status: number,
  message: string,
): string {
  const t = i18n.global.t
  if (status === 401 || status === 403) {
    return String(t('common.saveInsufficientRights', { context }))
  }
  const normalizedAction: SaveAction =
    action === 'create' || action === 'создания'
      ? 'create'
      : action === 'update' || action === 'обновления'
        ? 'update'
        : 'delete'
  return String(
    t('common.saveEntityError', {
      action: t(ACTION_KEYS[normalizedAction]),
      entity,
      message,
    }),
  )
}

/** Type editor save/delete errors (types.* keys). */
export function formatTypeOperationError(
  operation: 'save' | 'delete',
  status: number,
  message: string,
): string {
  const t = i18n.global.t
  if (status === 401 || status === 403) {
    return String(t('types.errorInsufficientPermissions'))
  }
  return operation === 'save'
    ? String(t('types.errorSaveType', { message }))
    : String(t('types.errorDeleteType', { message }))
}
