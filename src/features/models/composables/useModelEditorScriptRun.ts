import { ref, shallowRef, type Ref } from 'vue'
import { buildDiagramScriptSnapshot } from '@/features/validation-scripts/sandbox/buildDiagramScriptSnapshot'
import { createDiagramScriptQueryHost } from '@/features/validation-scripts/sandbox/diagramScriptQueryHost'
import { applyDiagramScriptCommands } from '@/features/validation-scripts/sandbox/applyDiagramScriptCommands'
import { validateCommandQueue } from '@/features/validation-scripts/sandbox/diagramScriptCommands'
import type { DiagramScriptCommand } from '@/features/validation-scripts/sandbox/diagramScriptCommands'
import type { ValidationIssue } from '@/features/validation-scripts/sandbox/types'
import {
  fetchGraphNeighbors,
  resolveModelLinks,
  resolveModelNodes,
  searchModelNodes,
} from './modelScopedApi'
import { prepareValidationScriptRun } from './prepareValidationScriptRun'
import { resolveCompatibleNotationComponents } from '../modelAttrs'
import type { EditorDiagram, ModelEditorState, ModelPartialRequestGuard } from '../types'
import type { LinkResponse, NodeResponse } from '@/types/api'

type Translate = (key: string, params?: Record<string, unknown>) => string

