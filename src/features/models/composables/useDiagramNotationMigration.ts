import { computed, ref, type ComputedRef, type Ref } from 'vue'
import type { ComponentResponse, NotationResponse, RelationResponse } from '@/types/api'
import type { NotationData } from '@/types/entities'
import { fetchAllComponentsByNotationId } from './modelNotationComponentsApi'
import { fetchAllRelationsByNotationId } from './modelNotationRelationsApi'
import type { EditorDiagram, ModelEditorState } from '../types'
import {
  applyDiagramNotationMigration,
  buildComponentIdRemap,
  buildRelationIdRemap,
  type MigrateDiagramNotationResult,
} from '../utils/migrateDiagramNotation'

type TranslateFn = (key: string, params?: Record<string, unknown>) => string

export function useDiagramNotationMigration(options: {
  state: Ref<ModelEditorState>
  activeDiagram: ComputedRef<EditorDiagram | null>
  isDiagramReadOnly: ComputedRef<boolean>
  newerNotationVersions: Ref<NotationResponse[]>
  t: TranslateFn
  setUiError: (message: string) => void
  markDiagramDirty: (diagramId: string) => void
  markNodeDirty: (nodeId: string) => void
  markLinkDirty: (linkId: string) => void
  ensureNotationRelationsAndRules: (
    notationId: string,
    options?: { force?: boolean }
  ) => Promise<void>
}) {
  const showMigrateModal = ref(false)
  const migrateTarget = ref<NotationResponse | null>(null)
  const isMigrating = ref(false)
  const migratePreviewUnmapped = ref<{ components: string[]; relations: string[] }>({
    components: [],
    relations: [],
  })
  const lastMigrateResult = ref<MigrateDiagramNotationResult | null>(null)

  const primaryNewerNotation = computed(() => options.newerNotationVersions.value[0] ?? null)

  const openMigrateModal = (target?: NotationResponse | null) => {
    if (options.isDiagramReadOnly.value) return
    const notation = target ?? primaryNewerNotation.value
    if (!notation || !options.activeDiagram.value) return
    migrateTarget.value = notation
    migratePreviewUnmapped.value = { components: [], relations: [] }
    lastMigrateResult.value = null
    showMigrateModal.value = true
  }

  const closeMigrateModal = () => {
    if (isMigrating.value) return
    showMigrateModal.value = false
    migrateTarget.value = null
  }

  const mergeCatalogEntities = (
    components: ComponentResponse[],
    relations: RelationResponse[],
    notationId: string
  ) => {
    const componentById = new Map(options.state.value.components.map(item => [item.id, item]))
    for (const component of components) {
      componentById.set(component.id, component)
    }
    options.state.value.components = [...componentById.values()]

    options.state.value.relations = [
      ...options.state.value.relations.filter(item => item.notationId !== notationId),
      ...relations,
    ]

    if (!options.state.value.notations.some(item => item.id === notationId) && migrateTarget.value) {
      const target = migrateTarget.value
      const asData: NotationData = {
        id: target.id,
        name: target.name,
        version: target.version,
        ownerId: target.ownerId,
        attrs: target.attrs,
        createdAt: target.createdAt,
        updatedAt: target.updatedAt,
      }
      options.state.value.notations = [...options.state.value.notations, asData]
    }
  }

  const confirmMigrateNotation = async () => {
    const diagram = options.activeDiagram.value
    const target = migrateTarget.value
    if (!diagram || !target || options.isDiagramReadOnly.value) return

    const oldNotationId = diagram.notationId
    if (!oldNotationId || oldNotationId === target.id) {
      closeMigrateModal()
      return
    }

    isMigrating.value = true
    try {
      const modelId = options.state.value.modelId
      const [oldComponents, newComponents, oldRelations, newRelations] = await Promise.all([
        fetchAllComponentsByNotationId(oldNotationId, { modelId }),
        fetchAllComponentsByNotationId(target.id, { modelId }),
        fetchAllRelationsByNotationId(oldNotationId, { modelId }),
        fetchAllRelationsByNotationId(target.id, { modelId }),
      ])

      const componentMap = buildComponentIdRemap(oldComponents, newComponents)
      const relationMap = buildRelationIdRemap(oldRelations, newRelations)
      migratePreviewUnmapped.value = {
        components: componentMap.unmapped,
        relations: relationMap.unmapped,
      }

      const usedOldComponentIds = new Set<string>()
      const usedOldRelationIds = new Set<string>()
      const nodeIdsOnDiagram = new Set(
        diagram.parsedAttrs.instances.nodes.map(instance => instance.modelNodeId)
      )
      const linkIdsOnDiagram = new Set(
        diagram.parsedAttrs.instances.edges.map(edge => edge.modelLinkId)
      )
      for (const node of options.state.value.nodes) {
        if (!nodeIdsOnDiagram.has(node.id)) continue
        const componentId = node.parsedAttrs.notationComponents[oldNotationId]?.componentId
        if (componentId) usedOldComponentIds.add(componentId)
      }
      for (const link of options.state.value.links) {
        if (!linkIdsOnDiagram.has(link.id)) continue
        const relationId = link.parsedAttrs.notationRelations[oldNotationId]?.relationId
        if (relationId) usedOldRelationIds.add(relationId)
      }

      const blockingComponents = [...usedOldComponentIds]
        .filter(id => !componentMap.remap.has(id))
        .map(id => oldComponents.find(item => item.id === id)?.name ?? id)
      const blockingRelations = [...usedOldRelationIds]
        .filter(id => !relationMap.remap.has(id))
        .map(id => oldRelations.find(item => item.id === id)?.name ?? id)

      if (blockingComponents.length > 0 || blockingRelations.length > 0) {
        migratePreviewUnmapped.value = {
          components: [...new Set(blockingComponents)].sort(),
          relations: [...new Set(blockingRelations)].sort(),
        }
        options.setUiError(options.t('diagram.migrateNotationUnmappedError'))
        return
      }

      const touchedNodeIds = new Set<string>()
      const touchedLinkIds = new Set<string>()
      for (const instance of diagram.parsedAttrs.instances.nodes) {
        touchedNodeIds.add(instance.modelNodeId)
      }
      for (const edge of diagram.parsedAttrs.instances.edges) {
        touchedLinkIds.add(edge.modelLinkId)
      }

      const result = applyDiagramNotationMigration({
        diagram,
        nodes: options.state.value.nodes,
        links: options.state.value.links,
        oldNotationId,
        newNotationId: target.id,
        componentRemap: componentMap.remap,
        relationRemap: relationMap.remap,
      })
      lastMigrateResult.value = {
        ...result,
        unmappedComponents: componentMap.unmapped,
        unmappedRelations: relationMap.unmapped,
      }

      mergeCatalogEntities(newComponents, newRelations, target.id)
      options.markDiagramDirty(diagram.id)
      for (const nodeId of touchedNodeIds) {
        if (options.state.value.nodes.some(node => node.id === nodeId)) {
          options.markNodeDirty(nodeId)
        }
      }
      for (const linkId of touchedLinkIds) {
        if (options.state.value.links.some(link => link.id === linkId)) {
          options.markLinkDirty(linkId)
        }
      }
      await options.ensureNotationRelationsAndRules(target.id, { force: true })

      showMigrateModal.value = false
      migrateTarget.value = null
    } catch (error) {
      options.setUiError(
        error instanceof Error
          ? error.message
          : options.t('diagram.migrateNotationFailed')
      )
    } finally {
      isMigrating.value = false
    }
  }

  return {
    showMigrateModal,
    migrateTarget,
    isMigrating,
    migratePreviewUnmapped,
    lastMigrateResult,
    primaryNewerNotation,
    openMigrateModal,
    closeMigrateModal,
    confirmMigrateNotation,
  }
}
