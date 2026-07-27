import { computed, type ComputedRef, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type {
  DiagramResponse,
  LinkResponse,
  NodeResponse,
} from '@/types/api'
import type { CompareSharedData } from '@/api/loadCompareSharedData'
import {
  buildDiagramDiffStateMaps,
  buildNodePathMap,
  computeModelDiff,
  type DiagramDiffStateMaps,
} from '@/utils/modelDiff'
import { parseLinkAttrs, parseNodeAttrs } from '@/features/models/modelAttrs'
import type { EditorDiagram, EditorLink, EditorNode } from '@/features/models/types'
import {
  getDiagramScopedLinkMap,
  getDiagramScopedNodeMap,
} from '@/features/models/utils/diagramScopedProperties'
import {
  toEditorDiagram,
  toEditorLink,
  toEditorNode,
} from './modelEditorMappers'

export { toEditorDiagram, toEditorLink, toEditorNode }

export type ComparisonDataSet = {
  nodes: NodeResponse[]
  links: LinkResponse[]
  diagrams: DiagramResponse[]
}

export type SelectedElement =
  | { kind: 'node'; path: string; side: 'left' | 'right' }
  | {
      kind: 'link'
      sourcePath: string
      targetPath: string
      linkTypeId: string
      side: 'left' | 'right'
      edgeInstanceId?: string
    }

export type PropertyRow = {
  key: string
  base: string
  target: string
  changed: boolean
}

export interface ComparisonDiffOptions {
  leftData: Ref<ComparisonDataSet | null> | ComputedRef<ComparisonDataSet | null>
  rightData: Ref<ComparisonDataSet | null> | ComputedRef<ComparisonDataSet | null>
  leftDiagram: ComputedRef<EditorDiagram | null>
  rightDiagram: ComputedRef<EditorDiagram | null>
  sharedData: Ref<CompareSharedData | null>
  baseSide: Ref<'left' | 'right'>
  selectedElement: Ref<SelectedElement | null>
}

const EMPTY_DIAGRAM_DIFF_STATE: DiagramDiffStateMaps = {
  diffStateByModelNodeId: {},
  diffStateByModelLinkId: {},
  diffStateByEdgeInstanceId: {},
}

export function useComparisonDiff(options: ComparisonDiffOptions) {
  const {
    leftData,
    rightData,
    leftDiagram,
    rightDiagram,
    sharedData,
    baseSide,
    selectedElement,
  } = options

  const { t } = useI18n()

  // ── Editor entities ──

  const leftEditorNodes = computed((): EditorNode[] => {
    const nodes = leftData.value?.nodes ?? []
    return nodes.map(toEditorNode)
  })

  const leftEditorLinks = computed((): EditorLink[] => {
    const links = leftData.value?.links ?? []
    return links.map(toEditorLink)
  })

  const rightEditorNodes = computed((): EditorNode[] => {
    const nodes = rightData.value?.nodes ?? []
    return nodes.map(toEditorNode)
  })

  const rightEditorLinks = computed((): EditorLink[] => {
    const links = rightData.value?.links ?? []
    return links.map(toEditorLink)
  })

  // ── Path maps ──

  const leftPathMap = computed(() =>
    leftData.value ? buildNodePathMap(leftData.value.nodes) : new Map<string, string>(),
  )
  const rightPathMap = computed(() =>
    rightData.value ? buildNodePathMap(rightData.value.nodes) : new Map<string, string>(),
  )

  // ── Stable IDs ──

  function computeDiagramStableIds(
    diagram: EditorDiagram | null,
    editorNodes: EditorNode[],
    editorLinks: EditorLink[],
  ) {
    const instances = diagram?.parsedAttrs?.instances
    if (!instances)
      return { nodeStableIds: new Set<string>(), linkStableIds: new Set<string>() }
    const nodeById = new Map(editorNodes.map((n) => [n.id, n]))
    const nodeStableIds = new Set<string>()
    for (const inst of instances.nodes) {
      const node = nodeById.get(inst.modelNodeId)
      nodeStableIds.add(node?.stableId ?? inst.modelNodeId)
    }
    const linkById = new Map(editorLinks.map((l) => [l.id, l]))
    const linkStableIds = new Set<string>()
    for (const e of instances.edges) {
      const link = linkById.get(e.modelLinkId)
      linkStableIds.add(link?.stableId ?? e.modelLinkId)
    }
    return { nodeStableIds, linkStableIds }
  }

  const leftDiagramStableIds = computed(() =>
    computeDiagramStableIds(leftDiagram.value, leftEditorNodes.value, leftEditorLinks.value),
  )

  const rightDiagramStableIds = computed(() =>
    computeDiagramStableIds(rightDiagram.value, rightEditorNodes.value, rightEditorLinks.value),
  )

  function computeCurrentStableIds(editorNodes: EditorNode[], editorLinks: EditorLink[]) {
    const nodeIdToStableId = new Map<string, string>()
    for (const n of editorNodes) nodeIdToStableId.set(n.id, n.stableId ?? n.id)
    const linkIdToStableId = new Map<string, string>()
    for (const l of editorLinks) linkIdToStableId.set(l.id, l.stableId ?? l.id)
    return { nodeIdToStableId, linkIdToStableId }
  }

  const leftCurrentStableIds = computed(() =>
    computeCurrentStableIds(leftEditorNodes.value, leftEditorLinks.value),
  )

  const rightCurrentStableIds = computed(() =>
    computeCurrentStableIds(rightEditorNodes.value, rightEditorLinks.value),
  )

  // ── Edge instance IDs and signatures ──

  const leftDiagramEdgeInstanceIds = computed(() => {
    const instances = leftDiagram.value?.parsedAttrs?.instances
    return new Set((instances?.edges ?? []).map((e) => e.id))
  })

  const rightDiagramEdgeInstanceIds = computed(() => {
    const instances = rightDiagram.value?.parsedAttrs?.instances
    return new Set((instances?.edges ?? []).map((e) => e.id))
  })

  /**
   * Attachment signature for an edge instance.
   * Uses link stableId (not modelLinkId): model copy remaps link UUIDs but keeps
   * edge/node instance ids, so modelLinkId would false-positive every edge as modified.
   */
  function computeEdgeInstanceSignatures(
    diagram: EditorDiagram | null,
    editorLinks: EditorLink[],
  ) {
    const instances = diagram?.parsedAttrs?.instances
    const linkById = new Map(editorLinks.map((l) => [l.id, l]))
    const byId = new Map<string, string>()
    for (const e of instances?.edges ?? []) {
      const attrs = (e.attrs ?? {}) as Record<string, unknown>
      const fromPort = typeof attrs.fromPortId === 'string' ? attrs.fromPortId : ''
      const toPort = typeof attrs.toPortId === 'string' ? attrs.toPortId : ''
      const fromOutline =
        typeof attrs.fromOutlineParam === 'number' ? attrs.fromOutlineParam : ''
      const toOutline = typeof attrs.toOutlineParam === 'number' ? attrs.toOutlineParam : ''
      const link = linkById.get(e.modelLinkId)
      const linkKey = link?.stableId ?? e.modelLinkId
      byId.set(
        e.id,
        `${linkKey}|${e.sourceInstanceId}|${e.targetInstanceId}|${fromPort}|${toPort}|${fromOutline}|${toOutline}`,
      )
    }
    return byId
  }

  const leftEdgeInstanceSignatures = computed(() =>
    computeEdgeInstanceSignatures(leftDiagram.value, leftEditorLinks.value),
  )

  const rightEdgeInstanceSignatures = computed(() =>
    computeEdgeInstanceSignatures(rightDiagram.value, rightEditorLinks.value),
  )

  const useEdgeInstanceIdMatching = computed(() => {
    const leftIds = leftDiagramEdgeInstanceIds.value
    const rightIds = rightDiagramEdgeInstanceIds.value
    for (const id of leftIds) {
      if (rightIds.has(id)) return true
    }
    return false
  })

  // ── Diff computation ──

  const diff = computed(() => {
    const left = leftData.value
    const right = rightData.value
    if (!left || !right) return null
    return computeModelDiff(
      { nodes: left.nodes, links: left.links, diagrams: left.diagrams },
      { nodes: right.nodes, links: right.links, diagrams: right.diagrams },
    )
  })

  function buildEdges(links: LinkResponse[]) {
    const linkById = new Map(links.map((l) => [l.id, l]))
    return (edgeRefs: Array<{ id: string; modelLinkId: string }>) =>
      edgeRefs
        .map((e) => {
          const link = linkById.get(e.modelLinkId)
          return link
            ? {
                edgeInstanceId: e.id,
                modelLinkId: e.modelLinkId,
                sourceId: link.sourceId,
                targetId: link.targetId,
                linkTypeId: link.linkTypeId,
              }
            : null
        })
        .filter(Boolean) as Array<{
        edgeInstanceId: string
        modelLinkId: string
        sourceId: string
        targetId: string
        linkTypeId: string
      }>
  }

  function buildSideDiagramDiffState(options: {
    d: NonNullable<typeof diff.value>
    diagram: EditorDiagram | null
    edgeLinks: LinkResponse[]
    baseLinks: LinkResponse[]
    targetLinks: LinkResponse[]
    basePathMap: Map<string, string>
    targetPathMap: Map<string, string>
    role: 'base' | 'target'
    otherSideStableIds: ReturnType<typeof computeDiagramStableIds>
    currentStableIds: ReturnType<typeof computeCurrentStableIds>
    otherSideEdgeInstanceIds: Set<string>
    otherSideEdgeInstanceSignatures: Map<string, string>
    currentEdgeInstanceSignatures: Map<string, string>
  }) {
    const {
      d,
      diagram,
      edgeLinks,
      baseLinks,
      targetLinks,
      basePathMap,
      targetPathMap,
      role,
      otherSideStableIds,
      currentStableIds,
      otherSideEdgeInstanceIds,
      otherSideEdgeInstanceSignatures,
      currentEdgeInstanceSignatures,
    } = options
    const instances = diagram?.parsedAttrs?.instances
    if (!diagram || !instances) return { ...EMPTY_DIAGRAM_DIFF_STATE }
    const nodeIds = instances.nodes.map((n) => n.modelNodeId)
    const edges = buildEdges(edgeLinks)(instances.edges)
    return buildDiagramDiffStateMaps(
      d,
      basePathMap,
      targetPathMap,
      baseLinks,
      targetLinks,
      nodeIds,
      edges,
      role,
      {
        otherSideStableIds,
        currentStableIds,
        otherSideEdgeInstanceIds,
        otherSideEdgeInstanceSignatures,
        currentEdgeInstanceSignatures,
        useEdgeInstanceIdMatching: useEdgeInstanceIdMatching.value,
      },
    )
  }

  // ── Diff state maps (left=base) ──

  const leftDiffState = computed(() => {
    const d = diff.value
    const left = leftData.value
    const right = rightData.value
    if (!d || !left || !right) return { ...EMPTY_DIAGRAM_DIFF_STATE }
    return buildSideDiagramDiffState({
      d,
      diagram: leftDiagram.value,
      edgeLinks: left.links,
      baseLinks: left.links,
      targetLinks: right.links,
      basePathMap: leftPathMap.value,
      targetPathMap: rightPathMap.value,
      role: 'base',
      otherSideStableIds: rightDiagramStableIds.value,
      currentStableIds: leftCurrentStableIds.value,
      otherSideEdgeInstanceIds: rightDiagramEdgeInstanceIds.value,
      otherSideEdgeInstanceSignatures: rightEdgeInstanceSignatures.value,
      currentEdgeInstanceSignatures: leftEdgeInstanceSignatures.value,
    })
  })

  const rightDiffState = computed(() => {
    const d = diff.value
    const left = leftData.value
    const right = rightData.value
    if (!d || !left || !right) return { ...EMPTY_DIAGRAM_DIFF_STATE }
    return buildSideDiagramDiffState({
      d,
      diagram: rightDiagram.value,
      edgeLinks: right.links,
      baseLinks: left.links,
      targetLinks: right.links,
      basePathMap: leftPathMap.value,
      targetPathMap: rightPathMap.value,
      role: 'target',
      otherSideStableIds: leftDiagramStableIds.value,
      currentStableIds: rightCurrentStableIds.value,
      otherSideEdgeInstanceIds: leftDiagramEdgeInstanceIds.value,
      otherSideEdgeInstanceSignatures: leftEdgeInstanceSignatures.value,
      currentEdgeInstanceSignatures: rightEdgeInstanceSignatures.value,
    })
  })

  // ── Diff when right is base (reversed) ──

  const diffWhenRightIsBase = computed(() => {
    const left = leftData.value
    const right = rightData.value
    if (!left || !right) return null
    return computeModelDiff(
      { nodes: right.nodes, links: right.links, diagrams: right.diagrams },
      { nodes: left.nodes, links: left.links, diagrams: left.diagrams },
    )
  })

  const leftDiffStateWhenRightIsBase = computed(() => {
    const d = diffWhenRightIsBase.value
    const left = leftData.value
    const right = rightData.value
    if (!d || !left || !right) return { ...EMPTY_DIAGRAM_DIFF_STATE }
    return buildSideDiagramDiffState({
      d,
      diagram: leftDiagram.value,
      edgeLinks: left.links,
      baseLinks: right.links,
      targetLinks: left.links,
      basePathMap: rightPathMap.value,
      targetPathMap: leftPathMap.value,
      role: 'target',
      otherSideStableIds: rightDiagramStableIds.value,
      currentStableIds: leftCurrentStableIds.value,
      otherSideEdgeInstanceIds: rightDiagramEdgeInstanceIds.value,
      otherSideEdgeInstanceSignatures: rightEdgeInstanceSignatures.value,
      currentEdgeInstanceSignatures: leftEdgeInstanceSignatures.value,
    })
  })

  const rightDiffStateWhenRightIsBase = computed(() => {
    const d = diffWhenRightIsBase.value
    const left = leftData.value
    const right = rightData.value
    if (!d || !left || !right) return { ...EMPTY_DIAGRAM_DIFF_STATE }
    return buildSideDiagramDiffState({
      d,
      diagram: rightDiagram.value,
      edgeLinks: right.links,
      baseLinks: right.links,
      targetLinks: left.links,
      basePathMap: rightPathMap.value,
      targetPathMap: leftPathMap.value,
      role: 'base',
      otherSideStableIds: leftDiagramStableIds.value,
      currentStableIds: rightCurrentStableIds.value,
      otherSideEdgeInstanceIds: leftDiagramEdgeInstanceIds.value,
      otherSideEdgeInstanceSignatures: leftEdgeInstanceSignatures.value,
      currentEdgeInstanceSignatures: rightEdgeInstanceSignatures.value,
    })
  })

  // ── Combined diff state based on baseSide ──

  const leftCanvasDiffState = computed(() =>
    baseSide.value === 'left' ? leftDiffState.value : leftDiffStateWhenRightIsBase.value,
  )
  const rightCanvasDiffState = computed(() =>
    baseSide.value === 'left' ? rightDiffState.value : rightDiffStateWhenRightIsBase.value,
  )

  // ── Toggle base side ──

  function handleToggleBaseSide(): void {
    baseSide.value = baseSide.value === 'left' ? 'right' : 'left'
  }

  // ── Selection event handlers ──

  function handleLeftSelectNodes(ids: string[]): void {
    if (ids.length !== 1 || !leftPathMap.value) return
    const path = leftPathMap.value.get(ids[0]!)
    if (path !== undefined) selectedElement.value = { kind: 'node', path, side: 'left' }
  }

  function handleLeftSelectLink(linkId: string | null): void {
    if (!linkId) return
    const link = leftData.value?.links.find((l) => l.id === linkId)
    if (!link || !leftPathMap.value) return
    const sp = leftPathMap.value.get(link.sourceId)
    const tp = leftPathMap.value.get(link.targetId)
    if (sp !== undefined && tp !== undefined)
      selectedElement.value = {
        kind: 'link',
        sourcePath: sp,
        targetPath: tp,
        linkTypeId: link.linkTypeId,
        side: 'left',
      }
  }

  function handleLeftSelectEdgeInstanceId(edgeInstanceId: string | null): void {
    if (!edgeInstanceId) return
    const diagram = leftDiagram.value
    const data = leftData.value
    if (!diagram || !data) return
    const instances = diagram.parsedAttrs?.instances
    if (!instances) return
    const edgeInst = instances.edges.find((e) => e.id === edgeInstanceId)
    if (!edgeInst) return
    const link = data.links.find((l) => l.id === edgeInst.modelLinkId)
    if (!link || !leftPathMap.value) return
    const nodeInstanceToModelNodeId = new Map(
      instances.nodes.map((n) => [n.id, n.modelNodeId]),
    )
    const sourceModelNodeId =
      nodeInstanceToModelNodeId.get(edgeInst.sourceInstanceId) ?? link.sourceId
    const targetModelNodeId =
      nodeInstanceToModelNodeId.get(edgeInst.targetInstanceId) ?? link.targetId
    const sp = leftPathMap.value.get(sourceModelNodeId)
    const tp = leftPathMap.value.get(targetModelNodeId)
    if (sp !== undefined && tp !== undefined) {
      selectedElement.value = {
        kind: 'link',
        sourcePath: sp,
        targetPath: tp,
        linkTypeId: link.linkTypeId,
        side: 'left',
        edgeInstanceId,
      }
    }
  }

  function handleRightSelectNodes(ids: string[]): void {
    if (ids.length !== 1 || !rightPathMap.value) return
    const path = rightPathMap.value.get(ids[0]!)
    if (path !== undefined) selectedElement.value = { kind: 'node', path, side: 'right' }
  }

  function handleRightSelectLink(linkId: string | null): void {
    if (!linkId) return
    const link = rightData.value?.links.find((l) => l.id === linkId)
    if (!link || !rightPathMap.value) return
    const sp = rightPathMap.value.get(link.sourceId)
    const tp = rightPathMap.value.get(link.targetId)
    if (sp !== undefined && tp !== undefined)
      selectedElement.value = {
        kind: 'link',
        sourcePath: sp,
        targetPath: tp,
        linkTypeId: link.linkTypeId,
        side: 'right',
      }
  }

  function handleRightSelectEdgeInstanceId(edgeInstanceId: string | null): void {
    if (!edgeInstanceId) return
    const diagram = rightDiagram.value
    const data = rightData.value
    if (!diagram || !data) return
    const instances = diagram.parsedAttrs?.instances
    if (!instances) return
    const edgeInst = instances.edges.find((e) => e.id === edgeInstanceId)
    if (!edgeInst) return
    const link = data.links.find((l) => l.id === edgeInst.modelLinkId)
    if (!link || !rightPathMap.value) return
    const nodeInstanceToModelNodeId = new Map(
      instances.nodes.map((n) => [n.id, n.modelNodeId]),
    )
    const sourceModelNodeId =
      nodeInstanceToModelNodeId.get(edgeInst.sourceInstanceId) ?? link.sourceId
    const targetModelNodeId =
      nodeInstanceToModelNodeId.get(edgeInst.targetInstanceId) ?? link.targetId
    const sp = rightPathMap.value.get(sourceModelNodeId)
    const tp = rightPathMap.value.get(targetModelNodeId)
    if (sp !== undefined && tp !== undefined) {
      selectedElement.value = {
        kind: 'link',
        sourcePath: sp,
        targetPath: tp,
        linkTypeId: link.linkTypeId,
        side: 'right',
        edgeInstanceId,
      }
    }
  }

  // ── Property panel helpers ──

  const leftByPath = computed(() => {
    const map = new Map<string, NodeResponse>()
    if (!leftData.value) return map
    const pathMap = buildNodePathMap(leftData.value.nodes)
    for (const n of leftData.value.nodes) {
      const p = pathMap.get(n.id)
      if (p !== undefined) map.set(p, n)
    }
    return map
  })

  const rightByPath = computed(() => {
    const map = new Map<string, NodeResponse>()
    if (!rightData.value) return map
    const pathMap = buildNodePathMap(rightData.value.nodes)
    for (const n of rightData.value.nodes) {
      const p = pathMap.get(n.id)
      if (p !== undefined) map.set(p, n)
    }
    return map
  })

  function linkKey(sp: string, tp: string, lt: string): string {
    return `${sp}\t${tp}\t${lt}`
  }

  const leftByLinkKey = computed(() => {
    const map = new Map<string, LinkResponse>()
    if (!leftData.value || !leftPathMap.value) return map
    for (const l of leftData.value.links) {
      const sp = leftPathMap.value.get(l.sourceId)
      const tp = leftPathMap.value.get(l.targetId)
      if (sp !== undefined && tp !== undefined) map.set(linkKey(sp, tp, l.linkTypeId), l)
    }
    return map
  })

  const rightByLinkKey = computed(() => {
    const map = new Map<string, LinkResponse>()
    if (!rightData.value || !rightPathMap.value) return map
    for (const l of rightData.value.links) {
      const sp = rightPathMap.value.get(l.sourceId)
      const tp = rightPathMap.value.get(l.targetId)
      if (sp !== undefined && tp !== undefined) map.set(linkKey(sp, tp, l.linkTypeId), l)
    }
    return map
  })

  function resolveLinkSideSnapshot(
    side: 'left' | 'right',
    edgeInstanceId: string | undefined,
  ): { link: LinkResponse | null; sourcePath: string | null; targetPath: string | null } {
    const diagram = side === 'left' ? leftDiagram.value : rightDiagram.value
    const data = side === 'left' ? leftData.value : rightData.value
    const pathMap = side === 'left' ? leftPathMap.value : rightPathMap.value
    if (!diagram || !data || !edgeInstanceId) {
      return { link: null, sourcePath: null, targetPath: null }
    }

    const instances = diagram.parsedAttrs?.instances
    if (!instances) {
      return { link: null, sourcePath: null, targetPath: null }
    }

    const edgeInst = instances.edges.find((e) => e.id === edgeInstanceId)
    if (!edgeInst) {
      return { link: null, sourcePath: null, targetPath: null }
    }

    const link = data.links.find((l) => l.id === edgeInst.modelLinkId) ?? null
    if (!link) {
      return { link: null, sourcePath: null, targetPath: null }
    }

    const nodeInstanceToModelNodeId = new Map(
      instances.nodes.map((n) => [n.id, n.modelNodeId]),
    )
    const sourceModelNodeId =
      nodeInstanceToModelNodeId.get(edgeInst.sourceInstanceId) ?? link.sourceId
    const targetModelNodeId =
      nodeInstanceToModelNodeId.get(edgeInst.targetInstanceId) ?? link.targetId

    return {
      link,
      sourcePath: pathMap.get(sourceModelNodeId) ?? null,
      targetPath: pathMap.get(targetModelNodeId) ?? null,
    }
  }

  function formatPropValue(v: unknown): string {
    if (v === undefined || v === null) return '\u2014'
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v)
    const s = JSON.stringify(v)
    return s.length > 80 ? `${s.slice(0, 77)}\u2026` : s
  }

  function pathForDisplay(path: string): string {
    return path.startsWith('Root/') ? path.slice(5) : path
  }

  // ── Notation / component / relation name maps ──

  const notationNameById = computed(() => {
    const map = new Map<string, string>()
    for (const notation of sharedData.value?.notations ?? []) {
      map.set(notation.id, notation.name)
    }
    return map
  })

  const componentNameById = computed(() => {
    const map = new Map<string, string>()
    for (const component of sharedData.value?.components ?? []) {
      map.set(component.id, component.name)
    }
    return map
  })

  const relationNameById = computed(() => {
    const map = new Map<string, string>()
    for (const relation of sharedData.value?.relations ?? []) {
      map.set(relation.id, relation.name)
    }
    return map
  })

  function formatScopedPropertyKey(
    notationId: string,
    entityId: string,
    propKey: string,
    kind: 'component' | 'relation',
  ): string {
    const notationName = notationNameById.value.get(notationId) ?? notationId
    const entityName =
      kind === 'component'
        ? (componentNameById.value.get(entityId) ?? entityId)
        : (relationNameById.value.get(entityId) ?? entityId)
    return `${notationName} / ${entityName} / ${propKey}`
  }

  function flattenComponentProperties(
    componentProperties: Record<string, Record<string, Record<string, unknown>>>,
  ): Array<{ key: string; value: unknown }> {
    const out: Array<{ key: string; value: unknown }> = []
    for (const [notationId, byComponent] of Object.entries(componentProperties)) {
      for (const [componentId, props] of Object.entries(byComponent)) {
        for (const [propKey, value] of Object.entries(props)) {
          out.push({
            key: formatScopedPropertyKey(notationId, componentId, propKey, 'component'),
            value,
          })
        }
      }
    }
    return out
  }

  function flattenRelationProperties(
    relationProperties: Record<string, Record<string, Record<string, unknown>>>,
  ): Array<{ key: string; value: unknown }> {
    const out: Array<{ key: string; value: unknown }> = []
    for (const [notationId, byRelation] of Object.entries(relationProperties)) {
      for (const [relationId, props] of Object.entries(byRelation)) {
        for (const [propKey, value] of Object.entries(props)) {
          out.push({
            key: formatScopedPropertyKey(notationId, relationId, propKey, 'relation'),
            value,
          })
        }
      }
    }
    return out
  }

  function getNodePropertiesForSide(
    side: 'left' | 'right',
    modelNodeId: string,
  ): Record<string, Record<string, Record<string, unknown>>> {
    const diagram = side === 'left' ? leftDiagram.value : rightDiagram.value
    const data = side === 'left' ? leftData.value : rightData.value
    const node = data?.nodes.find((item) => item.id === modelNodeId)
    return getDiagramScopedNodeMap({
      diagram: diagram?.parsedAttrs,
      modelNodeId,
      nodeAttrsFallback: node ? parseNodeAttrs(node.attrs) : null,
    })
  }

  function getLinkPropertiesForSide(
    side: 'left' | 'right',
    modelLinkId: string,
    edgeInstanceId?: string,
  ): Record<string, Record<string, Record<string, unknown>>> {
    const diagram = side === 'left' ? leftDiagram.value : rightDiagram.value
    const data = side === 'left' ? leftData.value : rightData.value
    const link = data?.links.find((item) => item.id === modelLinkId)
    return getDiagramScopedLinkMap({
      diagram: diagram?.parsedAttrs,
      modelLinkId,
      linkAttrsFallback: link ? parseLinkAttrs(link.attrs) : null,
      edgeInstanceId,
    })
  }

  // ── Selected element property rows ──

  const selectedPropertyRows = computed<PropertyRow[]>(() => {
    const sel = selectedElement.value
    if (!sel) return []
    const isLeftBase = baseSide.value === 'left'
    const leftNodeByPath = leftByPath.value
    const rightNodeByPath = rightByPath.value
    const leftNodePathMap = leftPathMap.value
    const rightNodePathMap = rightPathMap.value
    const leftLinkMap = leftByLinkKey.value
    const rightLinkMap = rightByLinkKey.value
    const leftDiff = leftCanvasDiffState.value.diffStateByModelNodeId
    const rightDiff = rightCanvasDiffState.value.diffStateByModelNodeId
    const leftLinkDiff = leftCanvasDiffState.value.diffStateByModelLinkId
    const rightLinkDiff = rightCanvasDiffState.value.diffStateByModelLinkId

    const hideRight = (modelNodeId: string): boolean =>
      leftDiff[modelNodeId] === 'removed' || leftDiff[modelNodeId] === 'added'
    const hideLeft = (modelNodeId: string): boolean =>
      rightDiff[modelNodeId] === 'removed' || rightDiff[modelNodeId] === 'added'
    const hideRightLink = (modelLinkId: string): boolean =>
      leftLinkDiff[modelLinkId] === 'removed' || leftLinkDiff[modelLinkId] === 'added'
    const hideLeftLink = (modelLinkId: string): boolean =>
      rightLinkDiff[modelLinkId] === 'removed' || rightLinkDiff[modelLinkId] === 'added'

    if (sel.kind === 'node') {
      const leftNode = leftNodeByPath.get(sel.path)
      const rightNode = rightNodeByPath.get(sel.path)
      const rightAbsent = leftNode && sel.side === 'left' && hideRight(leftNode.id)
      const leftAbsent = rightNode && sel.side === 'right' && hideLeft(rightNode.id)
      const leftScopedMap = leftNode ? getNodePropertiesForSide('left', leftNode.id) : {}
      const rightScopedMap = rightNode ? getNodePropertiesForSide('right', rightNode.id) : {}
      const rows: PropertyRow[] = []
      rows.push({
        key: 'name',
        base: isLeftBase
          ? leftAbsent
            ? '\u2014'
            : leftNode
              ? leftNode.name
              : '\u2014'
          : rightAbsent
            ? '\u2014'
            : rightNode
              ? rightNode.name
              : '\u2014',
        target: isLeftBase
          ? rightAbsent
            ? '\u2014'
            : rightNode
              ? rightNode.name
              : '\u2014'
          : leftAbsent
            ? '\u2014'
            : leftNode
              ? leftNode.name
              : '\u2014',
        changed:
          leftAbsent || rightAbsent || (leftNode?.name ?? '') !== (rightNode?.name ?? ''),
      })
      const leftFlat = flattenComponentProperties(leftScopedMap)
      const rightFlat = flattenComponentProperties(rightScopedMap)
      const allKeys = new Set([...leftFlat.map((x) => x.key), ...rightFlat.map((x) => x.key)])
      const leftByKey = new Map(leftFlat.map((x) => [x.key, x.value]))
      const rightByKey = new Map(rightFlat.map((x) => [x.key, x.value]))
      for (const key of Array.from(allKeys).sort()) {
        const leftVal = leftAbsent ? undefined : leftByKey.get(key)
        const rightVal = rightAbsent ? undefined : rightByKey.get(key)
        const leftStr = formatPropValue(leftVal)
        const rightStr = formatPropValue(rightVal)
        rows.push({
          key,
          base: isLeftBase ? leftStr : rightStr,
          target: isLeftBase ? rightStr : leftStr,
          changed: leftStr !== rightStr,
        })
      }
      return rows
    } else {
      const leftSnapshot = resolveLinkSideSnapshot('left', sel.edgeInstanceId)
      const rightSnapshot = resolveLinkSideSnapshot('right', sel.edgeInstanceId)
      const lk = linkKey(sel.sourcePath, sel.targetPath, sel.linkTypeId)
      const leftLink = leftSnapshot.link ?? leftLinkMap.get(lk)
      const rightLink = rightSnapshot.link ?? rightLinkMap.get(lk)
      const rightAbsent = leftLink && sel.side === 'left' && hideRightLink(leftLink.id)
      const leftAbsent = rightLink && sel.side === 'right' && hideLeftLink(rightLink.id)
      const leftRouteSource =
        leftSnapshot.sourcePath ??
        (leftLink ? (leftNodePathMap.get(leftLink.sourceId) ?? null) : null)
      const leftRouteTarget =
        leftSnapshot.targetPath ??
        (leftLink ? (leftNodePathMap.get(leftLink.targetId) ?? null) : null)
      const rightRouteSource =
        rightSnapshot.sourcePath ??
        (rightLink ? (rightNodePathMap.get(rightLink.sourceId) ?? null) : null)
      const rightRouteTarget =
        rightSnapshot.targetPath ??
        (rightLink ? (rightNodePathMap.get(rightLink.targetId) ?? null) : null)

      const leftRoute =
        leftRouteSource && leftRouteTarget
          ? `${pathForDisplay(leftRouteSource)} -> ${pathForDisplay(leftRouteTarget)}`
          : '\u2014'
      const rightRoute =
        rightRouteSource && rightRouteTarget
          ? `${pathForDisplay(rightRouteSource)} -> ${pathForDisplay(rightRouteTarget)}`
          : '\u2014'
      const leftScopedMap = leftLink
        ? getLinkPropertiesForSide('left', leftLink.id, sel.edgeInstanceId)
        : {}
      const rightScopedMap = rightLink
        ? getLinkPropertiesForSide('right', rightLink.id, sel.edgeInstanceId)
        : {}
      const leftFlat = flattenRelationProperties(leftScopedMap)
      const rightFlat = flattenRelationProperties(rightScopedMap)
      const allKeys = new Set([...leftFlat.map((x) => x.key), ...rightFlat.map((x) => x.key)])
      const leftByKey = new Map(leftFlat.map((x) => [x.key, x.value]))
      const rightByKey = new Map(rightFlat.map((x) => [x.key, x.value]))
      const rows: PropertyRow[] = [
        {
          key: t('models.compareLinkRoute'),
          base: isLeftBase ? leftRoute : rightRoute,
          target: isLeftBase ? rightRoute : leftRoute,
          changed: leftRoute !== rightRoute,
        },
      ]
      for (const key of Array.from(allKeys).sort()) {
        const leftVal = leftAbsent ? undefined : leftByKey.get(key)
        const rightVal = rightAbsent ? undefined : rightByKey.get(key)
        const leftStr = formatPropValue(leftVal)
        const rightStr = formatPropValue(rightVal)
        rows.push({
          key,
          base: isLeftBase ? leftStr : rightStr,
          target: isLeftBase ? rightStr : leftStr,
          changed: leftStr !== rightStr,
        })
      }
      return rows
    }
  })

  const selectedElementDiffKind = computed<'added' | 'removed' | 'modified' | null>(() => {
    const sel = selectedElement.value
    if (!sel) return null

    if (sel.kind === 'node') {
      const node = (sel.side === 'left' ? leftByPath.value : rightByPath.value).get(sel.path)
      if (!node) return null
      const diffMap =
        sel.side === 'left'
          ? leftCanvasDiffState.value.diffStateByModelNodeId
          : rightCanvasDiffState.value.diffStateByModelNodeId
      return diffMap[node.id] ?? null
    }

    const sideDiffState =
      sel.side === 'left' ? leftCanvasDiffState.value : rightCanvasDiffState.value
    if (sel.edgeInstanceId) {
      const byEdge = sideDiffState.diffStateByEdgeInstanceId[sel.edgeInstanceId]
      if (byEdge) return byEdge
    }

    const lk = linkKey(sel.sourcePath, sel.targetPath, sel.linkTypeId)
    const sideSnapshot = resolveLinkSideSnapshot(sel.side, sel.edgeInstanceId)
    const sideLink =
      sideSnapshot.link ??
      (sel.side === 'left' ? leftByLinkKey.value : rightByLinkKey.value).get(lk)
    if (!sideLink) return null
    return sideDiffState.diffStateByModelLinkId[sideLink.id] ?? null
  })

  const comparePropWasLabel = computed(() =>
    baseSide.value === 'left' ? t('models.comparePropWas') : t('models.comparePropWasRight'),
  )

  const comparePropBecameLabel = computed(() =>
    baseSide.value === 'left'
      ? t('models.comparePropBecame')
      : t('models.comparePropBecameLeft'),
  )

  const isLeftBaseForProps = computed(() => baseSide.value === 'left')

  const selectedElementLabel = computed(() => {
    const sel = selectedElement.value
    if (!sel) return null
    if (sel.kind === 'node') return pathForDisplay(sel.path)
    return `${pathForDisplay(sel.sourcePath)} \u2192 ${pathForDisplay(sel.targetPath)}`
  })

  return {
    // Editor entities
    leftEditorNodes,
    leftEditorLinks,
    rightEditorNodes,
    rightEditorLinks,

    // Diff state for canvases
    leftCanvasDiffState,
    rightCanvasDiffState,

    // Event handlers
    handleToggleBaseSide,
    handleLeftSelectNodes,
    handleLeftSelectLink,
    handleLeftSelectEdgeInstanceId,
    handleRightSelectNodes,
    handleRightSelectLink,
    handleRightSelectEdgeInstanceId,

    // Property panel
    selectedPropertyRows,
    selectedElementDiffKind,
    comparePropWasLabel,
    comparePropBecameLabel,
    isLeftBaseForProps,
    selectedElementLabel,
  }
}
