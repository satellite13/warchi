export const PASSWORD_MIN_LENGTH = 8

export type PasswordStrength = 'weak' | 'medium' | 'strong'

export type PasswordRuleId =
  | 'minLength'
  | 'uppercase'
  | 'lowercase'
  | 'digit'

export interface PasswordRule {
  id: PasswordRuleId
  passed: boolean
}

export function evaluatePasswordRules(password: string): PasswordRule[] {
  return [
    { id: 'minLength', passed: password.length >= PASSWORD_MIN_LENGTH },
    { id: 'uppercase', passed: /[A-Z]/.test(password) },
    { id: 'lowercase', passed: /[a-z]/.test(password) },
    { id: 'digit', passed: /\d/.test(password) },
  ]
}

export function isPasswordPolicySatisfied(password: string): boolean {
  return evaluatePasswordRules(password).every((rule) => rule.passed)
}

export function passwordStrength(password: string): PasswordStrength {
  const rules = evaluatePasswordRules(password)
  const passedCount = rules.filter((rule) => rule.passed).length
  if (passedCount <= 1) return 'weak'
  if (passedCount <= 3) return 'medium'
  return 'strong'
}
