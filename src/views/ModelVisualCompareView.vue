<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import { useI18n } from "vue-i18n"
import { apiGet } from "@/composables/useApi"
import type { ModelData, PaginatedResponse } from "@/types/entities"
import type {
  ComponentResponse,
  DiagramResponse,
  LinkResponse,
  LinkTypeResponse,
  NodeResponse,
  NodeTypeResponse,
  RelationResponse,
  RelationRuleResponse,
} from "@/types/api"
import type { NotationData } from "@/types/entities"
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

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const modelId = computed(() => route.params.id as string)

const relatedVersions = ref<ModelData[]>([])
const leftVersionId = ref<string>("")
const rightVersionId = ref<string>("")
const diagramName = ref<string>("")

const leftData = ref<{
  nodes: NodeResponse[]
  links: LinkResponse[]
  diagrams: DiagramResponse[]
  nodeTypes: NodeTypeResponse[]
  linkTypes: LinkTypeResponse[]
} | null>(null)
const rightData = ref<{
  nodes: NodeResponse[]
  links: LinkResponse[]
  diagrams: DiagramResponse[]
  nodeTypes: NodeTypeResponse[]
  linkTypes: LinkTypeResponse[]
} | null>(null)
const sharedData = ref<{
  notations: NotationData[]
  components: ComponentResponse[]
  relations: RelationResponse[]
  relationRules: RelationRuleResponse[]
} | null>(null)

const loading = ref(false)
const error = ref<string | null>(null)

/** Какая сторона считается базой (без подсветки); вторая сторона показывает изменения. */
const baseSide = ref<"left" | "right">("left")

const leftCanvasRef = ref<InstanceType<typeof ModelDiagramCanvas> | null>(null)
const rightCanvasRef = ref<InstanceType<typeof ModelDiagramCanvas> | null>(null)

const PROPS_PANEL_STORAGE_KEY = "warchi:model-visual-compare:props-panel-height"
const PROPS_PANEL_MIN_HEIGHT = 120
const PROPS_PANEL_MAX_HEIGHT = 600
const PROPS_PANEL_DEFAULT_HEIGHT = 220

function loadPropsPanelHeight(): number {
  if (typeof window === "undefined") return PROPS_PANEL_DEFAULT_HEIGHT
  try {
    const raw = window.localStorage.getItem(PROPS_PANEL_STORAGE_KEY)
    if (raw == null) return PROPS_PANEL_DEFAULT_HEIGHT
    const n = Number(raw)
    return Number.isFinite(n) ? Math.max(PROPS_PANEL_MIN_HEIGHT, Math.min(PROPS_PANEL_MAX_HEIGHT, n)) : PROPS_PANEL_DEFAULT_HEIGHT
  } catch {
    return PROPS_PANEL_DEFAULT_HEIGHT
  }
}

const propsPanelHeight = ref(loadPropsPanelHeight())
let propsPanelResizing = false
let propsPanelStartY = 0
let propsPanelStartHeight = 0

function onPropsPanelResizeMove(e: MouseEvent): void {
  if (!propsPanelResizing) return
  const deltaY = propsPanelStartY - e.clientY
  propsPanelHeight.value = Math.max(
    PROPS_PANEL_MIN_HEIGHT,
    Math.min(PROPS_PANEL_MAX_HEIGHT, propsPanelStartHeight + deltaY)
  )
}

function stopPropsPanelResize(): void {
  if (!propsPanelResizing) return
  propsPanelResizing = false
  document.body.style.cursor = ""
  document.body.style.userSelect = ""
  window.removeEventListener("mousemove", onPropsPanelResizeMove)
  window.removeEventListener("mouseup", stopPropsPanelResize)
  try {
    window.localStorage.setItem(PROPS_PANEL_STORAGE_KEY, String(propsPanelHeight.value))
  } catch {
    /* ignore */
  }
}

function startPropsPanelResize(e: MouseEvent): void {
  e.preventDefault()
  propsPanelResizing = true
  propsPanelStartY = e.clientY
  propsPanelStartHeight = propsPanelHeight.value
  document.body.style.cursor = "row-resize"
  document.body.style.userSelect = "none"
  window.addEventListener("mousemove", onPropsPanelResizeMove)
  window.addEventListener("mouseup", stopPropsPanelResize)
}

