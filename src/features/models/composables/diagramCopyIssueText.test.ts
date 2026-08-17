import { describe, expect, it } from 'vitest'
import { diagramCopyBlockerI18nKey, diagramCopyWarningI18nKey } from './diagramCopyIssueText'

describe('diagramCopyIssueText', () => {
  it('maps backend blocker code to an i18n key', () => {
    expect(
      diagramCopyBlockerI18nKey({
        code: 'UNRESOLVED_EDGE_ENDPOINT',
        reason: 'An edge endpoint or link is unresolved',
      })
    ).toBe('models.diagramCopy.blockers.UNRESOLVED_EDGE_ENDPOINT')
  })

  it('infers blocker code from the English reason when code is missing', () => {
    expect(
      diagramCopyBlockerI18nKey({
        reason: 'An edge endpoint or link is unresolved',
      })
    ).toBe('models.diagramCopy.blockers.UNRESOLVED_EDGE_ENDPOINT')
  })

  it('returns null for unknown blocker reasons without a code', () => {
    expect(diagramCopyBlockerI18nKey({ reason: 'Something else' })).toBeNull()
  })

  it('maps warning codes to i18n keys', () => {
    expect(diagramCopyWarningI18nKey({ code: 'DOCUMENT_NOT_COPIED' })).toBe(
      'models.diagramCopy.warnings.DOCUMENT_NOT_COPIED'
    )
  })
})
