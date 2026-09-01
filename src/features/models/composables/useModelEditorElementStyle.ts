import { computed, type ComputedRef, type Ref } from 'vue'
import { parseEntityAttrs, type DiagramStyle } from '@/domain/attrs/notationAttrs'
import { clonePlainDeep } from '@/utils/clonePlainDeep'
import { resolveInstanceComponentId } from '../modelAttrs'
import {
  applyDiagramStyleToNodeInstance,
  withInstanceDimensions,
} from '../utils/applyDiagramStyleToNodeInstance'
import { mergeEffectiveDiagramStyle } from '../utils/diagramCanvasBuilders'
import type { DiagramNodeInstance } from '../modelAttrs'
import type { EditorDiagram, ModelEditorState } from '../types'

type HistoryCommand = { execute: () => void; undo: () => void }

export type NodeInstanceStyleSnapshot = {
  width?: number
  height?: number
  attrs?: Record<string, unknown>
}

export function useModelEditorElementStyle(options: {
  activeDiagram: ComputedRef<EditorDiagram | null>
  activeNotationId: ComputedRef<string | null>
  commitDiagramHistory: (command: HistoryCommand) => void
  isNoteInstance: (instance: DiagramNodeInstance) => boolean
  markDiagramDirty: (diagramId: string) => void
  recordDiagramHistory: (key: string, command: HistoryCommand) => void
  selectedCanvasElementId: Ref<string | null>
  selectedModelLinkId: Ref<string | null>
  selectedModelNodeIds: Ref<string[]>
  setUiError: (message: string) => void
  state: Ref<ModelEditorState>
  t: (key: string, params?: Record<string, unknown>) => string
}) {
  const applyNodeInstanceStyleSnapshot = (
    diagramId: string,
    instanceId: string,
    snapshot: NodeInstanceStyleSnapshot
  ): void => {
    const diagram = options.state.value.diagrams.find(item => item.id === diagramId && !item._isDeleted)
    const instance = diagram?.parsedAttrs.instances.nodes.find(item => item.id === instanceId)
    if (!diagram || !instance) return
    instance.width = snapshot.width
    instance.height = snapshot.height
    instance.attrs = snapshot.attrs ? clonePlainDeep(snapshot.attrs) : undefined
    options.markDiagramDirty(diagram.id)
  }

  const applyEdgeInstanceStyleSnapshot = (
    diagramId: string,
    edgeId: string,
    attrs: Record<string, unknown> | undefined
  ): void => {
    const diagram = options.state.value.diagrams.find(item => item.id === diagramId && !item._isDeleted)
    const edge = diagram?.parsedAttrs.instances.edges.find(item => item.id === edgeId)
    if (!diagram || !edge) return
    edge.attrs = attrs ? clonePlainDeep(attrs) : undefined
    options.markDiagramDirty(diagram.id)
  }

  const handleDiagramElementStyleChange = (style: DiagramStyle) => {
    const diagram = options.activeDiagram.value
    const selectedElementId = options.selectedCanvasElementId.value
    if (!diagram) return

    let targetNodeInstance = null as (typeof diagram.parsedAttrs.instances.nodes)[number] | null
    let targetEdgeInstance = null as (typeof diagram.parsedAttrs.instances.edges)[number] | null

    if (selectedElementId?.startsWith('instance-')) {
      const instanceId = selectedElementId.slice('instance-'.length)
      targetNodeInstance =
        diagram.parsedAttrs.instances.nodes.find(item => item.id === instanceId) ?? null
    } else if (selectedElementId?.startsWith('edge-')) {
      const edgeId = selectedElementId.slice('edge-'.length)
      targetEdgeInstance =
        diagram.parsedAttrs.instances.edges.find(item => item.id === edgeId) ?? null
    }

    if (!targetNodeInstance && !targetEdgeInstance && options.selectedModelNodeIds.value.length === 1) {
      const modelNodeId = options.selectedModelNodeIds.value[0]
      targetNodeInstance =
        diagram.parsedAttrs.instances.nodes.find(item => item.modelNodeId === modelNodeId) ?? null
    }

    if (!targetNodeInstance && !targetEdgeInstance && options.selectedModelLinkId.value) {
      targetEdgeInstance =
        diagram.parsedAttrs.instances.edges.find(
          item => item.modelLinkId === options.selectedModelLinkId.value
        ) ?? null
    }

    if (targetNodeInstance) {
      const diagramId = diagram.id
      const instanceId = targetNodeInstance.id
      const before = clonePlainDeep({
        width: targetNodeInstance.width,
        height: targetNodeInstance.height,
        attrs: targetNodeInstance.attrs,
      })
      applyDiagramStyleToNodeInstance(targetNodeInstance, style)
      options.markDiagramDirty(diagram.id)
      const after = clonePlainDeep({
        width: targetNodeInstance.width,
        height: targetNodeInstance.height,
        attrs: targetNodeInstance.attrs,
      })
      options.recordDiagramHistory(`style:node:${instanceId}`, {
        execute: () => applyNodeInstanceStyleSnapshot(diagramId, instanceId, after),
        undo: () => applyNodeInstanceStyleSnapshot(diagramId, instanceId, before),
      })
      return
    }

    if (targetEdgeInstance) {
      const diagramId = diagram.id
      const edgeId = targetEdgeInstance.id
      const beforeAttrs = clonePlainDeep(targetEdgeInstance.attrs)
      if (!targetEdgeInstance.attrs) targetEdgeInstance.attrs = {}
      let bound: DiagramStyle | undefined
      if (targetEdgeInstance.modelLinkId) {
        const modelLink = options.state.value.links.find(item => item.id === targetEdgeInstance.modelLinkId)
        const notationId = options.activeNotationId.value
        if (modelLink && notationId) {
          const relationId = modelLink.parsedAttrs.notationRelations[notationId]?.relationId
          const relation = relationId
            ? options.state.value.relations.find(item => item.id === relationId)
            : null
          if (relation) {
            bound = parseEntityAttrs(relation.attrs ?? null).diagramStyle
          }
        }
      }
      const previousInstance =
        targetEdgeInstance.attrs.diagramStyle &&
        typeof targetEdgeInstance.attrs.diagramStyle === 'object'
          ? (targetEdgeInstance.attrs.diagramStyle as DiagramStyle)
          : undefined
      const previousEffective = mergeEffectiveDiagramStyle(bound, previousInstance) ?? {}
      const currentType = (previousEffective.edgeType as string | undefined) ?? 'bezier'
      const newType = (style as Record<string, unknown>).edgeType as string | undefined
      const fromPolyline = currentType === 'polyline' || currentType === 'editable-polyline'
      const toNonPolyline = newType === 'bezier' || newType === 'straight'
      // Merge relation defaults under panel style so a partial/stale panel payload cannot
      // drop label fields that only existed on the notation relation.
      targetEdgeInstance.attrs.diagramStyle = {
        ...previousEffective,
        ...JSON.parse(JSON.stringify(style)),
      }
      if (fromPolyline && toNonPolyline && targetEdgeInstance.attrs.controlPoints) {
        delete targetEdgeInstance.attrs.controlPoints
      }
      options.markDiagramDirty(diagram.id)
      const afterAttrs = clonePlainDeep(targetEdgeInstance.attrs)
      options.recordDiagramHistory(`style:edge:${edgeId}`, {
        execute: () => applyEdgeInstanceStyleSnapshot(diagramId, edgeId, afterAttrs),
        undo: () => applyEdgeInstanceStyleSnapshot(diagramId, edgeId, beforeAttrs),
      })
    }
  }

  const selectedElementDiagramStyle = computed((): DiagramStyle | undefined => {
    const diagram = options.activeDiagram.value
    const selectedElementId = options.selectedCanvasElementId.value
    if (!diagram || !selectedElementId) return undefined

    if (selectedElementId.startsWith('instance-')) {
      const instanceId = selectedElementId.slice('instance-'.length)
      const instance = diagram.parsedAttrs.instances.nodes.find(item => item.id === instanceId)
      if (!instance) return undefined

      if (instance.attrs?.diagramStyle && typeof instance.attrs.diagramStyle === 'object') {
        return withInstanceDimensions(instance.attrs.diagramStyle as DiagramStyle, instance)
      }
      const notationId = options.activeNotationId.value
      if (!notationId) return withInstanceDimensions(undefined, instance)
      const modelNode = options.state.value.nodes.find(item => item.id === instance.modelNodeId)
      const componentId = resolveInstanceComponentId({
        instance,
        node: modelNode ?? null,
        notationId,
        components: options.state.value.components,
      })
      if (!componentId) return withInstanceDimensions(undefined, instance)
      const component = options.state.value.components.find(item => item.id === componentId)
      if (!component) return withInstanceDimensions(undefined, instance)
      return withInstanceDimensions(parseEntityAttrs(component.attrs ?? null).diagramStyle, instance)
    }

    if (selectedElementId.startsWith('edge-')) {
      const edgeId = selectedElementId.slice('edge-'.length)
      const edge = diagram.parsedAttrs.instances.edges.find(item => item.id === edgeId)
      if (!edge) return undefined

      let bound: DiagramStyle | undefined
      if (edge.modelLinkId) {
        const modelLink = options.state.value.links.find(item => item.id === edge.modelLinkId)
        const notationId = options.activeNotationId.value
        if (modelLink && notationId) {
          const relationId = modelLink.parsedAttrs.notationRelations[notationId]?.relationId
          const relation = relationId
            ? options.state.value.relations.find(item => item.id === relationId)
            : null
          if (relation) {
            bound = parseEntityAttrs(relation.attrs ?? null).diagramStyle
          }
        }
      }

      const instanceStyle =
        edge.attrs?.diagramStyle && typeof edge.attrs.diagramStyle === 'object'
          ? (edge.attrs.diagramStyle as DiagramStyle)
          : undefined
      return mergeEffectiveDiagramStyle(bound, instanceStyle)
    }

    return undefined
  })

  const hasDiagramStyleOverride = computed(() => {
    const diagram = options.activeDiagram.value
    const selectedElementId = options.selectedCanvasElementId.value
    if (!diagram || !selectedElementId) return false

    if (selectedElementId.startsWith('instance-')) {
      const instanceId = selectedElementId.slice('instance-'.length)
      const instance = diagram.parsedAttrs.instances.nodes.find(item => item.id === instanceId)
      if (instance && options.isNoteInstance(instance)) return false
      return Boolean(instance?.attrs?.diagramStyle)
    }

    if (selectedElementId.startsWith('edge-')) {
      const edgeId = selectedElementId.slice('edge-'.length)
      const edge = diagram.parsedAttrs.instances.edges.find(item => item.id === edgeId)
      if (edge?.attrs?.isDiagramOnly === true) return false
      if (!edge?.modelLinkId) return false
      return Boolean(edge?.attrs?.diagramStyle)
    }

    return false
  })

  const restoreStyleFromNotation = () => {
    const diagram = options.activeDiagram.value
    const notationId = options.activeNotationId.value
    const selectedElementId = options.selectedCanvasElementId.value
    if (!diagram || !notationId || !selectedElementId) return

    if (selectedElementId.startsWith('instance-')) {
      const instanceId = selectedElementId.slice('instance-'.length)
      const instance = diagram.parsedAttrs.instances.nodes.find(item => item.id === instanceId)
      if (!instance) return
      if (options.isNoteInstance(instance)) return

      const modelNode = options.state.value.nodes.find(
        item => item.id === instance.modelNodeId && !item._isDeleted
      )
      const componentId = resolveInstanceComponentId({
        instance,
        node: modelNode ?? null,
        notationId,
        components: options.state.value.components,
      })
      const component = componentId
        ? options.state.value.components.find(
            item => item.id === componentId && item.notationId === notationId
          )
        : null

      if (!component) {
        options.setUiError(options.t('models.figureComponentNotFound'))
        return
      }

      const before = clonePlainDeep({
        width: instance.width,
        height: instance.height,
        attrs: instance.attrs,
      })
      if (instance.attrs && typeof instance.attrs === 'object') {
        delete instance.attrs.diagramStyle
        if (Object.keys(instance.attrs).length === 0) delete instance.attrs
      }
      options.markDiagramDirty(diagram.id)
      const after = clonePlainDeep({
        width: instance.width,
        height: instance.height,
        attrs: instance.attrs,
      })
      const diagramId = diagram.id
      options.commitDiagramHistory({
        execute: () => applyNodeInstanceStyleSnapshot(diagramId, instanceId, after),
        undo: () => applyNodeInstanceStyleSnapshot(diagramId, instanceId, before),
      })
      return
    }

    if (selectedElementId.startsWith('edge-')) {
      const edgeId = selectedElementId.slice('edge-'.length)
      const edge = diagram.parsedAttrs.instances.edges.find(item => item.id === edgeId)
      if (!edge) return
      if (edge.attrs?.isDiagramOnly === true) return

      const modelLink = options.state.value.links.find(
        item => item.id === edge.modelLinkId && !item._isDeleted
      )
      const relationId = modelLink?.parsedAttrs.notationRelations[notationId]?.relationId
      const relation = relationId
        ? options.state.value.relations.find(
            item => item.id === relationId && item.notationId === notationId
          )
        : null

      if (!relation) {
        options.setUiError(options.t('models.edgeRelationNotFound'))
        return
      }

      const beforeAttrs = clonePlainDeep(edge.attrs)
      if (edge.attrs && typeof edge.attrs === 'object') {
        delete edge.attrs.diagramStyle
        if (Object.keys(edge.attrs).length === 0) delete edge.attrs
      }
      options.markDiagramDirty(diagram.id)
      const afterAttrs = clonePlainDeep(edge.attrs)
      const diagramId = diagram.id
      options.commitDiagramHistory({
        execute: () => applyEdgeInstanceStyleSnapshot(diagramId, edgeId, afterAttrs),
        undo: () => applyEdgeInstanceStyleSnapshot(diagramId, edgeId, beforeAttrs),
      })
    }
  }

  return {
    applyNodeInstanceStyleSnapshot,
    applyEdgeInstanceStyleSnapshot,
    handleDiagramElementStyleChange,
    selectedElementDiagramStyle,
    hasDiagramStyleOverride,
    restoreStyleFromNotation,
  }
}