onBeforeUnmount(() => {
  stopPropsPanelResize()
})

type SelectedElement =
  | { kind: "node"; path: string; side: "left" | "right" }
  | { kind: "link"; sourcePath: string; targetPath: string; linkTypeId: string; side: "left" | "right" }
const selectedElement = ref<SelectedElement | null>(null)

async function loadRelatedVersions(): Promise<void> {
  const id = modelId.value
  if (!id) return
  loading.value = true
  error.value = null
  try {
    const res = await apiGet<ModelData[]>(`/models/${id}/related-versions`)
    if (res.success) {
      relatedVersions.value = res.data
      if (res.data.length >= 2 && !leftVersionId.value && !rightVersionId.value) {
        leftVersionId.value = res.data[res.data.length - 1]!.id
        rightVersionId.value = res.data[0]!.id
      }
    } else {
      relatedVersions.value = []
      error.value = res.error.message
    }
  } catch (e) {
    relatedVersions.value = []
    error.value = e instanceof Error ? e.message : "Ошибка загрузки"
  } finally {
    loading.value = false
  }
}

async function loadVersionData(versionId: string): Promise<{
  nodes: NodeResponse[]
  links: LinkResponse[]
  diagrams: DiagramResponse[]
  nodeTypes: NodeTypeResponse[]
  linkTypes: LinkTypeResponse[]
} | null> {
  const listQuery = new URLSearchParams({ size: "1000" })
  const [nodesRes, linksRes, diagramsRes, nodeTypesRes, linkTypesRes] =
    await Promise.all([
      apiGet<PaginatedResponse<NodeResponse>>(
        `/nodes?modelId=${encodeURIComponent(versionId)}&${listQuery.toString()}`
      ),
      apiGet<PaginatedResponse<LinkResponse>>(
        `/links?modelId=${encodeURIComponent(versionId)}&${listQuery.toString()}`
      ),
      apiGet<PaginatedResponse<DiagramResponse>>(
        `/diagrams?modelId=${encodeURIComponent(versionId)}&${listQuery.toString()}`
      ),
      apiGet<PaginatedResponse<NodeTypeResponse>>(
        `/node-types?modelId=${encodeURIComponent(versionId)}&${listQuery.toString()}`
      ),
      apiGet<PaginatedResponse<LinkTypeResponse>>(
        `/link-types?modelId=${encodeURIComponent(versionId)}&${listQuery.toString()}`
      ),
    ])
  if (!nodesRes.success || !linksRes.success || !diagramsRes.success) return null
  return {
    nodes: nodesRes.data.content ?? [],
    links: linksRes.data.content ?? [],
    diagrams: diagramsRes.data.content ?? [],
    nodeTypes: nodeTypesRes.success ? nodeTypesRes.data.content ?? [] : [],
    linkTypes: linkTypesRes.success ? linkTypesRes.data.content ?? [] : [],
  }
}

async function loadSharedData(): Promise<void> {
  const listQuery = new URLSearchParams({ size: "1000" })
  const [notationsRes, componentsRes, relationsRes, relationRulesRes] =
    await Promise.all([
      apiGet<PaginatedResponse<NotationData>>(`/notations?${listQuery.toString()}`),
      apiGet<PaginatedResponse<ComponentResponse>>(`/components?${listQuery.toString()}`),
      apiGet<PaginatedResponse<RelationResponse>>(`/relations?${listQuery.toString()}`),
      apiGet<PaginatedResponse<RelationRuleResponse>>(`/relation-rules?${listQuery.toString()}`),
    ])
  sharedData.value = {
    notations: notationsRes.success ? notationsRes.data.content ?? [] : [],
    components: componentsRes.success ? componentsRes.data.content ?? [] : [],
    relations: relationsRes.success ? relationsRes.data.content ?? [] : [],
    relationRules: relationRulesRes.success ? relationRulesRes.data.content ?? [] : [],
  }
}

