import type { ComposerTranslation } from 'vue-i18n'
import type { CustomProperty, DiagramStyle, CompositeSerializedCComponent } from '@/domain/attrs/notationAttrs'
import { customPropertyValidationErrors } from './customPropertyValidation'

export type ValidationIssue = {
  code: string
  message: string
  path: string
  severity: 'error' | 'warning'
}

export function customPropertyErrors(property: CustomProperty, t: ComposerTranslation): string[] {
  return customPropertyValidationErrors(property, (key) => String(t(key)))
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
    if (node.type === 'text' && node.bindToProperty === '__name__') {
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

