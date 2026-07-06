import { describe, expect, it } from 'vitest'
import {
  evaluatePasswordRules,
  isPasswordPolicySatisfied,
  passwordStrength,
  PASSWORD_MIN_LENGTH,
} from '@/utils/passwordPolicy'

describe('passwordPolicy', () => {
  it('requires minimum length', () => {
    const rules = evaluatePasswordRules('Ab1')
    expect(rules.find((rule) => rule.id === 'minLength')?.passed).toBe(false)
    expect(PASSWORD_MIN_LENGTH).toBe(8)
  })

  it('accepts a valid password', () => {
    expect(isPasswordPolicySatisfied('ValidPass1')).toBe(true)
    expect(evaluatePasswordRules('ValidPass1').every((rule) => rule.passed)).toBe(true)
  })

  it('rejects passwords missing character classes', () => {
    expect(isPasswordPolicySatisfied('validpass1')).toBe(false)
    expect(isPasswordPolicySatisfied('VALIDPASS1')).toBe(false)
    expect(isPasswordPolicySatisfied('ValidPass')).toBe(false)
  })

  it('classifies password strength', () => {
    expect(passwordStrength('a')).toBe('weak')
    expect(passwordStrength('ValidPa')).toBe('medium')
    expect(passwordStrength('ValidPass1')).toBe('strong')
  })
})
