import { computed, type ComputedRef, type Ref } from 'vue'
import { parseEntityAttrs, type CustomProperty } from '@/domain/attrs/notationAttrs'
import { clonePlainDeep } from '@/utils/clonePlainDeep'
import {
  getDiagramScopedLinkValues,
  getDiagramScopedNodeValues,
  setDiagramScopedLinkValue,
  setDiagramScopedNodeValue,
} from '../utils/diagramScopedProperties'
import { resolveInstanceComponentId } from '../modelAttrs'
import type { EditorDiagram, EditorLink, EditorNode, ModelEditorState } from '../types'

type HistoryCommand = { execute: () => void; undo: () => void }

export function useModelEditorProperties(options: {
  activeDiagram: ComputedRef<EditorDiagram | null>
  activeNotationId: ComputedRef<string | null>
  applyEdgeInstanceStyleSnapshot: (
    diagramId: string,
    edgeId: string,
    attrs: Record<string, unknown> | undefined
  ) => void
  markDiagramDirty: (diagramId: string) => void
  markLinkDirty: (linkId: string) => void
  markNodeDirty: (nodeId: string) => void
  recordDiagramHistory: (key: string, command: HistoryCommand) => void
  selectedLink: ComputedRef<EditorLink | null>
  selectedLinkEdgeInstanceId: Ref<string | null>
  selectedNode: ComputedRef<EditorNode | null>
  selectedNodeInstanceId: Ref<string | null>
  state: Ref<ModelEditorState>
}) {
  const nodeBindingComponentId = computed(() => {
    const notationId = options.activeNotationId.value
    const node = options.selectedNode.value
    if (!notationId || !node) return null
    const instanceId = options.selectedNodeInstanceId.value
    const instance = instanceId
      ? (options.activeDiagram.value?.parsedAttrs.instances.nodes.find(item => item.id === instanceId) ??
        null)
      : null
    return resolveInstanceComponentId({
      instance,
      node,
      notationId,
      components: options.state.value.components,
    })
  })

  const selectedNodeComponent = computed(() => {
    const notationId = options.activeNotationId.value
    const componentId = nodeBindingComponentId.value
    if (!notationId || !componentId) return null
    return (
      options.state.value.components.find(
        component => component.id === componentId && component.notationId === notationId
      ) ?? null
    )
  })

  const nodeCustomProperties = computed<CustomProperty[]>(() => {
    if (!selectedNodeComponent.value) return []
    return parseEntityAttrs(selectedNodeComponent.value.attrs ?? null).customProperties.filter(
      property => !property.system
    )
  })

  const selectedNodeTypeEntity = computed(() => {
    const node = options.selectedNode.value
    if (!node) return null
    return options.state.value.nodeTypes.find(nt => nt.id === node.nodeTypeId) ?? null
  })

  const nodeTypeCustomProperties = computed<CustomProperty[]>(() => {
    const nt = selectedNodeTypeEntity.value
    if (!nt) return []
    return parseEntityAttrs(nt.attrs ?? null).customProperties.filter(property => !property.system)
  })

  const nodeTypeScopedValues = computed<Record<string, unknown>>(() => {
    const node = options.selectedNode.value
    if (!node) return {}
    return node.parsedAttrs.typeProperties
  })

  const selectedLinkTypeEntity = computed(() => {
    const link = options.selectedLink.value
    if (!link) return null
    return options.state.value.linkTypes.find(lt => lt.id === link.linkTypeId) ?? null
  })

  const linkTypeCustomProperties = computed<CustomProperty[]>(() => {
    const lt = selectedLinkTypeEntity.value
    if (!lt) return []
    return parseEntityAttrs(lt.attrs ?? null).customProperties.filter(property => !property.system)
  })

  const linkTypeScopedValues = computed<Record<string, unknown>>(() => {
    const link = options.selectedLink.value
    if (!link) return {}
    return link.parsedAttrs.typeProperties
  })

  const nodeScopedValues = computed<Record<string, unknown>>(() => {
    const notationId = options.activeNotationId.value
    const componentId = nodeBindingComponentId.value
    const node = options.selectedNode.value
    if (!notationId || !componentId || !node) return {}
    return getDiagramScopedNodeValues({
      diagram: options.activeDiagram.value?.parsedAttrs,
      modelNodeId: node.id,
      notationId,
      componentId,
      nodeAttrsFallback: node.parsedAttrs,
      instanceId: options.selectedNodeInstanceId.value,
    })
  })

  const diagramsForProps = computed<{ id: string; label: string }[]>(() =>
    options.state.value.diagrams
      .filter(d => !d._isDeleted)
      .map(d => ({ id: d.id, label: `${d.name} ${d.version}` }))
  )

  const linkBindingRelationId = computed(() => {
    const notationId = options.activeNotationId.value
    const link = options.selectedLink.value
    if (!notationId || !link) return null
    return link.parsedAttrs.notationRelations[notationId]?.relationId ?? null
  })

  const linkScopedValues = computed<Record<string, unknown>>(() => {
    const notationId = options.activeNotationId.value
    const relationId = linkBindingRelationId.value
    const link = options.selectedLink.value
    if (!notationId || !relationId || !link) return {}
    return getDiagramScopedLinkValues({
      diagram: options.activeDiagram.value?.parsedAttrs,
      modelLinkId: link.id,
      notationId,
      relationId,
      linkAttrsFallback: link.parsedAttrs,
      edgeInstanceId: options.selectedLinkEdgeInstanceId.value,
    })
  })

  const setNodeTypePropertyValue = (key: string, value: unknown) => {
    const node = options.selectedNode.value
    if (!node) return
    if (Object.is(node.parsedAttrs.typeProperties[key], value)) return
    const nodeId = node.id
    const before = clonePlainDeep(node.parsedAttrs.typeProperties)
    node.parsedAttrs.typeProperties[key] = value
    options.markNodeDirty(node.id)
    const after = clonePlainDeep(node.parsedAttrs.typeProperties)
    options.recordDiagramHistory(`nodeType:${nodeId}`, {
      execute: () => {
        const row = options.state.value.nodes.find(item => item.id === nodeId)
        if (!row) return
        row.parsedAttrs.typeProperties = clonePlainDeep(after)
        options.markNodeDirty(row.id)
      },
      undo: () => {
        const row = options.state.value.nodes.find(item => item.id === nodeId)
        if (!row) return
        row.parsedAttrs.typeProperties = clonePlainDeep(before)
        options.markNodeDirty(row.id)
      },
    })
  }

  const setLinkTypePropertyValue = (key: string, value: unknown) => {
    const link = options.selectedLink.value
    if (!link) return
    if (Object.is(link.parsedAttrs.typeProperties[key], value)) return
    const linkId = link.id
    const before = clonePlainDeep(link.parsedAttrs.typeProperties)
    link.parsedAttrs.typeProperties[key] = value
    options.markLinkDirty(link.id)
    const after = clonePlainDeep(link.parsedAttrs.typeProperties)
    options.recordDiagramHistory(`linkType:${linkId}`, {
      execute: () => {
        const row = options.state.value.links.find(item => item.id === linkId)
        if (!row) return
        row.parsedAttrs.typeProperties = clonePlainDeep(after)
        options.markLinkDirty(row.id)
      },
      undo: () => {
        const row = options.state.value.links.find(item => item.id === linkId)
        if (!row) return
        row.parsedAttrs.typeProperties = clonePlainDeep(before)
        options.markLinkDirty(row.id)
      },
    })
  }

  const setNodeScopedValue = (key: string, value: unknown) => {
    const notationId = options.activeNotationId.value
    const componentId = nodeBindingComponentId.value
    const node = options.selectedNode.value
    const diagram = options.activeDiagram.value
    if (!notationId || !componentId || !node) return

    if (diagram) {
      const instanceId = options.selectedNodeInstanceId.value
      const instance = instanceId
        ? diagram.parsedAttrs.instances.nodes.find(item => item.id === instanceId)
        : null
      const beforeAttrs = clonePlainDeep(instance?.attrs)
      const changed = setDiagramScopedNodeValue({
        diagram: diagram.parsedAttrs,
        modelNodeId: node.id,
        notationId,
        componentId,
        key,
        value,
        nodeAttrsFallback: node.parsedAttrs,
        instanceId,
      })
      if (changed) {
        options.markDiagramDirty(diagram.id)
        const afterAttrs = clonePlainDeep(instance?.attrs)
        const diagramId = diagram.id
        if (instanceId) {
          options.recordDiagramHistory(`nodeScoped:${instanceId}`, {
            execute: () => {
              const d = options.state.value.diagrams.find(
                item => item.id === diagramId && !item._isDeleted
              )
              const inst = d?.parsedAttrs.instances.nodes.find(item => item.id === instanceId)
              if (!d || !inst) return
              inst.attrs = afterAttrs ? clonePlainDeep(afterAttrs) : undefined
              options.markDiagramDirty(d.id)
            },
            undo: () => {
              const d = options.state.value.diagrams.find(
                item => item.id === diagramId && !item._isDeleted
              )
              const inst = d?.parsedAttrs.instances.nodes.find(item => item.id === instanceId)
              if (!d || !inst) return
              inst.attrs = beforeAttrs ? clonePlainDeep(beforeAttrs) : undefined
              options.markDiagramDirty(d.id)
            },
          })
        }
      }
      return
    }

    if (!node.parsedAttrs.componentProperties[notationId]) {
      node.parsedAttrs.componentProperties[notationId] = {}
    }
    if (!node.parsedAttrs.componentProperties[notationId][componentId]) {
      node.parsedAttrs.componentProperties[notationId][componentId] = {}
    }
    const target = node.parsedAttrs.componentProperties[notationId][componentId]!
    if (!Object.is(target[key], value)) {
      target[key] = value
      options.markNodeDirty(node.id)
    }
  }

  const setLinkScopedValue = (key: string, value: unknown) => {
    const notationId = options.activeNotationId.value
    const relationId = linkBindingRelationId.value
    const link = options.selectedLink.value
    const diagram = options.activeDiagram.value
    if (!notationId || !relationId || !link || !diagram) return
    const edgeId = options.selectedLinkEdgeInstanceId.value
    const edge = edgeId ? diagram.parsedAttrs.instances.edges.find(item => item.id === edgeId) : null
    const beforeAttrs = clonePlainDeep(edge?.attrs)
    const changed = setDiagramScopedLinkValue({
      diagram: diagram.parsedAttrs,
      modelLinkId: link.id,
      notationId,
      relationId,
      key,
      value,
      linkAttrsFallback: link.parsedAttrs,
      edgeInstanceId: edgeId,
    })
    if (changed) {
      options.markDiagramDirty(diagram.id)
      if (edgeId) {
        const afterAttrs = clonePlainDeep(edge?.attrs)
        const diagramId = diagram.id
        options.recordDiagramHistory(`linkScoped:${edgeId}`, {
          execute: () => options.applyEdgeInstanceStyleSnapshot(diagramId, edgeId, afterAttrs),
          undo: () => options.applyEdgeInstanceStyleSnapshot(diagramId, edgeId, beforeAttrs),
        })
      }
    }
  }

  return {
    nodeBindingComponentId,
    selectedNodeComponent,
    nodeCustomProperties,
    selectedNodeTypeEntity,
    nodeTypeCustomProperties,
    nodeTypeScopedValues,
    selectedLinkTypeEntity,
    linkTypeCustomProperties,
    linkTypeScopedValues,
    nodeScopedValues,
    diagramsForProps,
    linkBindingRelationId,
    linkScopedValues,
    setNodeTypePropertyValue,
    setLinkTypePropertyValue,
    setNodeScopedValue,
    setLinkScopedValue,
  }
}