async function loadBothVersions(): Promise<void> {
  const leftId = leftVersionId.value
  const rightId = rightVersionId.value
  if (!leftId || !rightId || leftId === rightId) {
    leftData.value = null
    rightData.value = null
    return
  }
  loading.value = true
  error.value = null
  try {
    const [left, right] = await Promise.all([
      loadVersionData(leftId),
      loadVersionData(rightId),
    ])
    leftData.value = left
    rightData.value = right
    if (left?.diagrams.length && !diagramName.value) {
      diagramName.value = left.diagrams[0]!.name
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Ошибка загрузки"
  } finally {
    loading.value = false
  }
}

function toEditorNode(r: NodeResponse): EditorNode {
  return { ...r, parsedAttrs: parseNodeAttrs(r.attrs ?? null) }
}
function toEditorLink(r: LinkResponse): EditorLink {
  return { ...r, parsedAttrs: parseLinkAttrs(r.attrs ?? null) }
}
function toEditorDiagram(r: DiagramResponse): EditorDiagram {
  return { ...r, parsedAttrs: parseDiagramAttrs(r.attrs ?? null) }
}

/** Выбирает диаграмму с именем name с максимальной версией (как в редакторе модели). */
function getLatestDiagramByName(
  diagrams: DiagramResponse[],
  name: string
): DiagramResponse | undefined {
  const sameName = diagrams.filter((d) => d.name.trim() === name.trim())
  if (sameName.length === 0) return undefined
  return [...sameName].sort((a, b) => compareVersions(b.version, a.version))[0]
}

const diagramNames = computed(() => {
  const names = new Set<string>()
  leftData.value?.diagrams.forEach((d) => names.add(d.name))
  rightData.value?.diagrams.forEach((d) => names.add(d.name))
  return Array.from(names).sort()
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

const leftDiagram = computed((): EditorDiagram | null => {
  const list = leftData.value?.diagrams ?? []
  const d = getLatestDiagramByName(list, diagramName.value)
  return d ? toEditorDiagram(d) : null
})

const rightDiagram = computed((): EditorDiagram | null => {
  const list = rightData.value?.diagrams ?? []
  const d = getLatestDiagramByName(list, diagramName.value)
  return d ? toEditorDiagram(d) : null
})

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

const leftPathMap = computed(() =>
  leftData.value ? buildNodePathMap(leftData.value.nodes) : new Map<string, string>()
)
const rightPathMap = computed(() =>
  rightData.value ? buildNodePathMap(rightData.value.nodes) : new Map<string, string>()
)

/** stableId узлов и связей на левой диаграмме (для сравнения «есть слева, нет справа» по stableId). */
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

/** Текущая левая диаграмма: modelNodeId/modelLinkId → stableId (или id). */
const leftCurrentStableIds = computed(() => {
  const editorNodes = leftEditorNodes.value
  const editorLinks = leftEditorLinks.value
  const nodeIdToStableId = new Map<string, string>()
  for (const n of editorNodes) nodeIdToStableId.set(n.id, n.stableId ?? n.id)
  const linkIdToStableId = new Map<string, string>()
  for (const l of editorLinks) linkIdToStableId.set(l.id, l.stableId ?? l.id)
  return { nodeIdToStableId, linkIdToStableId }
})

/** stableId узлов и связей на правой диаграмме. */
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

/** Текущая правая диаграмма: modelNodeId/modelLinkId → stableId (или id). */
const rightCurrentStableIds = computed(() => {
  const editorNodes = rightEditorNodes.value
  const editorLinks = rightEditorLinks.value
  const nodeIdToStableId = new Map<string, string>()
  for (const n of editorNodes) nodeIdToStableId.set(n.id, n.stableId ?? n.id)
  const linkIdToStableId = new Map<string, string>()
  for (const l of editorLinks) linkIdToStableId.set(l.id, l.stableId ?? l.id)
  return { nodeIdToStableId, linkIdToStableId }
})

/** Подсветка на левом канвасе, когда база слева: красный — удалено (в т.ч. есть на базе, нет на диаграмме изменений), оранжевый — изменено. */
const leftDiffState = computed(() => {
  const d = diff.value
  const diagram = leftDiagram.value
  const left = leftData.value
  if (!d || !diagram || !left) return { diffStateByModelNodeId: {}, diffStateByModelLinkId: {} }
  const instances = diagram.parsedAttrs?.instances
  if (!instances) return { diffStateByModelNodeId: {}, diffStateByModelLinkId: {} }
  const nodeIds = instances.nodes.map((n) => n.modelNodeId)
  const linkById = new Map(left.links.map((l) => [l.id, l]))
  const edges = instances.edges
    .map((e) => {
      const link = linkById.get(e.modelLinkId)
      return link
        ? {
            modelLinkId: e.modelLinkId,
            sourceId: link.sourceId,
            targetId: link.targetId,
            linkTypeId: link.linkTypeId,
          }
        : null
    })
    .filter(Boolean) as Array<{
    modelLinkId: string
    sourceId: string
    targetId: string
    linkTypeId: string
  }>
  return buildDiagramDiffStateMaps(
    d,
    leftPathMap.value,
    rightPathMap.value,
    left.links,
    rightData.value!.links,
    nodeIds,
    edges,
    "base",
    {
      otherSideStableIds: rightDiagramStableIds.value,
      currentStableIds: leftCurrentStableIds.value,
    }
  )
})

const rightDiffState = computed(() => {
  const d = diff.value
  const diagram = rightDiagram.value
  const right = rightData.value
  if (!d || !diagram || !right) return { diffStateByModelNodeId: {}, diffStateByModelLinkId: {} }
  const instances = diagram.parsedAttrs?.instances
  if (!instances) return { diffStateByModelNodeId: {}, diffStateByModelLinkId: {} }
  const nodeIds = instances.nodes.map((n) => n.modelNodeId)
  const linkById = new Map(right.links.map((l) => [l.id, l]))
  const edges = instances.edges
    .map((e) => {
      const link = linkById.get(e.modelLinkId)
      return link
        ? {
            modelLinkId: e.modelLinkId,
            sourceId: link.sourceId,
            targetId: link.targetId,
            linkTypeId: link.linkTypeId,
          }
        : null
    })
    .filter(Boolean) as Array<{
    modelLinkId: string
    sourceId: string
    targetId: string
    linkTypeId: string
  }>
  return buildDiagramDiffStateMaps(
    d,
    leftPathMap.value,
    rightPathMap.value,
    leftData.value!.links,
    right.links,
    nodeIds,
    edges,
    "target",
    {
      otherSideStableIds: leftDiagramStableIds.value,
      currentStableIds: rightCurrentStableIds.value,
    }
  )
})

/** Diff когда база — правая версия (right=base, left=target). */
const diffWhenRightIsBase = computed(() => {
  const left = leftData.value
  const right = rightData.value
  if (!left || !right) return null
  return computeModelDiff(
    { nodes: right.nodes, links: right.links, diagrams: right.diagrams },
    { nodes: left.nodes, links: left.links, diagrams: left.diagrams }
  )
})

/** Подсветка изменений на левом канвасе, когда база — справа. */
const leftDiffStateWhenRightIsBase = computed(() => {
  const d = diffWhenRightIsBase.value
  const diagram = leftDiagram.value
  const left = leftData.value
  const right = rightData.value
  if (!d || !diagram || !left || !right) return { diffStateByModelNodeId: {}, diffStateByModelLinkId: {} }
  const instances = diagram.parsedAttrs?.instances
  if (!instances) return { diffStateByModelNodeId: {}, diffStateByModelLinkId: {} }
  const nodeIds = instances.nodes.map((n) => n.modelNodeId)
  const linkById = new Map(left.links.map((l) => [l.id, l]))
  const edges = instances.edges
    .map((e) => {
      const link = linkById.get(e.modelLinkId)
      return link
        ? {
            modelLinkId: e.modelLinkId,
            sourceId: link.sourceId,
            targetId: link.targetId,
            linkTypeId: link.linkTypeId,
          }
        : null
    })
    .filter(Boolean) as Array<{
    modelLinkId: string
    sourceId: string
    targetId: string
    linkTypeId: string
  }>
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
    }
  )
})

/** Подсветка на правом канвасе, когда база справа: красный — удалено (в т.ч. есть на базе, нет на диаграмме изменений), оранжевый — изменено. */
const rightDiffStateWhenRightIsBase = computed(() => {
  const d = diffWhenRightIsBase.value
  const diagram = rightDiagram.value
  const left = leftData.value
  const right = rightData.value
  if (!d || !diagram || !left || !right) return { diffStateByModelNodeId: {}, diffStateByModelLinkId: {} }
  const instances = diagram.parsedAttrs?.instances
  if (!instances) return { diffStateByModelNodeId: {}, diffStateByModelLinkId: {} }
  const nodeIds = instances.nodes.map((n) => n.modelNodeId)
  const linkById = new Map(right.links.map((l) => [l.id, l]))
  const edges = instances.edges
    .map((e) => {
      const link = linkById.get(e.modelLinkId)
      return link
        ? {
            modelLinkId: e.modelLinkId,
            sourceId: link.sourceId,
            targetId: link.targetId,
            linkTypeId: link.linkTypeId,
          }
        : null
    })
    .filter(Boolean) as Array<{
    modelLinkId: string
    sourceId: string
    targetId: string
    linkTypeId: string
  }>
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
    }
  )
})