export function useModelEditorScriptRun(options: {
  model: Ref<{ name: string; version: string } | null>
  state: Ref<ModelEditorState>
  selectedDiagramId: Ref<string | null>
  activeDiagram: Ref<EditorDiagram | null>
  isDiagramReadOnly: Ref<boolean>
  t: Translate
  setUiError: (message: string) => void
  partialStore: {
    store: {
      beginRequest: (label: string) => ModelPartialRequestGuard
    }
    mergePartialEntities: (
      nodes: NodeResponse[],
      links: LinkResponse[],
      guard: ModelPartialRequestGuard
    ) => boolean
  }
  executeDiagramHistoryCommand: (command: { execute: () => void; undo: () => void }) => void
  markDiagramDirty: (diagramId: string) => void
  invalidateTraceabilityDiagrams: () => void
  selectDiagram: (diagramId: string) => void
  selectedNodeId: Ref<string | null>
  selectedModelNodeIds: Ref<string[]>
  selectedModelLinkId: Ref<string | null>
  focusTreeNode: (nodeId: string) => void
}) {
  const showValidationScriptsModal = ref(false)
  const validationRunPayload = shallowRef<
    Extract<ReturnType<typeof prepareValidationScriptRun>, { ok: true }>['payload'] | null
  >(null)

  function openValidationScriptsModal(): void {
    if (!options.model.value || !options.selectedDiagramId.value) return
    const prepared = prepareValidationScriptRun({
      state: options.state.value,
      modelName: options.model.value.name,
      modelVersion: options.model.value.version,
      openDiagramId: options.selectedDiagramId.value,
    })
    validationRunPayload.value = prepared.ok
      ? prepared.payload
      : buildDiagramScriptSnapshot({
          state: options.state.value,
          modelName: options.model.value.name,
          modelVersion: options.model.value.version,
          openDiagramId: null,
        })
    showValidationScriptsModal.value = true
  }

  async function handleDiagramScriptQuery(
    method: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    const host = createDiagramScriptQueryHost({
      modelId: options.state.value.modelId,
      fetchNeighbors: fetchGraphNeighbors,
      search: searchModelNodes,
      resolveLinks: resolveModelLinks,
    })
    const result = await host.handle({ method, args })
    if ('error' in result) throw new Error(result.error)
    return result.data
  }

  async function handleApplyDiagramScriptCommands(commands: DiagramScriptCommand[]): Promise<void> {
    const diagram = options.activeDiagram.value
    if (!diagram || options.isDiagramReadOnly.value) {
      options.setUiError(options.t('validationScripts.applyReadOnly'))
      return
    }
    const addNodeIds = commands
      .filter(
        (command): command is Extract<DiagramScriptCommand, { type: 'addInstance' }> =>
          command.type === 'addInstance'
      )
      .map(command => command.nodeId)
    const addLinkIds = commands
      .filter(
        (command): command is Extract<DiagramScriptCommand, { type: 'addEdge' }> =>
          command.type === 'addEdge'
      )
      .map(command => command.linkId)

    const nodesResult = await resolveModelNodes(options.state.value.modelId, addNodeIds)
    if (!nodesResult.success) {
      options.setUiError(nodesResult.error.message)
      return
    }
    const linksResult = await resolveModelLinks(options.state.value.modelId, {
      linkIds: addLinkIds,
      endpointNodeIds: [],
    })
    if (!linksResult.success) {
      options.setUiError(linksResult.error.message)
      return
    }
    if (nodesResult.data.missingIds.length > 0 || linksResult.data.missingLinkIds.length > 0) {
      options.setUiError(options.t('validationScripts.applyMissingEntity'))
      return
    }

    const guard = options.partialStore.store.beginRequest('diagram-script-apply')
    if (
      !options.partialStore.mergePartialEntities(
        nodesResult.data.nodes,
        linksResult.data.links,
        guard
      )
    ) {
      options.setUiError(options.t('validationScripts.applyMissingEntity'))
      return
    }

    const linkEndpoints: Record<string, { sourceId: string; targetId: string }> = {}
    for (const link of linksResult.data.links) {
      linkEndpoints[link.id] = { sourceId: link.sourceId, targetId: link.targetId }
    }

    const validated = validateCommandQueue({
      instanceModelNodeIds: new Set(
        diagram.parsedAttrs.instances.nodes.map(instance => instance.modelNodeId)
      ),
      instanceIds: new Set(diagram.parsedAttrs.instances.nodes.map(instance => instance.id)),
      edgeIds: new Set(diagram.parsedAttrs.instances.edges.map(instance => instance.id)),
      canvasLinkIds: new Set(
        diagram.parsedAttrs.instances.edges.map(instance => instance.modelLinkId)
      ),
      linkEndpoints,
      commands,
    })
    if (!validated.ok) {
      options.setUiError(options.t('validationScripts.applyInvalidCommands'))
      return
    }

    const componentByNodeId: Record<string, string> = {}
    for (const nodeId of addNodeIds) {
      const node = options.state.value.nodes.find(item => item.id === nodeId && !item._isDeleted)
      if (!node) {
        options.setUiError(options.t('validationScripts.applyMissingEntity'))
        return
      }
      const matching = resolveCompatibleNotationComponents({
        node,
        notationId: diagram.notationId,
        components: options.state.value.components,
      })
      if (matching.length !== 1) {
        options.setUiError(options.t('validationScripts.applyNeedComponent'))
        return
      }
      componentByNodeId[nodeId] = matching[0]!.id
    }

    applyDiagramScriptCommands({
      diagram,
      commands,
      linkEndpoints,
      componentByNodeId,
      executeHistory: options.executeDiagramHistoryCommand,
      onApplied: () => {
        options.markDiagramDirty(diagram.id)
        options.invalidateTraceabilityDiagrams()
      },
    })
    closeValidationScriptsModal()
  }

  function closeValidationScriptsModal(): void {
    showValidationScriptsModal.value = false
    validationRunPayload.value = null
  }

  function handleValidationIssueSelect(issue: ValidationIssue): void {
    closeValidationScriptsModal()
    const target = issue.target
    if (!target) return
    if (target.kind === 'diagram') {
      options.selectDiagram(target.id)
      return
    }
    if (target.kind === 'node' || target.kind === 'folder') {
      options.selectedNodeId.value = target.id
      options.focusTreeNode(target.id)
      options.selectedModelNodeIds.value = [target.id]
      return
    }
    if (target.kind === 'link') {
      options.selectedModelLinkId.value = target.id
    }
  }

  return {
    showValidationScriptsModal,
    validationRunPayload,
    openValidationScriptsModal,
    closeValidationScriptsModal,
    handleDiagramScriptQuery,
    handleApplyDiagramScriptCommands,
    handleValidationIssueSelect,
  }
}
