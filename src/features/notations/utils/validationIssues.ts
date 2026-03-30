import type { ComposerTranslation } from 'vue-i18n'
import type { CustomProperty, DiagramStyle, CompositeSerializedCComponent } from '../notationAttrs'

export type ValidationIssue = {
  code: string
  message: string
  path: string
  severity: 'error' | 'warning'
}

export function customPropertyErrors(property: CustomProperty, t: ComposerTranslation): string[] {
  const errors: string[] = []
  const hasDefaultValue = (): boolean => {
    if (property.type === 'number') {
      return typeof property.defaultValue === 'number' && Number.isFinite(property.defaultValue)
    }
    if (property.type === 'boolean') {
      return typeof property.defaultValue === 'boolean'
    }
    return typeof property.defaultValue === 'string' && property.defaultValue.trim().length > 0
  }

  if (!property.name.trim()) errors.push(t('types.validationNameRequired'))

  if (property.regex) {
    try {
      new RegExp(property.regex)
    } catch {
      errors.push(t('types.validationRegexInvalid'))
    }
  }

  if (
    property.type === 'number' &&
    property.min !== null &&
    property.max !== null &&
    property.min > property.max
  ) {
    errors.push(t('types.validationMinGtMax'))
  }

  if (property.type === 'enum' && (!property.enumValues || !property.enumValues.length)) {
    errors.push(t('types.validationEnumEmpty'))
  }

  if (property.required && !hasDefaultValue()) {
    errors.push(t('types.validationRequiredDefault'))
  }
  return errors
}

function traverseComposite(
  node: CompositeSerializedCComponent,
  visitor: (node: CompositeSerializedCComponent, path: string) => void,
  path = 'compositeContent'
): void {
  visitor(node, path)
  if (node.content) traverseComposite(node.content, visitor, `${path}.content`)
  if (Array.isArray(node.children)) {
    node.children.forEach((child, idx) => {
      traverseComposite(child, visitor, `${path}.children[${idx}]`)
    })
  }
}

function findById(root: CompositeSerializedCComponent, id: string): boolean {
  let found = false
  traverseComposite(root, (node) => {
    if (node.id === id) found = true
  })
  return found
}

export function validateCompositeDiagramStyle(
  style: DiagramStyle | undefined,
  t: ComposerTranslation
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (style?.nodeShape !== 'composite') return issues

  const content = style.compositeContent
  if (!content || content.type !== 'container') {
    issues.push({
      code: 'COMPOSITE_ROOT_INVALID',
      message: t('notations.compositeValidationRootInvalid'),
      path: 'diagramStyle.compositeContent',
      severity: 'error',
    })
    return issues
  }

  let nameBindCount = 0
  let iconBindCount = 0
  traverseComposite(content, (node, path) => {
    if (node.type === 'text' && (node.bindToProperty === '__name__' || (!node.bindToProperty && node.role === 'name'))) {
      nameBindCount += 1
    }
    if ((node as { bindsNotationIcon?: boolean }).bindsNotationIcon === true) {
      iconBindCount += 1
      if (node.type !== 'icon') {
        issues.push({
          code: 'COMPOSITE_ICON_BIND_TARGET_INVALID',
          message: t('notations.compositeValidationIconBindTargetInvalid'),
          path,
          severity: 'error',
        })
      }
    }
  })

  if (nameBindCount === 0) {
    issues.push({
      code: 'COMPOSITE_NAME_ROLE_MISSING',
      message: t('notations.compositeValidationNameRoleMissing'),
      path: 'diagramStyle.compositeContent',
      severity: 'warning',
    })
  } else if (nameBindCount > 1) {
    issues.push({
      code: 'COMPOSITE_NAME_ROLE_DUPLICATE',
      message: t('notations.compositeValidationNameRoleDuplicate'),
      path: 'diagramStyle.compositeContent',
      severity: 'warning',
    })
  }

  if (iconBindCount > 1) {
    issues.push({
      code: 'COMPOSITE_ICON_BIND_DUPLICATE',
      message: t('notations.compositeValidationIconBindDuplicate'),
      path: 'diagramStyle.compositeContent',
      severity: 'error',
    })
  }

  for (const group of style.stylePropertyBindings ?? []) {
    for (const branch of group.branches) {
      for (const patch of branch.patches) {
        if (patch.targetId === '__compositeOuter__') continue
        if (!findById(content, patch.targetId)) {
          issues.push({
            code: 'A5_TARGET_NOT_FOUND',
            message: t('notations.compositeValidationTargetNotFound', { targetId: patch.targetId }),
            path: `diagramStyle.stylePropertyBindings.${group.valueSource}.${group.propertyName}`,
            severity: 'error',
          })
        }
      }
    }
  }

  return issues
}