const emptyDiffState = { diffStateByModelNodeId: {} as Record<string, "added" | "removed" | "modified">, diffStateByModelLinkId: {} as Record<string, "added" | "removed" | "modified"> }

const leftCanvasDiffState = computed(() =>
  baseSide.value === "left" ? leftDiffState.value : leftDiffStateWhenRightIsBase.value
)
const rightCanvasDiffState = computed(() =>
  baseSide.value === "left" ? rightDiffState.value : rightDiffStateWhenRightIsBase.value
)

function handleBack(): void {
  router.push({ name: "model-editor", params: { id: modelId.value } })
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
  const link = leftData.value?.links.find((l) => l.id === linkId)
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

function handleRightSelectNodes(ids: string[]): void {
  if (ids.length !== 1 || !rightPathMap.value) return
  const path = rightPathMap.value.get(ids[0]!)
  if (path !== undefined) selectedElement.value = { kind: "node", path, side: "right" }
}

function handleRightSelectLink(linkId: string): void {
  const link = rightData.value?.links.find((l) => l.id === linkId)
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
    if (sp !== undefined && tp !== undefined)
      map.set(linkKey(sp, tp, l.linkTypeId), l)
  }
  return map
})

const rightByLinkKey = computed(() => {
  const map = new Map<string, LinkResponse>()
  if (!rightData.value || !rightPathMap.value) return map
  for (const l of rightData.value.links) {
    const sp = rightPathMap.value.get(l.sourceId)
    const tp = rightPathMap.value.get(l.targetId)
    if (sp !== undefined && tp !== undefined)
      map.set(linkKey(sp, tp, l.linkTypeId), l)
  }
  return map
})

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

