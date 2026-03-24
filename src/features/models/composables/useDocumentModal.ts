import { ref, type ComputedRef, type Ref } from 'vue'
import { apiPost } from '@/composables/useApi'
import type { EditorNode } from '../types'

type DocModalTarget = { kind: 'model' | 'node' | 'diagram'; id: string } | null
type DocModalContext =
  | { kind: 'property'; propertyKey: string; scope?: 'nodeType' | 'notationComponent' }
  | null

export interface DocumentModalDeps {
  model: Ref<{ name: string; attrs?: string | null } | null>
  state: Ref<{
    modelId: string
    nodes: EditorNode[]
    diagrams: { id: string; name: string; notationId: string; parsedAttrs: { documentFileId?: string }; _isDeleted?: boolean }[]
  }>
  selectedDiagramId: Ref<string | null>
  selectedNode: ComputedRef<EditorNode | null>
  activeNotationId: ComputedRef<string | null>
  nodeBindingComponentId: ComputedRef<string | null>
  documentsFromApi: Ref<{ fileId: string; label: string }[]>
  markModelDirty: () => void
  markNodeDirty: (id: string) => void
  markDiagramDirty: (id: string) => void
  setNodeScopedValue: (key: string, value: unknown) => void
  setNodeTypePropertyValue: (key: string, value: unknown) => void
  t: (key: string) => string
}

export function useDocumentModal(deps: DocumentModalDeps) {
  const showDocModal = ref(false)
  const docModalTitle = ref('')
  const docModalFileId = ref<string | null>(null)
  const docModalTarget = ref<DocModalTarget>(null)
  const docModalContext = ref<DocModalContext>(null)

  function getModelDocFileId(): string | null {
    const raw = deps.model.value?.attrs
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      return typeof parsed.documentFileId === 'string' ? parsed.documentFileId : null
    } catch {
      return null
    }
  }

  function setModelDocFileId(fileId: string) {
    const raw = deps.model.value?.attrs
    let parsed: Record<string, unknown> = {}
    if (raw) {
      try {
        parsed = JSON.parse(raw) as Record<string, unknown>
      } catch {
        parsed = {}
      }
    }
    parsed.documentFileId = fileId
    if (deps.model.value) {
      deps.model.value.attrs = JSON.stringify(parsed)
      deps.markModelDirty()
    }
  }

  function handleOpenModelDoc() {
    docModalTarget.value = { kind: 'model', id: deps.state.value.modelId }
    docModalTitle.value = deps.model.value?.name ?? deps.t('models.entityName')
    docModalFileId.value = getModelDocFileId()
    showDocModal.value = true
  }

  function handleOpenNodeDoc(node: EditorNode) {
    docModalTarget.value = { kind: 'node', id: node.id }
    docModalTitle.value = node.name
    docModalFileId.value = node.parsedAttrs.documentFileId ?? null
    showDocModal.value = true
  }

  function handleOpenDiagramDoc() {
    const diagram = deps.state.value.diagrams.find(
      (d) => d.id === deps.selectedDiagramId.value,
    )
    if (!diagram) return
    docModalTarget.value = { kind: 'diagram', id: diagram.id }
    docModalTitle.value = diagram.name
    docModalFileId.value = diagram.parsedAttrs.documentFileId ?? null
    showDocModal.value = true
  }

  function handleOpenDocumentFromBadge(fileId: string) {
    docModalTarget.value = null
    docModalContext.value = null
    docModalTitle.value = ''
    docModalFileId.value = fileId
    showDocModal.value = true
  }

  function handleCreateDocumentForProperty(
    propertyName: string,
    scope?: 'nodeType' | 'notationComponent'
  ) {
    docModalTarget.value = null
    docModalContext.value = { kind: 'property', propertyKey: propertyName, scope }
    docModalTitle.value = ''
    docModalFileId.value = null
    showDocModal.value = true
  }

  async function handleDocSaved(fileId: string) {
    const ctx = docModalContext.value
    if (ctx?.kind === 'property') {
      const modelId = deps.state.value.modelId
      const nodeId = deps.selectedNode.value?.id ?? null
      const nodeTypeId = deps.selectedNode.value?.nodeTypeId ?? null
      const notationId = deps.activeNotationId.value
      const componentId = deps.nodeBindingComponentId.value

      if (ctx.scope === 'nodeType') {
        deps.setNodeTypePropertyValue(ctx.propertyKey, fileId)
        if (modelId && nodeId && nodeTypeId) {
          const res = await apiPost<{ fileId: string; label: string }>('/documents', {
            fileId,
            modelId,
            nodeId,
            nodeTypeId,
          })
          if (res.success) {
            const existing = deps.documentsFromApi.value.find(
              (d) => d.fileId === res.data.fileId,
            )
            if (!existing)
              deps.documentsFromApi.value = [...deps.documentsFromApi.value, res.data]
          }
        }
      } else {
        deps.setNodeScopedValue(ctx.propertyKey, fileId)
        if (modelId && (nodeId ?? notationId ?? componentId)) {
          const res = await apiPost<{ fileId: string; label: string }>('/documents', {
            fileId,
            modelId: modelId ?? undefined,
            nodeId: nodeId ?? undefined,
            notationId: notationId ?? undefined,
            componentId: componentId ?? undefined,
          })
          if (res.success) {
            const existing = deps.documentsFromApi.value.find(
              (d) => d.fileId === res.data.fileId,
            )
            if (!existing)
              deps.documentsFromApi.value = [...deps.documentsFromApi.value, res.data]
          }
        }
      }
      docModalContext.value = null
      showDocModal.value = false
      return
    }
    const target = docModalTarget.value
    if (!target) return

    const modelId = deps.state.value.modelId ?? undefined

    if (target.kind === 'model') {
      setModelDocFileId(fileId)
      if (modelId) {
        await apiPost<{ fileId: string; label: string }>('/documents', { fileId, modelId })
      }
    } else if (target.kind === 'node') {
      const node = deps.state.value.nodes.find((n) => n.id === target.id)
      if (node && !node.parsedAttrs.documentFileId) {
        node.parsedAttrs.documentFileId = fileId
        deps.markNodeDirty(target.id)
      }
      if (modelId) {
        await apiPost<{ fileId: string; label: string }>('/documents', {
          fileId,
          modelId,
          nodeId: target.id,
        })
      }
    } else if (target.kind === 'diagram') {
      const diagram = deps.state.value.diagrams.find((d) => d.id === target.id)
      if (diagram && !diagram.parsedAttrs.documentFileId) {
        diagram.parsedAttrs.documentFileId = fileId
        deps.markDiagramDirty(target.id)
      }
      if (modelId) {
        await apiPost<{ fileId: string; label: string }>('/documents', {
          fileId,
          modelId,
          diagramId: target.id,
        })
      }
    }
  }

  function handleDocModalClose() {
    showDocModal.value = false
    docModalTarget.value = null
    docModalContext.value = null
  }

  return {
    showDocModal,
    docModalTitle,
    docModalFileId,
    handleOpenModelDoc,
    handleOpenNodeDoc,
    handleOpenDiagramDoc,
    handleOpenDocumentFromBadge,
    handleCreateDocumentForProperty,
    handleDocSaved,
    handleDocModalClose,
  }
}
