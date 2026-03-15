<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import { useI18n } from "vue-i18n"
import { apiGet } from "@/composables/useApi"
import type { PaginatedResponse } from "@/types/entities"
import type {
  DiagramResponse,
  LinkResponse,
  LinkTypeResponse,
  NodeResponse,
  NodeTypeResponse,
} from "@/types/api"
import { type CompareSharedData, loadCompareSharedData } from "@/api/loadCompareSharedData"
import { useResizablePropsPanel } from "@/composables/useResizablePropsPanel"
import MainLayout from "@/layouts/MainLayout.vue"
import AppHeader from "@/components/layout/AppHeader.vue"
import AppFooter from "@/components/layout/AppFooter.vue"
import ModelDiagramCanvas from "@/features/models/components/ModelDiagramCanvas.vue"
import {
  buildDiagramDiffStateMaps,
  buildNodePathMap,
  computeModelDiff,
} from "@/utils/modelDiff"
import { compareVersions } from "@/utils/version"
import {
  parseDiagramAttrs,
  parseLinkAttrs,
  parseNodeAttrs,
} from "@/features/models/modelAttrs"
import type { EditorDiagram, EditorLink, EditorNode } from "@/features/models/types"
import {
  getDiagramScopedLinkMap,
  getDiagramScopedNodeMap,
} from "@/features/models/utils/diagramScopedProperties"

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

/** id версии модели (как в редакторе). */
const versionId = computed(() => route.params.id as string)
const diagramNameFromQuery = computed(() => (route.query.diagram as string) ?? "")

const versionData = ref<{
  nodes: NodeResponse[]
  links: LinkResponse[]
  diagrams: DiagramResponse[]
  nodeTypes: NodeTypeResponse[]
  linkTypes: LinkTypeResponse[]
} | null>(null)
const diagramName = ref<string>("")
const leftDiagramId = ref<string>("")
const rightDiagramId = ref<string>("")

const sharedData = ref<CompareSharedData | null>(null)

const loading = ref(false)
const error = ref<string | null>(null)

const baseSide = ref<"left" | "right">("left")

const leftCanvasRef = ref<InstanceType<typeof ModelDiagramCanvas> | null>(null)
const rightCanvasRef = ref<InstanceType<typeof ModelDiagramCanvas> | null>(null)

const { propsPanelHeight, startPropsPanelResize } = useResizablePropsPanel(
  "warchi:diagram-versions-compare:props-panel-height",
)

type SelectedElement =
  | { kind: "node"; path: string; side: "left" | "right" }
  | {
      kind: "link"
      sourcePath: string
      targetPath: string
      linkTypeId: string
      side: "left" | "right"
      edgeInstanceId?: string
    }
const selectedElement = ref<SelectedElement | null>(null)

