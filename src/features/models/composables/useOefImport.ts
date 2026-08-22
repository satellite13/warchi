import { ref, type ComputedRef, type Ref } from 'vue'
import { apiPost } from '@/api/apiClient'
import type { NodeTypeResponse } from '@/types/api'
import {
  collectDefaultCustomPropertyValues,
  isCustomPropertyValueFilled,
} from '@/domain/attrs/customPropertyValues'
import { parseEntityAttrs, parseTypeAttrs } from '@/domain/attrs/notationAttrs'
import { parseLinkAttrs, parseNodeAttrs } from '../modelAttrs'
import type { ModelEditorState } from '../types'
import type { ImportMappingState } from '../utils/oef/mappingState'
import type { OefReuseSettings } from '../utils/oef/reuseSettings'
import type { ImportDraft } from '../utils/oef/types'
import { applyOefBatchSaveChunks, type OefChunkProgress } from '../utils/oef/chunkOefBatchSave'
import type { OefRelationRuleDecision } from '../utils/oef/oefRelationRuleValidation'
import { buildOefBatchSaveRequest } from '../utils/oef/oefToBatchSave'
import { buildOrganizationImportPlan } from '../utils/oef/organizationImport'
import { batchSave, hasBatchChanges } from './useModelBatchSave'

type TranslateFn = (key: string, params?: Record<string, unknown>) => string

export type OefImportReport = {
  nodes: number
  links: number
  diagrams: number
  diagramNodeInstances: number
  diagramConnectionInstances: number
  nodesReused: number
  nodesUpdated: number
  linksReused: number
  linksUpdated: number
  warningsCount: number
  warningGroups: Array<{ code: string; count: number }>
  missingRequired: {
    nodeType: number
    component: number
    relation: number
    total: number
  }
}

