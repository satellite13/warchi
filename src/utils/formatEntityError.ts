export function formatEntitySaveError(
  context: string,
  action: 'создания' | 'обновления' | 'удаления',
  entity: string,
  status: number,
  message: string,
): string {
  if (status === 401 || status === 403) {
    return `Недостаточно прав для редактирования ${context}. Войдите заново или обратитесь к администратору.`
  }
  return `Ошибка ${action} ${entity}: ${message}`
}