type PropertyRow = { key: string; base: string; target: string; changed: boolean }
/** Таблица свойств: первая колонка — левая версия, вторая — правая. Если элемент только на одной диаграмме (красный/зелёный), в колонке другой стороны показываем "—". */
const selectedPropertyRows = computed<PropertyRow[]>(() => {
  const sel = selectedElement.value
  if (!sel) return []
  const leftPathMap = leftByPath.value
  const rightPathMap = rightByPath.value
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
    const leftNode = leftPathMap.get(sel.path)
    const rightNode = rightPathMap.get(sel.path)
    const rightAbsent = leftNode && sel.side === "left" && hideRight(leftNode.id)
    const leftAbsent = rightNode && sel.side === "right" && hideLeft(rightNode.id)
    const leftAttrs = leftNode ? parseNodeAttrs(leftNode.attrs) : null
    const rightAttrs = rightNode ? parseNodeAttrs(rightNode.attrs) : null
    const rows: PropertyRow[] = []
    rows.push({
      key: "name",
      base: leftAbsent ? "—" : leftNode ? leftNode.name : "—",
      target: rightAbsent ? "—" : rightNode ? rightNode.name : "—",
      changed: leftAbsent || rightAbsent || (leftNode?.name ?? "") !== (rightNode?.name ?? ""),
    })
    const leftFlat = leftAttrs ? flattenComponentProperties(leftAttrs.componentProperties) : []
    const rightFlat = rightAttrs ? flattenComponentProperties(rightAttrs.componentProperties) : []
    const allKeys = new Set([...leftFlat.map((x) => x.key), ...rightFlat.map((x) => x.key)])
    const leftByKey = new Map(leftFlat.map((x) => [x.key, x.value]))
    const rightByKey = new Map(rightFlat.map((x) => [x.key, x.value]))
    for (const key of Array.from(allKeys).sort()) {
      const leftVal = leftAbsent ? undefined : leftByKey.get(key)
      const rightVal = rightAbsent ? undefined : rightByKey.get(key)
      const leftStr = formatPropValue(leftVal)
      const rightStr = formatPropValue(rightVal)
      rows.push({ key, base: leftStr, target: rightStr, changed: leftStr !== rightStr })
    }
    return rows
  } else {
    const lk = linkKey(sel.sourcePath, sel.targetPath, sel.linkTypeId)
    const leftLink = leftLinkMap.get(lk)
    const rightLink = rightLinkMap.get(lk)
    const rightAbsent = leftLink && sel.side === "left" && hideRightLink(leftLink.id)
    const leftAbsent = rightLink && sel.side === "right" && hideLeftLink(rightLink.id)
    const leftAttrs = leftLink ? parseLinkAttrs(leftLink.attrs) : null
    const rightAttrs = rightLink ? parseLinkAttrs(rightLink.attrs) : null
    const leftFlat = leftAttrs ? flattenRelationProperties(leftAttrs.relationProperties) : []
    const rightFlat = rightAttrs ? flattenRelationProperties(rightAttrs.relationProperties) : []
    const allKeys = new Set([...leftFlat.map((x) => x.key), ...rightFlat.map((x) => x.key)])
    const leftByKey = new Map(leftFlat.map((x) => [x.key, x.value]))
    const rightByKey = new Map(rightFlat.map((x) => [x.key, x.value]))
    const rows: PropertyRow[] = []
    for (const key of Array.from(allKeys).sort()) {
      const leftVal = leftAbsent ? undefined : leftByKey.get(key)
      const rightVal = rightAbsent ? undefined : rightByKey.get(key)
      const leftStr = formatPropValue(leftVal)
      const rightStr = formatPropValue(rightVal)
      rows.push({ key, base: leftStr, target: rightStr, changed: leftStr !== rightStr })
    }
    return rows
  }
})