async function loadVersionData(): Promise<void> {
  const id = versionId.value
  if (!id) return
  loading.value = true
  error.value = null
  try {
    const listQuery = new URLSearchParams({ size: "1000" })
    const [nodesRes, linksRes, diagramsRes, nodeTypesRes, linkTypesRes] = await Promise.all([
      apiGet<PaginatedResponse<NodeResponse>>(`/nodes?modelId=${encodeURIComponent(id)}&${listQuery.toString()}`),
      apiGet<PaginatedResponse<LinkResponse>>(`/links?modelId=${encodeURIComponent(id)}&${listQuery.toString()}`),
      apiGet<PaginatedResponse<DiagramResponse>>(`/diagrams?modelId=${encodeURIComponent(id)}&${listQuery.toString()}`),
      apiGet<PaginatedResponse<NodeTypeResponse>>(`/node-types?modelId=${encodeURIComponent(id)}&${listQuery.toString()}`),
      apiGet<PaginatedResponse<LinkTypeResponse>>(`/link-types?modelId=${encodeURIComponent(id)}&${listQuery.toString()}`),
    ])
    if (!nodesRes.success || !linksRes.success || !diagramsRes.success) {
      versionData.value = null
      return
    }
    versionData.value = {
      nodes: nodesRes.data.content ?? [],
      links: linksRes.data.content ?? [],
      diagrams: diagramsRes.data.content ?? [],
      nodeTypes: nodeTypesRes.success ? nodeTypesRes.data.content ?? [] : [],
      linkTypes: linkTypesRes.success ? linkTypesRes.data.content ?? [] : [],
    }
    if (versionData.value.diagrams.length > 0 && !diagramName.value) {
      diagramName.value = diagramNameFromQuery.value.trim() || versionData.value.diagrams[0]!.name
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Ошибка загрузки"
  } finally {
    loading.value = false
  }
}

async function loadSharedData(): Promise<void> {
  sharedData.value = await loadCompareSharedData()
}

/** Версии диаграммы с выбранным именем, по убыванию версии. */
const diagramsWithName = computed((): DiagramResponse[] => {
  const list = versionData.value?.diagrams ?? []
  const name = diagramName.value.trim()
  if (!name) return []
  return list
    .filter((d) => d.name.trim() === name)
    .sort((a, b) => compareVersions(b.version, a.version))
})

const diagramNames = computed(() => {
  const names = new Set<string>()
  versionData.value?.diagrams.forEach((d) => names.add(d.name))
  return Array.from(names).sort()
})

function toEditorNode(r: NodeResponse): EditorNode {
  return { ...r, parsedAttrs: parseNodeAttrs(r.attrs ?? null) }
}
function toEditorLink(r: LinkResponse): EditorLink {
  return { ...r, parsedAttrs: parseLinkAttrs(r.attrs ?? null) }
}
function toEditorDiagram(r: DiagramResponse): EditorDiagram {
  return { ...r, parsedAttrs: parseDiagramAttrs(r.attrs ?? null) }
}

/** Синтетические данные для diff: слева — только левая диаграмма, справа — только правая. */
const leftData = computed(() => {
  const v = versionData.value
  const left = leftDiagramRaw.value
  if (!v || !left) return null
  return { ...v, diagrams: [left] }
})

const rightData = computed(() => {
  const v = versionData.value
  const right = rightDiagramRaw.value
  if (!v || !right) return null
  return { ...v, diagrams: [right] }
})

const leftDiagramRaw = computed((): DiagramResponse | null => {
  const list = versionData.value?.diagrams ?? []
  if (!leftDiagramId.value) return null
  return list.find((d) => d.id === leftDiagramId.value) ?? null
})

const rightDiagramRaw = computed((): DiagramResponse | null => {
  const list = versionData.value?.diagrams ?? []
  if (!rightDiagramId.value) return null
  return list.find((d) => d.id === rightDiagramId.value) ?? null
})

const leftDiagram = computed((): EditorDiagram | null => {
  const d = leftDiagramRaw.value
  return d ? toEditorDiagram(d) : null
})

const rightDiagram = computed((): EditorDiagram | null => {
  const d = rightDiagramRaw.value
  return d ? toEditorDiagram(d) : null
})

const leftEditorNodes = computed((): EditorNode[] => {
  const nodes = versionData.value?.nodes ?? []
  return nodes.map(toEditorNode)
})

const rightEditorNodes = computed((): EditorNode[] => {
  const nodes = versionData.value?.nodes ?? []
  return nodes.map(toEditorNode)
})

const leftEditorLinks = computed((): EditorLink[] => {
  const links = versionData.value?.links ?? []
  return links.map(toEditorLink)
})

const rightEditorLinks = computed((): EditorLink[] => {
  const links = versionData.value?.links ?? []
  return links.map(toEditorLink)
})

const leftPathMap = computed(() =>
  versionData.value ? buildNodePathMap(versionData.value.nodes) : new Map<string, string>()
)
const rightPathMap = computed(() =>
  versionData.value ? buildNodePathMap(versionData.value.nodes) : new Map<string, string>()
)

const leftDiagramStableIds = computed(() => {
  const instances = leftDiagram.value?.parsedAttrs?.instances
  const editorNodes = leftEditorNodes.value
  const editorLinks = leftEditorLinks.value
  if (!instances) return { nodeStableIds: new Set<string>(), linkStableIds: new Set<string>() }
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
})

const rightDiagramStableIds = computed(() => {
  const instances = rightDiagram.value?.parsedAttrs?.instances
  const editorNodes = rightEditorNodes.value
  const editorLinks = rightEditorLinks.value
  if (!instances) return { nodeStableIds: new Set<string>(), linkStableIds: new Set<string>() }
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
})

const leftCurrentStableIds = computed(() => {
  const editorNodes = leftEditorNodes.value
  const editorLinks = leftEditorLinks.value
  const nodeIdToStableId = new Map<string, string>()
  for (const n of editorNodes) nodeIdToStableId.set(n.id, n.stableId ?? n.id)
  const linkIdToStableId = new Map<string, string>()
  for (const l of editorLinks) linkIdToStableId.set(l.id, l.stableId ?? l.id)
  return { nodeIdToStableId, linkIdToStableId }
})

const rightCurrentStableIds = computed(() => {
  const editorNodes = rightEditorNodes.value
  const editorLinks = rightEditorLinks.value
  const nodeIdToStableId = new Map<string, string>()
  for (const n of editorNodes) nodeIdToStableId.set(n.id, n.stableId ?? n.id)
  const linkIdToStableId = new Map<string, string>()
  for (const l of editorLinks) linkIdToStableId.set(l.id, l.stableId ?? l.id)
  return { nodeIdToStableId, linkIdToStableId }
})

const diff = computed(() => {
  const left = leftData.value
  const right = rightData.value
  if (!left || !right) return null
  return computeModelDiff(
    { nodes: left.nodes, links: left.links, diagrams: left.diagrams },
    { nodes: right.nodes, links: right.links, diagrams: right.diagrams }
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

const leftDiagramEdgeInstanceIds = computed(() => {
  const instances = leftDiagram.value?.parsedAttrs?.instances
  return new Set((instances?.edges ?? []).map((e) => e.id))
})

const rightDiagramEdgeInstanceIds = computed(() => {
  const instances = rightDiagram.value?.parsedAttrs?.instances
  return new Set((instances?.edges ?? []).map((e) => e.id))
})

const leftEdgeInstanceSignatures = computed(() => {
  const instances = leftDiagram.value?.parsedAttrs?.instances
  const byId = new Map<string, string>()
  for (const e of instances?.edges ?? []) {
    const attrs = (e.attrs ?? {}) as Record<string, unknown>
    const fromPort = typeof attrs.fromPortId === 'string' ? attrs.fromPortId : ''
    const toPort = typeof attrs.toPortId === 'string' ? attrs.toPortId : ''
    const fromOutline = typeof attrs.fromOutlineParam === 'number' ? attrs.fromOutlineParam : ''
    const toOutline = typeof attrs.toOutlineParam === 'number' ? attrs.toOutlineParam : ''
    byId.set(
      e.id,
      `${e.modelLinkId}|${e.sourceInstanceId}|${e.targetInstanceId}|${fromPort}|${toPort}|${fromOutline}|${toOutline}`
    )
  }
  return byId
})

const rightEdgeInstanceSignatures = computed(() => {
  const instances = rightDiagram.value?.parsedAttrs?.instances
  const byId = new Map<string, string>()
  for (const e of instances?.edges ?? []) {
    const attrs = (e.attrs ?? {}) as Record<string, unknown>
    const fromPort = typeof attrs.fromPortId === 'string' ? attrs.fromPortId : ''
    const toPort = typeof attrs.toPortId === 'string' ? attrs.toPortId : ''
    const fromOutline = typeof attrs.fromOutlineParam === 'number' ? attrs.fromOutlineParam : ''
    const toOutline = typeof attrs.toOutlineParam === 'number' ? attrs.toOutlineParam : ''
    byId.set(
      e.id,
      `${e.modelLinkId}|${e.sourceInstanceId}|${e.targetInstanceId}|${fromPort}|${toPort}|${fromOutline}|${toOutline}`
    )
  }
  return byId
})

const useEdgeInstanceIdMatching = computed(() => {
  const leftIds = leftDiagramEdgeInstanceIds.value
  const rightIds = rightDiagramEdgeInstanceIds.value
  for (const id of leftIds) {
    if (rightIds.has(id)) return true
  }
  return false
})

const leftDiffState = computed(() => {
  const d = diff.value
  const diagram = leftDiagram.value
  const left = leftData.value
  const right = rightData.value
  if (!d || !diagram || !left || !right) return { diffStateByModelNodeId: {}, diffStateByModelLinkId: {}, diffStateByEdgeInstanceId: {} }
  const instances = diagram.parsedAttrs?.instances
  if (!instances) return { diffStateByModelNodeId: {}, diffStateByModelLinkId: {}, diffStateByEdgeInstanceId: {} }
  const nodeIds = instances.nodes.map((n) => n.modelNodeId)
  const edges = buildEdges(left.links)(instances.edges)
  return buildDiagramDiffStateMaps(
    d,
    leftPathMap.value,
    rightPathMap.value,
    left.links,
    right.links,
    nodeIds,
    edges,
    "base",
    {
      otherSideStableIds: rightDiagramStableIds.value,
      currentStableIds: leftCurrentStableIds.value,
      otherSideEdgeInstanceIds: rightDiagramEdgeInstanceIds.value,
      otherSideEdgeInstanceSignatures: rightEdgeInstanceSignatures.value,
      currentEdgeInstanceSignatures: leftEdgeInstanceSignatures.value,
      useEdgeInstanceIdMatching: useEdgeInstanceIdMatching.value,
    }
  )
})

const rightDiffState = computed(() => {
  const d = diff.value
  const diagram = rightDiagram.value
  const left = leftData.value
  const right = rightData.value
  if (!d || !diagram || !left || !right) return { diffStateByModelNodeId: {}, diffStateByModelLinkId: {}, diffStateByEdgeInstanceId: {} }
  const instances = diagram.parsedAttrs?.instances
  if (!instances) return { diffStateByModelNodeId: {}, diffStateByModelLinkId: {}, diffStateByEdgeInstanceId: {} }
  const nodeIds = instances.nodes.map((n) => n.modelNodeId)
  const edges = buildEdges(right.links)(instances.edges)
  return buildDiagramDiffStateMaps(
    d,
    leftPathMap.value,
    rightPathMap.value,
    left.links,
    right.links,
    nodeIds,
    edges,
    "target",
    {
      otherSideStableIds: leftDiagramStableIds.value,
      currentStableIds: rightCurrentStableIds.value,
      otherSideEdgeInstanceIds: leftDiagramEdgeInstanceIds.value,
      otherSideEdgeInstanceSignatures: leftEdgeInstanceSignatures.value,
      currentEdgeInstanceSignatures: rightEdgeInstanceSignatures.value,
      useEdgeInstanceIdMatching: useEdgeInstanceIdMatching.value,
    }
  )
})

const diffWhenRightIsBase = computed(() => {
  const left = leftData.value
  const right = rightData.value
  if (!left || !right) return null
  return computeModelDiff(
    { nodes: right.nodes, links: right.links, diagrams: right.diagrams },
    { nodes: left.nodes, links: left.links, diagrams: left.diagrams }
  )
})

const leftDiffStateWhenRightIsBase = computed(() => {
  const d = diffWhenRightIsBase.value
  const diagram = leftDiagram.value
  const left = leftData.value
  const right = rightData.value
  if (!d || !diagram || !left || !right) return { diffStateByModelNodeId: {}, diffStateByModelLinkId: {}, diffStateByEdgeInstanceId: {} }
  const instances = diagram.parsedAttrs?.instances
  if (!instances) return { diffStateByModelNodeId: {}, diffStateByModelLinkId: {}, diffStateByEdgeInstanceId: {} }
  const nodeIds = instances.nodes.map((n) => n.modelNodeId)
  const edges = buildEdges(left.links)(instances.edges)
  return buildDiagramDiffStateMaps(
    d,
    rightPathMap.value,
    leftPathMap.value,
    right.links,
    left.links,
    nodeIds,
    edges,
    "target",
    {
      otherSideStableIds: rightDiagramStableIds.value,
      currentStableIds: leftCurrentStableIds.value,
      otherSideEdgeInstanceIds: rightDiagramEdgeInstanceIds.value,
      otherSideEdgeInstanceSignatures: rightEdgeInstanceSignatures.value,
      currentEdgeInstanceSignatures: leftEdgeInstanceSignatures.value,
      useEdgeInstanceIdMatching: useEdgeInstanceIdMatching.value,
    }
  )
})

const rightDiffStateWhenRightIsBase = computed(() => {
  const d = diffWhenRightIsBase.value
  const diagram = rightDiagram.value
  const left = leftData.value
  const right = rightData.value
  if (!d || !diagram || !left || !right) return { diffStateByModelNodeId: {}, diffStateByModelLinkId: {}, diffStateByEdgeInstanceId: {} }
  const instances = diagram.parsedAttrs?.instances
  if (!instances) return { diffStateByModelNodeId: {}, diffStateByModelLinkId: {}, diffStateByEdgeInstanceId: {} }
  const nodeIds = instances.nodes.map((n) => n.modelNodeId)
  const edges = buildEdges(right.links)(instances.edges)
  return buildDiagramDiffStateMaps(
    d,
    rightPathMap.value,
    leftPathMap.value,
    right.links,
    left.links,
    nodeIds,
    edges,
    "base",
    {
      otherSideStableIds: leftDiagramStableIds.value,
      currentStableIds: rightCurrentStableIds.value,
      otherSideEdgeInstanceIds: leftDiagramEdgeInstanceIds.value,
      otherSideEdgeInstanceSignatures: leftEdgeInstanceSignatures.value,
      currentEdgeInstanceSignatures: rightEdgeInstanceSignatures.value,
      useEdgeInstanceIdMatching: useEdgeInstanceIdMatching.value,
    }
  )
})

const leftCanvasDiffState = computed(() =>
  baseSide.value === "left" ? leftDiffState.value : leftDiffStateWhenRightIsBase.value
)
const rightCanvasDiffState = computed(() =>
  baseSide.value === "left" ? rightDiffState.value : rightDiffStateWhenRightIsBase.value
)

function handleBack(): void {
  router.push({ name: "model-editor", params: { id: versionId.value } })
}

function handleToggleBaseSide(): void {
  baseSide.value = baseSide.value === "left" ? "right" : "left"
}

function handleLeftSelectNodes(ids: string[]): void {
  if (ids.length !== 1 || !leftPathMap.value) return
  const path = leftPathMap.value.get(ids[0]!)
  if (path !== undefined) selectedElement.value = { kind: "node", path, side: "left" }
}

function handleLeftSelectLink(linkId: string): void {
  const link = versionData.value?.links.find((l) => l.id === linkId)
  if (!link || !leftPathMap.value) return
  const sp = leftPathMap.value.get(link.sourceId)
  const tp = leftPathMap.value.get(link.targetId)
  if (sp !== undefined && tp !== undefined)
    selectedElement.value = {
      kind: "link",
      sourcePath: sp,
      targetPath: tp,
      linkTypeId: link.linkTypeId,
      side: "left",
    }
}

function handleLeftSelectEdgeInstanceId(edgeInstanceId: string | null): void {
  if (!edgeInstanceId) return
  const diagram = leftDiagram.value
  const data = versionData.value
  if (!diagram || !data) return
  const instances = diagram.parsedAttrs?.instances
  if (!instances) return
  const edgeInst = instances.edges.find((e) => e.id === edgeInstanceId)
  if (!edgeInst) return
  const link = data.links.find((l) => l.id === edgeInst.modelLinkId)
  if (!link || !leftPathMap.value) return
  const nodeInstanceToModelNodeId = new Map(instances.nodes.map((n) => [n.id, n.modelNodeId]))
  const sourceModelNodeId = nodeInstanceToModelNodeId.get(edgeInst.sourceInstanceId) ?? link.sourceId
  const targetModelNodeId = nodeInstanceToModelNodeId.get(edgeInst.targetInstanceId) ?? link.targetId
  const sp = leftPathMap.value.get(sourceModelNodeId)
  const tp = leftPathMap.value.get(targetModelNodeId)
  if (sp !== undefined && tp !== undefined) {
    selectedElement.value = {
      kind: "link",
      sourcePath: sp,
      targetPath: tp,
      linkTypeId: link.linkTypeId,
      side: "left",
      edgeInstanceId,
    }
  }
}

function handleRightSelectNodes(ids: string[]): void {
  if (ids.length !== 1 || !rightPathMap.value) return
  const path = rightPathMap.value.get(ids[0]!)
  if (path !== undefined) selectedElement.value = { kind: "node", path, side: "right" }
}

function handleRightSelectLink(linkId: string): void {
  const link = versionData.value?.links.find((l) => l.id === linkId)
  if (!link || !rightPathMap.value) return
  const sp = rightPathMap.value.get(link.sourceId)
  const tp = rightPathMap.value.get(link.targetId)
  if (sp !== undefined && tp !== undefined)
    selectedElement.value = {
      kind: "link",
      sourcePath: sp,
      targetPath: tp,
      linkTypeId: link.linkTypeId,
      side: "right",
    }
}

function handleRightSelectEdgeInstanceId(edgeInstanceId: string | null): void {
  if (!edgeInstanceId) return
  const diagram = rightDiagram.value
  const data = versionData.value
  if (!diagram || !data) return
  const instances = diagram.parsedAttrs?.instances
  if (!instances) return
  const edgeInst = instances.edges.find((e) => e.id === edgeInstanceId)
  if (!edgeInst) return
  const link = data.links.find((l) => l.id === edgeInst.modelLinkId)
  if (!link || !rightPathMap.value) return
  const nodeInstanceToModelNodeId = new Map(instances.nodes.map((n) => [n.id, n.modelNodeId]))
  const sourceModelNodeId = nodeInstanceToModelNodeId.get(edgeInst.sourceInstanceId) ?? link.sourceId
  const targetModelNodeId = nodeInstanceToModelNodeId.get(edgeInst.targetInstanceId) ?? link.targetId
  const sp = rightPathMap.value.get(sourceModelNodeId)
  const tp = rightPathMap.value.get(targetModelNodeId)
  if (sp !== undefined && tp !== undefined) {
    selectedElement.value = {
      kind: "link",
      sourcePath: sp,
      targetPath: tp,
      linkTypeId: link.linkTypeId,
      side: "right",
      edgeInstanceId,
    }
  }
}

function linkKey(sp: string, tp: string, lt: string): string {
  return `${sp}\t${tp}\t${lt}`
}

const leftByPath = computed(() => {
  const map = new Map<string, NodeResponse>()
  if (!versionData.value) return map
  const pathMap = buildNodePathMap(versionData.value.nodes)
  for (const n of versionData.value.nodes) {
    const p = pathMap.get(n.id)
    if (p !== undefined) map.set(p, n)
  }
  return map
})

const rightByPath = computed(() => {
  const map = new Map<string, NodeResponse>()
  if (!versionData.value) return map
  const pathMap = buildNodePathMap(versionData.value.nodes)
  for (const n of versionData.value.nodes) {
    const p = pathMap.get(n.id)
    if (p !== undefined) map.set(p, n)
  }
  return map
})

const leftByLinkKey = computed(() => {
  const map = new Map<string, LinkResponse>()
  if (!versionData.value || !leftPathMap.value) return map
  for (const l of versionData.value.links) {
    const sp = leftPathMap.value.get(l.sourceId)
    const tp = leftPathMap.value.get(l.targetId)
    if (sp !== undefined && tp !== undefined) map.set(linkKey(sp, tp, l.linkTypeId), l)
  }
  return map
})

const rightByLinkKey = computed(() => {
  const map = new Map<string, LinkResponse>()
  if (!versionData.value || !rightPathMap.value) return map
  for (const l of versionData.value.links) {
    const sp = rightPathMap.value.get(l.sourceId)
    const tp = rightPathMap.value.get(l.targetId)
    if (sp !== undefined && tp !== undefined) map.set(linkKey(sp, tp, l.linkTypeId), l)
  }
  return map
})

function resolveLinkSideSnapshot(
  side: "left" | "right",
  edgeInstanceId: string | undefined
): { link: LinkResponse | null; sourcePath: string | null; targetPath: string | null } {
  const diagram = side === "left" ? leftDiagram.value : rightDiagram.value
  const data = versionData.value
  const pathMap = side === "left" ? leftPathMap.value : rightPathMap.value
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

  const nodeInstanceToModelNodeId = new Map(instances.nodes.map((n) => [n.id, n.modelNodeId]))
  const sourceModelNodeId = nodeInstanceToModelNodeId.get(edgeInst.sourceInstanceId) ?? link.sourceId
  const targetModelNodeId = nodeInstanceToModelNodeId.get(edgeInst.targetInstanceId) ?? link.targetId

  return {
    link,
    sourcePath: pathMap.get(sourceModelNodeId) ?? null,
    targetPath: pathMap.get(targetModelNodeId) ?? null,
  }
}

function formatPropValue(v: unknown): string {
  if (v === undefined || v === null) return "—"
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v)
  const s = JSON.stringify(v)
  return s.length > 80 ? `${s.slice(0, 77)}…` : s
}

function flattenComponentProperties(
  componentProperties: Record<string, Record<string, Record<string, unknown>>>
): Array<{ key: string; value: unknown }> {
  const out: Array<{ key: string; value: unknown }> = []
  for (const [notationId, byComponent] of Object.entries(componentProperties)) {
    for (const [componentId, props] of Object.entries(byComponent)) {
      for (const [propKey, value] of Object.entries(props)) {
        out.push({ key: `${notationId}/${componentId}/${propKey}`, value })
      }
    }
  }
  return out
}

function flattenRelationProperties(
  relationProperties: Record<string, Record<string, Record<string, unknown>>>
): Array<{ key: string; value: unknown }> {
  const out: Array<{ key: string; value: unknown }> = []
  for (const [notationId, byRelation] of Object.entries(relationProperties)) {
    for (const [relationId, props] of Object.entries(byRelation)) {
      for (const [propKey, value] of Object.entries(props)) {
        out.push({ key: `${notationId}/${relationId}/${propKey}`, value })
      }
    }
  }
  return out
}

function getNodePropertiesForSide(
  side: "left" | "right",
  modelNodeId: string
): Record<string, Record<string, Record<string, unknown>>> {
  const diagram = side === "left" ? leftDiagram.value : rightDiagram.value
  const node = versionData.value?.nodes.find(item => item.id === modelNodeId)
  return getDiagramScopedNodeMap({
    diagram: diagram?.parsedAttrs,
    modelNodeId,
    nodeAttrsFallback: node ? parseNodeAttrs(node.attrs) : null,
  })
}

function getLinkPropertiesForSide(
  side: "left" | "right",
  modelLinkId: string,
  edgeInstanceId?: string
): Record<string, Record<string, Record<string, unknown>>> {
  const diagram = side === "left" ? leftDiagram.value : rightDiagram.value
  const link = versionData.value?.links.find(item => item.id === modelLinkId)
  return getDiagramScopedLinkMap({
    diagram: diagram?.parsedAttrs,
    modelLinkId,
    linkAttrsFallback: link ? parseLinkAttrs(link.attrs) : null,
    edgeInstanceId,
  })
}

type PropertyRow = { key: string; base: string; target: string; changed: boolean }
const selectedPropertyRows = computed<PropertyRow[]>(() => {
  const sel = selectedElement.value
  if (!sel) return []
  const isLeftBase = baseSide.value === "left"
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
    leftDiff[modelNodeId] === "removed" || leftDiff[modelNodeId] === "added"
  const hideLeft = (modelNodeId: string): boolean =>
    rightDiff[modelNodeId] === "removed" || rightDiff[modelNodeId] === "added"
  const hideRightLink = (modelLinkId: string): boolean =>
    leftLinkDiff[modelLinkId] === "removed" || leftLinkDiff[modelLinkId] === "added"
  const hideLeftLink = (modelLinkId: string): boolean =>
    rightLinkDiff[modelLinkId] === "removed" || rightLinkDiff[modelLinkId] === "added"

  if (sel.kind === "node") {
    const leftNode = leftNodeByPath.get(sel.path)
    const rightNode = rightNodeByPath.get(sel.path)
    const rightAbsent = leftNode && sel.side === "left" && hideRight(leftNode.id)
    const leftAbsent = rightNode && sel.side === "right" && hideLeft(rightNode.id)
    const leftScopedMap = leftNode ? getNodePropertiesForSide("left", leftNode.id) : {}
    const rightScopedMap = rightNode ? getNodePropertiesForSide("right", rightNode.id) : {}
    const rows: PropertyRow[] = []
    rows.push({
      key: "name",
      base: isLeftBase
        ? leftAbsent ? "—" : leftNode ? leftNode.name : "—"
        : rightAbsent ? "—" : rightNode ? rightNode.name : "—",
      target: isLeftBase
        ? rightAbsent ? "—" : rightNode ? rightNode.name : "—"
        : leftAbsent ? "—" : leftNode ? leftNode.name : "—",
      changed: leftAbsent || rightAbsent || (leftNode?.name ?? "") !== (rightNode?.name ?? ""),
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
    const leftSnapshot = resolveLinkSideSnapshot("left", sel.edgeInstanceId)
    const rightSnapshot = resolveLinkSideSnapshot("right", sel.edgeInstanceId)
    const lk = linkKey(sel.sourcePath, sel.targetPath, sel.linkTypeId)
    const leftLink = leftSnapshot.link ?? leftLinkMap.get(lk)
    const rightLink = rightSnapshot.link ?? rightLinkMap.get(lk)
    const rightAbsent = leftLink && sel.side === "left" && hideRightLink(leftLink.id)
    const leftAbsent = rightLink && sel.side === "right" && hideLeftLink(rightLink.id)
    const leftRouteSource =
      leftSnapshot.sourcePath ?? (leftLink ? (leftNodePathMap.get(leftLink.sourceId) ?? null) : null)
    const leftRouteTarget =
      leftSnapshot.targetPath ?? (leftLink ? (leftNodePathMap.get(leftLink.targetId) ?? null) : null)
    const rightRouteSource =
      rightSnapshot.sourcePath ?? (rightLink ? (rightNodePathMap.get(rightLink.sourceId) ?? null) : null)
    const rightRouteTarget =
      rightSnapshot.targetPath ?? (rightLink ? (rightNodePathMap.get(rightLink.targetId) ?? null) : null)

    const leftRoute =
      leftRouteSource && leftRouteTarget
        ? `${pathForDisplay(leftRouteSource)} -> ${pathForDisplay(leftRouteTarget)}`
        : "—"
    const rightRoute =
      rightRouteSource && rightRouteTarget
        ? `${pathForDisplay(rightRouteSource)} -> ${pathForDisplay(rightRouteTarget)}`
        : "—"
    const leftScopedMap = leftLink
      ? getLinkPropertiesForSide("left", leftLink.id, sel.edgeInstanceId)
      : {}
    const rightScopedMap = rightLink
      ? getLinkPropertiesForSide("right", rightLink.id, sel.edgeInstanceId)
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

  if (sel.kind === "node") {
    const node = (sel.side === "left" ? leftByPath.value : rightByPath.value).get(sel.path)
    if (!node) return null
    const diffMap =
      sel.side === "left"
        ? leftCanvasDiffState.value.diffStateByModelNodeId
        : rightCanvasDiffState.value.diffStateByModelNodeId
    return diffMap[node.id] ?? null
  }

  const sideDiffState = sel.side === "left" ? leftCanvasDiffState.value : rightCanvasDiffState.value
  if (sel.edgeInstanceId) {
    const byEdge = sideDiffState.diffStateByEdgeInstanceId[sel.edgeInstanceId]
    if (byEdge) return byEdge
  }

  const lk = linkKey(sel.sourcePath, sel.targetPath, sel.linkTypeId)
  const sideSnapshot = resolveLinkSideSnapshot(sel.side, sel.edgeInstanceId)
  const sideLink =
    sideSnapshot.link ??
    (sel.side === "left" ? leftByLinkKey.value : rightByLinkKey.value).get(lk)
  if (!sideLink) return null
  return sideDiffState.diffStateByModelLinkId[sideLink.id] ?? null
})

const comparePropWasLabel = computed(() =>
  baseSide.value === "left" ? t('models.comparePropWas') : t('models.comparePropWasRight')
)

const comparePropBecameLabel = computed(() =>
  baseSide.value === "left" ? t('models.comparePropBecame') : t('models.comparePropBecameLeft')
)

const isLeftBaseForProps = computed(() => baseSide.value === "left")

function pathForDisplay(path: string): string {
  return path.startsWith("Root/") ? path.slice(5) : path
}

const selectedElementLabel = computed(() => {
  const sel = selectedElement.value
  if (!sel) return null
  if (sel.kind === "node") return pathForDisplay(sel.path)
  return `${pathForDisplay(sel.sourcePath)} → ${pathForDisplay(sel.targetPath)}`
})

watch(
  [versionId, diagramName],
  () => {
    if (versionId.value) void loadVersionData()
  },
  { immediate: true }
)

watch(
  () => versionId.value,
  () => void loadSharedData(),
  { immediate: true }
)

watch(
  [diagramsWithName, diagramName],
  () => {
    const list = diagramsWithName.value
    if (list.length === 0) {
      leftDiagramId.value = ""
      rightDiagramId.value = ""
      return
    }
    const firstId = list[0]!.id
    const secondId = list[1]?.id ?? firstId
    if (!leftDiagramId.value || !list.some((d) => d.id === leftDiagramId.value)) {
      leftDiagramId.value = firstId
    }
    if (!rightDiagramId.value || !list.some((d) => d.id === rightDiagramId.value)) {
      rightDiagramId.value = secondId
    }
  },
  { immediate: true }
)

watch(
  () => diagramNameFromQuery.value,
  (q) => {
    if (q && diagramNames.value.includes(q)) diagramName.value = q
  },
  { immediate: true }
)

function centerBothCanvases(): void {
  nextTick(() => {
    requestAnimationFrame(() => {
      leftCanvasRef.value?.fitToView()
      rightCanvasRef.value?.fitToView()
    })
  })
}

watch(
  [() => leftDiagram.value, () => rightDiagram.value, diagramName],
  () => {
    if (leftDiagram.value && rightDiagram.value) centerBothCanvases()
  },
  { immediate: true }
)
</script>

<template>
  <MainLayout>
    <template #header>
      <AppHeader />
    </template>
    <template #default>
      <div class="dc">
        <!-- Top bar -->
        <div class="dc__topbar">
          <button
            type="button"
            class="dc__back"
            :title="t('toolbar.backToModels')"
            @click="handleBack"
          >
            <UiIcon name="arrow_back" />
          </button>

          <div class="dc__selectors">
            <div class="dc__pick-group">
              <span class="dc__pick-label">{{ t('models.compareDiagramName') }}</span>
              <select v-model="diagramName" class="dc__pick-select">
                <option v-for="name in diagramNames" :key="name" :value="name">{{ name }}</option>
              </select>
            </div>

            <div class="dc__pick-group">
              <span class="dc__pick-label">{{ t('models.compareVersionLeft') }}</span>
              <select
                v-model="leftDiagramId"
                class="dc__pick-select"
                :disabled="loading || !diagramsWithName.length"
              >
                <option v-for="d in diagramsWithName" :key="d.id" :value="d.id">{{ d.version }}</option>
              </select>
            </div>

            <button
              type="button"
              class="dc__swap"
              :disabled="!leftDiagramId || !rightDiagramId || loading"
              :title="t('models.compareToggleBase')"
              @click="handleToggleBaseSide"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M5 3L2 6L5 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M2 6H14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                <path d="M13 15L16 12L13 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M16 12H4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </button>

            <div class="dc__pick-group">
              <span class="dc__pick-label">{{ t('models.compareVersionRight') }}</span>
              <select
                v-model="rightDiagramId"
                class="dc__pick-select"
                :disabled="loading || !diagramsWithName.length"
              >
                <option v-for="d in diagramsWithName" :key="d.id" :value="d.id">{{ d.version }}</option>
              </select>
            </div>
          </div>
        </div>

        <p v-if="error" class="dc__error">{{ error }}</p>

        <!-- Canvas area -->
        <div v-else class="dc__body">
          <div class="dc__panels">
            <!-- Left panel -->
            <div
              class="dc__panel"
              :class="baseSide === 'left' ? 'dc__panel--base' : 'dc__panel--changes'"
            >
              <div class="dc__panel-header">
                <span class="dc__panel-side">{{ t('models.compareVersionLeft') }}</span>
                <span
                  class="dc__role-badge"
                  :class="baseSide === 'left' ? 'dc__role-badge--base' : 'dc__role-badge--changes'"
                >
                  {{ baseSide === 'left' ? t('models.compareBaseLabel') : t('models.compareChangesLabel') }}
                </span>
              </div>
              <div class="dc__canvas-area">
                <ModelDiagramCanvas
                  ref="leftCanvasRef"
                  v-if="leftDiagram && sharedData"
                  :active-diagram="leftDiagram"
                  :nodes="leftEditorNodes"
                  :links="leftEditorLinks"
                  :relations="sharedData.relations"
                  :components="sharedData.components"
                  :node-types="versionData?.nodeTypes ?? []"
                  :relation-rules="sharedData.relationRules"
                  :selected-model-node-ids="[]"
                  :selected-model-link-id="null"
                  :grid-visible="true"
                  :mini-map-visible="false"
                  :palette-visible="false"
                  :read-only="true"
                  :diff-state-by-model-node-id="leftCanvasDiffState.diffStateByModelNodeId"
                  :diff-state-by-model-link-id="leftCanvasDiffState.diffStateByModelLinkId"
                  :diff-state-by-edge-instance-id="leftCanvasDiffState.diffStateByEdgeInstanceId"
                  @select-nodes="handleLeftSelectNodes"
                  @select-link="handleLeftSelectLink"
                  @select-edge-instance-id="handleLeftSelectEdgeInstanceId"
                />
                <div v-else class="dc__placeholder">
                  {{ leftDiagram ? t('common.loading') : t('models.compareNoDiagram') }}
                </div>
              </div>
            </div>

            <!-- Divider -->
            <div class="dc__divider" />

            <!-- Right panel -->
            <div
              class="dc__panel"
              :class="baseSide === 'right' ? 'dc__panel--base' : 'dc__panel--changes'"
            >
              <div class="dc__panel-header">
                <span class="dc__panel-side">{{ t('models.compareVersionRight') }}</span>
                <span
                  class="dc__role-badge"
                  :class="baseSide === 'right' ? 'dc__role-badge--base' : 'dc__role-badge--changes'"
                >
                  {{ baseSide === 'right' ? t('models.compareBaseLabel') : t('models.compareChangesLabel') }}
                </span>
              </div>
              <div class="dc__canvas-area">
                <ModelDiagramCanvas
                  ref="rightCanvasRef"
                  v-if="rightDiagram && sharedData"
                  :active-diagram="rightDiagram"
                  :nodes="rightEditorNodes"
                  :links="rightEditorLinks"
                  :relations="sharedData.relations"
                  :components="sharedData.components"
                  :node-types="versionData?.nodeTypes ?? []"
                  :relation-rules="sharedData.relationRules"
                  :selected-model-node-ids="[]"
                  :selected-model-link-id="null"
                  :grid-visible="true"
                  :mini-map-visible="false"
                  :palette-visible="false"
                  :read-only="true"
                  :diff-state-by-model-node-id="rightCanvasDiffState.diffStateByModelNodeId"
                  :diff-state-by-model-link-id="rightCanvasDiffState.diffStateByModelLinkId"
                  :diff-state-by-edge-instance-id="rightCanvasDiffState.diffStateByEdgeInstanceId"
                  @select-nodes="handleRightSelectNodes"
                  @select-link="handleRightSelectLink"
                  @select-edge-instance-id="handleRightSelectEdgeInstanceId"
                />
                <div v-else class="dc__placeholder">
                  {{ rightDiagram ? t('common.loading') : t('models.compareNoDiagram') }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Properties panel -->
        <div
          v-if="selectedElementLabel"
          class="dc__resizer"
          role="separator"
          aria-orientation="horizontal"
          :title="t('models.resizePropertiesPanelHeight')"
          @mousedown.prevent="startPropsPanelResize"
        >
          <span class="dc__resizer-grip" />
        </div>
        <div
          v-if="selectedElementLabel"
          class="dc__props"
          :style="{ height: propsPanelHeight + 'px' }"
        >
          <div class="dc__props-header">
            <span class="dc__props-label">{{ t('models.compareSelectedElement') }}</span>
            <span class="dc__props-element">{{ selectedElementLabel }}</span>
          </div>
          <div class="dc__props-scroll">
            <table class="dc__table">
              <thead>
                <tr>
                  <th>{{ t('models.comparePropName') }}</th>
                  <th>{{ isLeftBaseForProps ? comparePropWasLabel : comparePropBecameLabel }}</th>
                  <th>{{ isLeftBaseForProps ? comparePropBecameLabel : comparePropWasLabel }}</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in selectedPropertyRows"
                  :key="row.key"
                  :class="{ 'dc__row--diff': row.changed }"
                >
                  <td class="dc__cell-key">{{ row.key }}</td>
                  <td
                    :class="
                      row.changed
                        ? selectedElementDiffKind === 'modified'
                          ? 'dc__cell--modified'
                          : (isLeftBaseForProps ? 'dc__cell--old' : 'dc__cell--new')
                        : ''
                    "
                  >
                    {{ isLeftBaseForProps ? row.base : row.target }}
                  </td>
                  <td
                    :class="
                      row.changed
                        ? selectedElementDiffKind === 'modified'
                          ? 'dc__cell--modified'
                          : (isLeftBaseForProps ? 'dc__cell--new' : 'dc__cell--old')
                        : ''
                    "
                  >
                    {{ isLeftBaseForProps ? row.target : row.base }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </template>
    <template #footer>
      <AppFooter />
    </template>
  </MainLayout>
</template>

<style scoped>
/* ── Layout ── */
.dc {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--base-bg);
}

/* ── Top bar ── */
.dc__topbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}

.dc__back {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
}
.dc__back:hover {
  color: var(--primary);
  border-color: var(--primary);
  background: var(--primary-soft);
  box-shadow: var(--shadow-glow);
}

.dc__selectors {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.dc__pick-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.dc__pick-label {
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-subtle);
  white-space: nowrap;
}

.dc__pick-select {
  height: 32px;
  padding: 0 28px 0 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-muted);
  color: var(--base-text);
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: border-color 0.15s ease;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%239a9a9a' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
}
.dc__pick-select:hover {
  border-color: var(--border-strong);
}
.dc__pick-select:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 2px var(--primary-soft);
}

.dc__swap {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;
}
.dc__swap:hover:not(:disabled) {
  color: var(--primary);
  border-color: var(--primary);
  background: var(--primary-soft);
  transform: rotate(180deg);
}
.dc__swap:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.dc__error {
  padding: 16px;
  color: var(--danger);
  margin: 0;
  font-size: 13px;
}

/* ── Canvas area ── */
.dc__body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.dc__panels {
  display: flex;
  flex: 1;
  min-height: 0;
}

.dc__panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  transition: border-color 0.25s ease;
}

.dc__panel--base {
  border-top: 2px solid var(--border);
}
.dc__panel--changes {
  border-top: 2px solid var(--primary);
}

.dc__divider {
  width: 1px;
  background: var(--border);
  flex-shrink: 0;
  position: relative;
}
.dc__divider::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 7px;
  height: 40px;
  border-radius: 4px;
  background: var(--border);
  opacity: 0;
  transition: opacity 0.2s ease;
}
.dc__panels:hover .dc__divider::before {
  opacity: 1;
}

.dc__panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  background: var(--surface-muted);
  border-bottom: 1px solid var(--border);
}

.dc__panel-side {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-subtle);
}

