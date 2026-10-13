import { describe, expect, it } from 'vitest'
import { messages } from './messages'

describe('role labels (DGTW-4059)', () => {
  it('ru labels match product roles', () => {
    const roles = messages.ru.featureGrants.roles
    expect(roles.admin).toBe('Админ') // без изменений (см. Note)
    expect(roles.architect).toBe('Архитектор')
    expect(roles.editor).toBe('Пользователь — редактирование')
    expect(roles.reader).toBe('Пользователь — чтение')
    expect(roles.viewer).toBe('Наблюдатель')
  })

  it('en labels match product roles', () => {
    const roles = messages.en.featureGrants.roles
    expect(roles.admin).toBe('Admin')
    expect(roles.architect).toBe('Architect')
    expect(roles.editor).toBe('User — editing')
    expect(roles.reader).toBe('User — reading')
    expect(roles.viewer).toBe('Viewer')
  })
})
