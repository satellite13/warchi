import { ref, type ComputedRef, type Ref } from 'vue'
import { parseLinkAttrs, parseNodeAttrs } from '../modelAttrs'
import type { ModelEditorState } from '../types'
import { parseEntityAttrs, parseTypeAttrs } from '@/domain/attrs/notationAttrs'
import type { ImportMappingState } from '../utils/oef/mappingState'
import type { ImportDraft } from '../utils/oef/types'
import { buildOefBatchSaveRequest } from '../utils/oef/oefToBatchSave'
import { batchSave, hasBatchChanges } from './useModelBatchSave'
import { isRequiredPropertyFilled } from '../utils/requiredCustomPropertiesValidation'

type TranslateFn = (key: string, params?: Record<string, unknown>) => string

export type OefImportReport = {
  nodes: number
  links: number
  diagrams: number
  diagramNodeInstances: number
  diagramConnectionInstances: number
  warningsCount: number
  warningGroups: Array<{ code: string; count: number }>
  missingRequired: {
    nodeType: number
    component: number
    relation: number
    total: number
  }
}

function collectDefaultCustomPropertyValues(
  customProperties: { name: string; defaultValue?: string | number | boolean; system?: boolean }[]
): Record<string, unknown> {
  const defaults: Record<string, unknown> = {}
  for (const property of customProperties) {
    if (property.system) continue
    if (!property.name) continue
    if (property.defaultValue !== undefined) {
      defaults[property.name] = property.defaultValue
    }
  }
  return defaults
}

export function useOefImport(options: {
  state: Ref<ModelEditorState>
  treeRootNodeId: ComputedRef<string | null>
  t: TranslateFn
  setUiError: (message: string) => void
  loadModel: () => Promise<void>
}) {
  const showImportWizard = ref(false)
  const isImportingOef = ref(false)
  const oefImportReport = ref<OefImportReport | null>(null)

  function oefWarningLabel(code: string): string {
    switch (code) {
      case 'nodeTypeNotMapped':
        return options.t('models.oefImportWarningNodeTypeNotMapped')
      case 'linkTypeNotMapped':
        return options.t('models.oefImportWarningLinkTypeNotMapped')
      case 'linkMissingNode':
        return options.t('models.oefImportWarningLinkMissingNode')
      case 'diagramNodeMissingModelNode':
        return options.t('models.oefImportWarningDiagramNodeMissingModelNode')
      case 'diagramConnectionMissingModelLink':
        return options.t('models.oefImportWarningDiagramConnectionMissingModelLink')
      case 'diagramConnectionMissingNodeInstance':
        return options.t('models.oefImportWarningDiagramConnectionMissingNodeInstance')
      default:
        return code
    }
  }

  function collectOefMissingRequiredReport(
    request: ReturnType<typeof buildOefBatchSaveRequest>['request']
  ): OefImportReport['missingRequired'] {
    const componentById = new Map(options.state.value.components.map(component => [component.id, component]))
    const relationById = new Map(options.state.value.relations.map(relation => [relation.id, relation]))
    const nodeTypeById = new Map(options.state.value.nodeTypes.map(nodeType => [nodeType.id, nodeType]))

    let nodeType = 0
    let component = 0
    let relation = 0

    for (const node of request.nodes.create) {
      const nodeAttrs = parseNodeAttrs(node.attrs)
      const nodeTypeEntity = nodeTypeById.get(node.nodeTypeId)
      if (nodeTypeEntity) {
        const requiredTypeProps = (parseTypeAttrs(nodeTypeEntity.attrs ?? null).customProperties ?? []).filter(
          property => property.required && !property.system
        )
        for (const property of requiredTypeProps) {
          const value = nodeAttrs.typeProperties[property.name]
          if (!isRequiredPropertyFilled(value, property.type)) {
            nodeType += 1
          }
        }
      }

      for (const [notationId, binding] of Object.entries(nodeAttrs.notationComponents)) {
        const componentEntity = componentById.get(binding.componentId)
        if (!componentEntity || componentEntity.notationId !== notationId) continue

        const requiredProps = parseEntityAttrs(componentEntity.attrs ?? null).customProperties.filter(
          property => property.required && !property.system
        )
        const scopedValues = nodeAttrs.componentProperties?.[notationId]?.[binding.componentId] ?? {}
        for (const property of requiredProps) {
          const value = scopedValues[property.name]
          if (!isRequiredPropertyFilled(value, property.type)) {
            component += 1
          }
        }
      }
    }

    for (const link of request.links.create) {
      const linkAttrs = parseLinkAttrs(link.attrs)
      for (const [notationId, binding] of Object.entries(linkAttrs.notationRelations)) {
        const relationEntity = relationById.get(binding.relationId)
        if (!relationEntity || relationEntity.notationId !== notationId) continue

        const requiredProps = parseEntityAttrs(relationEntity.attrs ?? null).customProperties.filter(
          property => property.required && !property.system
        )
        const scopedValues = linkAttrs.relationProperties?.[notationId]?.[binding.relationId] ?? {}
        for (const property of requiredProps) {
          const value = scopedValues[property.name]
          if (!isRequiredPropertyFilled(value, property.type)) {
            relation += 1
          }
        }
      }
    }

    const total = nodeType + component + relation
    return { nodeType, component, relation, total }
  }

  async function handleOefImportSubmit(payload: {
    draft: ImportDraft
    notationId: string
    mapping: ImportMappingState
  }): Promise<void> {
    const modelId = options.state.value.modelId
    if (!modelId) return
    const nodeTypePropertyDefaultsById = Object.fromEntries(
      options.state.value.nodeTypes.map(nodeType => [
        nodeType.id,
        collectDefaultCustomPropertyValues(parseTypeAttrs(nodeType.attrs ?? null).customProperties ?? []),
      ])
    )
    const componentPropertyDefaultsById = Object.fromEntries(
      options.state.value.components.map(component => [
        component.id,
        collectDefaultCustomPropertyValues(parseEntityAttrs(component.attrs ?? null).customProperties),
      ])
    )
    const relationPropertyDefaultsById = Object.fromEntries(
      options.state.value.relations.map(relation => [
        relation.id,
        collectDefaultCustomPropertyValues(parseEntityAttrs(relation.attrs ?? null).customProperties),
      ])
    )
    const built = buildOefBatchSaveRequest({
      draft: payload.draft,
      notationId: payload.notationId,
      mapping: payload.mapping,
      parentNodeId: options.treeRootNodeId.value ?? null,
      nodeTypePropertyDefaultsById,
      componentPropertyDefaultsById,
      relationPropertyDefaultsById,
    })
    if (!hasBatchChanges(built.request)) {
      options.setUiError(options.t('models.oefImportNoChanges'))
      return
    }

    isImportingOef.value = true
    const result = await batchSave(modelId, built.request)
    isImportingOef.value = false
    if (!result.success) {
      options.setUiError(options.t('models.oefImportFailed', { message: result.error.message }))
      return
    }
    await options.loadModel()
    const warningCounts = new Map<string, number>()
    for (const warning of built.warnings) {
      warningCounts.set(warning.code, (warningCounts.get(warning.code) ?? 0) + 1)
    }
    const warningGroups = [...warningCounts.entries()]
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count)
    const missingRequired = collectOefMissingRequiredReport(built.request)
    showImportWizard.value = false
    oefImportReport.value = {
      ...built.createdCounts,
      warningsCount: built.warnings.length,
      warningGroups,
      missingRequired,
    }
  }

  return {
    showImportWizard,
    isImportingOef,
    oefImportReport,
    oefWarningLabel,
    handleOefImportSubmit,
  }
}