export function useOefImport(options: {
  state: Ref<ModelEditorState>
  treeRootNodeId: ComputedRef<string | null>
  t: TranslateFn
  setUiError: (message: string) => void
  loadModel: () => Promise<void>
  getExistingNodes?: () => ModelEditorState['nodes']
  getExistingLinks?: () => ModelEditorState['links']
  isExistingLinksReady?: () => boolean
}) {
  const showImportWizard = ref(false)
  const isImportingOef = ref(false)
  const oefImportProgress = ref<string | null>(null)
  const oefImportReport = ref<OefImportReport | null>(null)

  function formatOefProgress(progress: OefChunkProgress): string {
    const kindLabel =
      progress.kind === 'nodes'
        ? options.t('models.oefImportProgressNodes')
        : progress.kind === 'links'
          ? options.t('models.oefImportProgressLinks')
          : options.t('models.oefImportProgressDiagrams')
    return options.t('models.oefImportProgress', {
      kind: kindLabel,
      index: progress.index,
      total: progress.totalOfKind,
      nodes: progress.nodesCreated,
      links: progress.linksCreated,
      diagrams: progress.diagramsCreated,
    })
  }

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
      case 'nameTruncated':
        return options.t('models.oefImportWarningNameTruncated')
      case 'nameDeduplicated':
        return options.t('models.oefImportWarningNameDeduplicated')
      case 'relationsBranchSkipped':
        return options.t('models.oefImportWarningRelationsBranchSkipped')
      case 'directoryTypeMissing':
        return options.t('models.oefImportWarningDirectoryTypeMissing')
      case 'directoryTypeCreated':
        return options.t('models.oefImportWarningDirectoryTypeCreated')
      case 'linkNotAllowedByRelationRules':
        return options.t('models.oefImportWarningLinkNotAllowedByRelationRules')
      case 'linkImportedAgainstRelationRules':
        return options.t('models.oefImportWarningLinkImportedAgainstRelationRules')
      case 'propertyConversionFailed':
        return options.t('models.oefImportWarningPropertyConversionFailed')
      case 'propertyUnmatched':
        return options.t('models.oefImportWarningPropertyUnmatched')
      case 'nodeMatchAmbiguous':
        return options.t('models.oefImportWarningNodeMatchAmbiguous')
      case 'linkMatchAmbiguous':
        return options.t('models.oefImportWarningLinkMatchAmbiguous')
      case 'linkLabelConflict':
        return options.t('models.oefImportWarningLinkLabelConflict')
      default:
        return code
    }
  }

  async function ensureDirectoryNodeTypeId(): Promise<{
    id: string | null
    created: boolean
  }> {
    const existing = options.state.value.nodeTypes.find(
      type => type.name.trim().toLowerCase() === 'directory'
    )
    if (existing) return { id: existing.id, created: false }

    const result = await apiPost<NodeTypeResponse>('/node-types', {
      name: 'Directory',
      attrs: null,
    })
    if (!result.success) {
      options.setUiError(
        options.t('models.oefImportDirectoryTypeCreateFailed', {
          message: result.error.message,
        })
      )
      return { id: null, created: false }
    }
    options.state.value.nodeTypes = [...options.state.value.nodeTypes, result.data]
    return { id: result.data.id, created: true }
  }

  function collectOefMissingRequiredReport(
    request: ReturnType<typeof buildOefBatchSaveRequest>['request']
  ): OefImportReport['missingRequired'] {
    const componentById = new Map(
      options.state.value.components.map(component => [component.id, component])
    )
    const relationById = new Map(
      options.state.value.relations.map(relation => [relation.id, relation])
    )
    const nodeTypeById = new Map(
      options.state.value.nodeTypes.map(nodeType => [nodeType.id, nodeType])
    )

    let nodeType = 0
    let component = 0
    let relation = 0

    for (const node of request.nodes.create) {
      const nodeAttrs = parseNodeAttrs(node.attrs)
      const nodeTypeEntity = nodeTypeById.get(node.nodeTypeId)
      if (nodeTypeEntity) {
        const requiredTypeProps = (
          parseTypeAttrs(nodeTypeEntity.attrs ?? null).customProperties ?? []
        ).filter(property => property.required && !property.system)
        for (const property of requiredTypeProps) {
          const value = nodeAttrs.typeProperties[property.name]
          if (!isCustomPropertyValueFilled(value, property.type)) {
            nodeType += 1
          }
        }
      }

      for (const [notationId, binding] of Object.entries(nodeAttrs.notationComponents)) {
        const componentEntity = componentById.get(binding.componentId)
        if (!componentEntity || componentEntity.notationId !== notationId) continue

        const requiredProps = parseEntityAttrs(
          componentEntity.attrs ?? null
        ).customProperties.filter(property => property.required && !property.system)
        const scopedValues =
          nodeAttrs.componentProperties?.[notationId]?.[binding.componentId] ?? {}
        for (const property of requiredProps) {
          const value = scopedValues[property.name]
          if (!isCustomPropertyValueFilled(value, property.type)) {
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

        const requiredProps = parseEntityAttrs(
          relationEntity.attrs ?? null
        ).customProperties.filter(property => property.required && !property.system)
        const scopedValues = linkAttrs.relationProperties?.[notationId]?.[binding.relationId] ?? {}
        for (const property of requiredProps) {
          const value = scopedValues[property.name]
          if (!isCustomPropertyValueFilled(value, property.type)) {
            relation += 1
          }
        }
      }
    }

    const total = nodeType + component + relation
    return { nodeType, component, relation, total }
  }

  function yieldToPaint(): Promise<void> {
    return new Promise(resolve => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve())
      })
    })
  }

  async function handleOefImportSubmit(payload: {
    draft: ImportDraft
    notationId: string
    mapping: ImportMappingState
    ruleDecisions: Record<string, OefRelationRuleDecision>
    reuseSettings: OefReuseSettings
  }): Promise<void> {
    const modelId = options.state.value.modelId
    if (!modelId || isImportingOef.value) return
    if (options.isExistingLinksReady && !options.isExistingLinksReady()) {
      options.setUiError(options.t('models.oefDetachedLinksStale'))
      return
    }

    // Show busy UI before any heavy sync work so the wizard does not freeze blank.
    isImportingOef.value = true
    oefImportProgress.value = options.t('models.oefImportProgressPreparing')
    await Promise.resolve()
    await yieldToPaint()

    try {
      const orgPlanPreview = buildOrganizationImportPlan(payload.draft.organizations)
      let directoryNodeTypeId: string | null =
        options.state.value.nodeTypes.find(type => type.name.trim().toLowerCase() === 'directory')
          ?.id ?? null
      let directoryTypeCreated = false
      if (orgPlanPreview.directories.length > 0 && !directoryNodeTypeId) {
        const ensured = await ensureDirectoryNodeTypeId()
        if (!ensured.id) return
        directoryNodeTypeId = ensured.id
        directoryTypeCreated = ensured.created
      }

      const nodeTypePropertyDefaultsById = Object.fromEntries(
        options.state.value.nodeTypes.map(nodeType => [
          nodeType.id,
          collectDefaultCustomPropertyValues(
            parseTypeAttrs(nodeType.attrs ?? null).customProperties ?? []
          ),
        ])
      )
      const componentPropertyDefaultsById = Object.fromEntries(
        options.state.value.components.map(component => [
          component.id,
          collectDefaultCustomPropertyValues(
            parseEntityAttrs(component.attrs ?? null).customProperties
          ),
        ])
      )
      const relationPropertyDefaultsById = Object.fromEntries(
        options.state.value.relations.map(relation => [
          relation.id,
          collectDefaultCustomPropertyValues(
            parseEntityAttrs(relation.attrs ?? null).customProperties
          ),
        ])
      )
      const nodeTypeCustomPropertiesById = Object.fromEntries(
        options.state.value.nodeTypes.map(nodeType => [
          nodeType.id,
          parseTypeAttrs(nodeType.attrs ?? null).customProperties ?? [],
        ])
      )
      const componentCustomPropertiesById = Object.fromEntries(
        options.state.value.components.map(component => [
          component.id,
          parseEntityAttrs(component.attrs ?? null).customProperties,
        ])
      )
      const relationCustomPropertiesById = Object.fromEntries(
        options.state.value.relations.map(relation => [
          relation.id,
          parseEntityAttrs(relation.attrs ?? null).customProperties,
        ])
      )
      const built = buildOefBatchSaveRequest({
        draft: payload.draft,
        notationId: payload.notationId,
        mapping: payload.mapping,
        directoryNodeTypeId,
        parentNodeId: options.treeRootNodeId.value ?? null,
        nodeTypePropertyDefaultsById,
        componentPropertyDefaultsById,
        relationPropertyDefaultsById,
        nodeTypeCustomPropertiesById,
        componentCustomPropertiesById,
        relationCustomPropertiesById,
        relationRules: options.state.value.relationRules,
        ruleDecisions: payload.ruleDecisions,
        existingNodes: (options.getExistingNodes?.() ?? options.state.value.nodes).filter(
          node => !node._isDeleted
        ),
        existingLinks: (options.getExistingLinks?.() ?? options.state.value.links).filter(
          link => !link._isDeleted
        ),
        existingDiagrams: options.state.value.diagrams.filter(diagram => !diagram._isDeleted),
        reuseSettings: payload.reuseSettings,
      })
      if (directoryTypeCreated) {
        built.warnings.push({
          code: 'directoryTypeCreated',
          message: 'Directory node type was created automatically',
        })
      }
      const reusedOnly =
        !hasBatchChanges(built.request) &&
        (built.reuseCounts.nodesReused > 0 ||
          built.reuseCounts.linksReused > 0 ||
          built.reuseCounts.nodesUpdated > 0 ||
          built.reuseCounts.linksUpdated > 0)
      if (!hasBatchChanges(built.request) && !reusedOnly) {
        options.setUiError(options.t('models.oefImportNoChanges'))
        return
      }
      if (reusedOnly) {
        // Pure reuseId with no creates/updates/diagrams — still show report.
        await options.loadModel()
        showImportWizard.value = false
        oefImportReport.value = {
          ...built.createdCounts,
          ...built.reuseCounts,
          warningsCount: built.warnings.length,
          warningGroups: [],
          missingRequired: { nodeType: 0, component: 0, relation: 0, total: 0 },
        }
        return
      }

      oefImportProgress.value = options.t('models.oefImportProgressStarting')
      await yieldToPaint()
      const result = await applyOefBatchSaveChunks({
        modelId,
        request: built.request,
        batchSave,
        onProgress: progress => {
          oefImportProgress.value = formatOefProgress(progress)
        },
      })
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
        ...built.reuseCounts,
        warningsCount: built.warnings.length,
        warningGroups,
        missingRequired,
      }
    } finally {
      isImportingOef.value = false
      oefImportProgress.value = null
    }
  }

  return {
    showImportWizard,
    isImportingOef,
    oefImportProgress,
    oefImportReport,
    oefWarningLabel,
    handleOefImportSubmit,
  }
}