.dc__role-badge {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 2px 8px;
  border-radius: 6px;
  transition: all 0.25s ease;
}
.dc__role-badge--base {
  background: var(--surface-strong);
  color: var(--text-muted);
}
.dc__role-badge--changes {
  background: var(--primary);
  color: #fff;
  box-shadow: 0 1px 4px rgba(124, 92, 252, 0.25);
}

.dc__canvas-area {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.dc__placeholder {
  flex: 1;
  display: grid;
  place-items: center;
  color: var(--text-subtle);
  font-size: 13px;
  background:
    radial-gradient(circle at 50% 50%, var(--surface-muted) 0%, transparent 70%),
    repeating-linear-gradient(
      0deg,
      transparent,
      transparent 19px,
      var(--border) 19px,
      var(--border) 20px
    ),
    repeating-linear-gradient(
      90deg,
      transparent,
      transparent 19px,
      var(--border) 19px,
      var(--border) 20px
    );
  background-size: 100% 100%, 20px 20px, 20px 20px;
  opacity: 0.7;
}

/* ── Resizer ── */
.dc__resizer {
  flex-shrink: 0;
  height: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: row-resize;
  background: var(--surface);
  border-top: 1px solid var(--border);
  transition: background 0.15s ease;
}
.dc__resizer:hover {
  background: var(--primary-soft);
}

.dc__resizer-grip {
  width: 36px;
  height: 3px;
  border-radius: 2px;
  background: var(--border-strong);
  transition: all 0.15s ease;
}
.dc__resizer:hover .dc__resizer-grip {
  background: var(--primary);
  width: 48px;
}

/* ── Properties panel ── */
.dc__props {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border-top: 1px solid var(--border);
  overflow: hidden;
}

.dc__props-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.dc__props-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-subtle);
}

.dc__props-element {
  font-size: 13px;
  font-weight: 500;
  color: var(--base-text);
  font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
}

.dc__props-scroll {
  flex: 1;
  overflow: auto;
}

.dc__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.dc__table th {
  padding: 6px 12px;
  text-align: left;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-subtle);
  background: var(--surface-muted);
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  z-index: 1;
}

.dc__table td {
  padding: 5px 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
}

.dc__table tbody tr:hover {
  background: var(--surface-muted);
}

.dc__cell-key {
  font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
  font-size: 11px;
  color: var(--text-muted);
}

.dc__row--diff {
  background: color-mix(in srgb, var(--warning) 4%, transparent);
}
.dc__row--diff:hover {
  background: color-mix(in srgb, var(--warning) 8%, transparent) !important;
}

.dc__cell--old {
  color: var(--danger);
  background: var(--danger-soft);
  font-weight: 500;
}

.dc__cell--new {
  color: var(--success);
  background: var(--success-soft);
  font-weight: 500;
}

.dc__cell--modified {
  color: var(--warning);
  background: color-mix(in srgb, var(--warning) 16%, transparent);
  font-weight: 500;
}
</style>