/** Убирает скрытый корень "Root/" из пути для отображения. */
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
  [modelId, leftVersionId, rightVersionId],
  () => {
    if (modelId.value) void loadRelatedVersions()
    if (leftVersionId.value && rightVersionId.value) void loadBothVersions()
  },
  { immediate: true }
)

watch(
  () => modelId.value,
  () => void loadSharedData(),
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
      <div class="visual-compare">
        <div class="visual-compare__toolbar">
          <button type="button" class="btn btn--secondary" @click="handleBack">
            {{ t('toolbar.backToModels') }}
          </button>
          <span class="visual-compare__title">{{ t('models.compareVisualTitle') }}</span>
          <label class="visual-compare__label">
            {{ t('models.compareVersionLeft') }}
            <select v-model="leftVersionId" class="visual-compare__select" :disabled="loading">
              <option value="">{{ t('models.compareSelectVersion') }}</option>
              <option
                v-for="v in relatedVersions"
                :key="v.id"
                :value="v.id"
                :disabled="v.id === rightVersionId"
              >
                {{ v.name }} {{ v.version }}
              </option>
            </select>
          </label>
          <button
            type="button"
            class="btn btn--secondary visual-compare__swap-btn"
            :disabled="!leftVersionId || !rightVersionId || loading"
            :title="t('models.compareToggleBase')"
            @click="handleToggleBaseSide"
          >
            {{ t('models.compareToggleBase') }}
          </button>
          <span class="visual-compare__diagram-name">{{ diagramName || '—' }}</span>
          <label class="visual-compare__label">
            {{ t('models.compareVersionRight') }}
            <select v-model="rightVersionId" class="visual-compare__select" :disabled="loading">
              <option value="">{{ t('models.compareSelectVersion') }}</option>
              <option
                v-for="v in relatedVersions"
                :key="v.id"
                :value="v.id"
                :disabled="v.id === leftVersionId"
              >
                {{ v.name }} {{ v.version }}
              </option>
            </select>
          </label>
          <label class="visual-compare__label">
            {{ t('models.compareDiagramName') }}
            <select v-model="diagramName" class="visual-compare__select">
              <option v-for="name in diagramNames" :key="name" :value="name">{{ name }}</option>
            </select>
          </label>
        </div>
        <p v-if="error" class="visual-compare__error">{{ error }}</p>
        <div v-else class="visual-compare__canvases">
          <div class="visual-compare__canvas-wrap">
            <div class="visual-compare__canvas-label">
              <span>{{ t('models.compareVersionLeft') }}</span>
              <span
                class="visual-compare__canvas-role"
                :class="baseSide === 'left' ? 'visual-compare__canvas-role--base' : 'visual-compare__canvas-role--changes'"
              >
                {{ baseSide === 'left' ? t('models.compareBaseLabel') : t('models.compareChangesLabel') }}
              </span>
            </div>
            <ModelDiagramCanvas
              ref="leftCanvasRef"
              v-if="leftDiagram && sharedData"
              :active-diagram="leftDiagram"
              :nodes="leftEditorNodes"
              :links="leftEditorLinks"
              :relations="sharedData.relations"
              :components="sharedData.components"
              :node-types="leftData?.nodeTypes ?? []"
              :relation-rules="sharedData.relationRules"
              :selected-model-node-ids="[]"
              :selected-model-link-id="null"
              :grid-visible="true"
              :mini-map-visible="false"
              :palette-visible="false"
              :read-only="true"
              :diff-state-by-model-node-id="leftCanvasDiffState.diffStateByModelNodeId"
              :diff-state-by-model-link-id="leftCanvasDiffState.diffStateByModelLinkId"
              @select-nodes="handleLeftSelectNodes"
              @select-link="handleLeftSelectLink"
            />
            <div v-else class="visual-compare__placeholder">
              {{ leftDiagram ? t('common.loading') : t('models.compareNoDiagram') }}
            </div>
          </div>
          <div class="visual-compare__canvas-wrap">
            <div class="visual-compare__canvas-label">
              <span>{{ t('models.compareVersionRight') }}</span>
              <span
                class="visual-compare__canvas-role"
                :class="baseSide === 'right' ? 'visual-compare__canvas-role--base' : 'visual-compare__canvas-role--changes'"
              >
                {{ baseSide === 'right' ? t('models.compareBaseLabel') : t('models.compareChangesLabel') }}
              </span>
            </div>
            <ModelDiagramCanvas
              ref="rightCanvasRef"
              v-if="rightDiagram && sharedData"
              :active-diagram="rightDiagram"
              :nodes="rightEditorNodes"
              :links="rightEditorLinks"
              :relations="sharedData.relations"
              :components="sharedData.components"
              :node-types="rightData?.nodeTypes ?? []"
              :relation-rules="sharedData.relationRules"
              :selected-model-node-ids="[]"
              :selected-model-link-id="null"
              :grid-visible="true"
              :mini-map-visible="false"
              :palette-visible="false"
              :read-only="true"
              :diff-state-by-model-node-id="rightCanvasDiffState.diffStateByModelNodeId"
              :diff-state-by-model-link-id="rightCanvasDiffState.diffStateByModelLinkId"
              @select-nodes="handleRightSelectNodes"
              @select-link="handleRightSelectLink"
            />
            <div v-else class="visual-compare__placeholder">
              {{ rightDiagram ? t('common.loading') : t('models.compareNoDiagram') }}
            </div>
          </div>
        </div>
        <div
          v-if="selectedElementLabel"
          class="visual-compare__props-resizer"
          role="separator"
          aria-orientation="horizontal"
          :title="t('models.resizePropertiesPanelHeight')"
          @mousedown.prevent="startPropsPanelResize"
        >
          <span class="visual-compare__props-resizer-handle" />
        </div>
        <div
          v-if="selectedElementLabel"
          class="visual-compare__props-panel"
          :style="{ height: propsPanelHeight + 'px' }"
        >
          <div class="visual-compare__props-title">
            {{ t('models.compareSelectedElement') }}: {{ selectedElementLabel }}
          </div>
          <table class="visual-compare__props-table">
            <thead>
              <tr>
                <th>{{ t('models.comparePropName') }}</th>
                <th>{{ t('models.comparePropWas') }}</th>
                <th>{{ t('models.comparePropBecame') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in selectedPropertyRows"
                :key="row.key"
                :class="{ 'visual-compare__props-row--changed': row.changed }"
              >
                <td>{{ row.key }}</td>
                <td :class="row.changed ? 'visual-compare__props-cell--old' : ''">
                  {{ row.base }}
                </td>
                <td :class="row.changed ? 'visual-compare__props-cell--new' : ''">
                  {{ row.target }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
    <template #footer>
      <AppFooter />
    </template>
  </MainLayout>
</template>

<style scoped>
.visual-compare {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.visual-compare__toolbar {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
  padding: 0.5rem 1rem;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}
.visual-compare__title {
  font-weight: 600;
  color: var(--base-text);
}
.visual-compare__label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: var(--text-muted);
}
.visual-compare__select {
  padding: 0.35rem 0.5rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-muted);
  color: var(--base-text);
}
.visual-compare__diagram-name {
  font-size: 0.875rem;
  color: var(--text-subtle);
}
.visual-compare__error {
  padding: 1rem;
  color: var(--danger);
  margin: 0;
}
.visual-compare__canvases {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
  flex: 1;
  min-height: 0;
}
.visual-compare__canvas-wrap {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-right: 1px solid var(--border);
}
.visual-compare__canvas-wrap:last-child {
  border-right: none;
}
.visual-compare__canvas-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.35rem 0.5rem;
  font-size: 0.75rem;
  color: var(--text-muted);
  background: var(--surface-muted);
}
.visual-compare__canvas-role {
  font-size: 0.6875rem;
  font-weight: 500;
  padding: 0.15rem 0.4rem;
  border-radius: 4px;
}
.visual-compare__canvas-role--base {
  background: var(--surface);
  color: var(--text-muted);
  border: 1px solid var(--border);
}
.visual-compare__canvas-role--changes {
  background: var(--primary);
  color: #fff;
}
.visual-compare__placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-subtle);
  font-size: 0.875rem;
}
.visual-compare__props-resizer {
  flex-shrink: 0;
  height: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: row-resize;
  background: var(--surface-muted);
  border-top: 1px solid var(--border);
}
.visual-compare__props-resizer:hover {
  background: var(--surface);
}
.visual-compare__props-resizer-handle {
  width: 42px;
  height: 3px;
  border-radius: 999px;
  background: var(--text-subtle);
  opacity: 0.4;
}
.visual-compare__props-resizer:hover .visual-compare__props-resizer-handle {
  opacity: 1;
  background: var(--primary);
}
.visual-compare__props-panel {
  flex-shrink: 0;
  padding: 0.75rem 1rem;
  background: var(--surface-muted);
  border-top: 1px solid var(--border);
  overflow: auto;
}
.visual-compare__props-title {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--base-text);
  margin-bottom: 0.5rem;
}
.visual-compare__props-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8125rem;
}
.visual-compare__props-table th,
.visual-compare__props-table td {
  padding: 0.25rem 0.5rem;
  text-align: left;
  border: 1px solid var(--border);
}
.visual-compare__props-table th {
  background: var(--surface);
  color: var(--text-muted);
}
.visual-compare__props-cell--old {
  background: rgba(220, 53, 69, 0.1);
  color: var(--danger);
}
.visual-compare__props-cell--new {
  background: rgba(30, 163, 85, 0.1);
  color: var(--success);
}
</style>
