import type { ComposerTranslation } from 'vue-i18n'
import type { CustomProperty } from '@/domain/attrs/notationAttrs'
import { customPropertyValidationErrors } from './customPropertyValidation'

export type { ValidationIssue } from '@/features/diagram-style/utils/validationIssues'
export { validateCompositeDiagramStyle } from '@/features/diagram-style/utils/validationIssues'

export function customPropertyErrors(property: CustomProperty, t: ComposerTranslation): string[] {
  return customPropertyValidationErrors(property, (key) => String(t(key)))
}
