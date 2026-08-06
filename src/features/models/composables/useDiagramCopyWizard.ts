import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'
import type { ModelData, NotationData } from '@/types/entities'
import {
  buildResolutionsFromPreview,
  commitDiagramCopy,
  previewDiagramCopy,
  type DiagramCopyPreviewResponse,
  type DiagramCopyResolution,
} from './diagramCopyApi'

type SourceModelId = Ref<string> | ComputedRef<string>

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export function useDiagramCopyWizard(options: {
  sourceModelId: SourceModelId
  getSourceDiagramId?: () => string | null
}) {
  const show = ref(false)
  const step = ref(1)
  const sourceDiagramId = ref<string | null>(null)
  const targetModelId = ref(options.sourceModelId.value)
  const targetNotationId = ref('')
  const diagramName = ref('')
  const diagramVersion = ref('')
  const folderNodeId = ref<string | null>(null)
  const createParentNodeId = ref<string | null>(null)
  const resolutions = ref<Map<string, DiagramCopyResolution>>(new Map())
  const preview = ref<DiagramCopyPreviewResponse | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const availableModels = ref<ModelData[]>([])
  const availableNotations = ref<NotationData[]>([])

  const canFinish = computed(() => !!preview.value?.canCommit && !loading.value)

  function hasPreviewData(): boolean {
    return !!sourceDiagramId.value && !!targetModelId.value && !!targetNotationId.value
  }

  async function open(diagramId: string): Promise<void> {
    sourceDiagramId.value = diagramId
    step.value = 1
    resolutions.value = new Map()
    preview.value = null
    error.value = null
    diagramName.value = ''
    diagramVersion.value = ''
    folderNodeId.value = null
    createParentNodeId.value = null
    show.value = true

    await refreshPreview()
  }

  function close(): void {
    show.value = false
  }

  async function refreshPreview(): Promise<void> {
    if (!show.value || !hasPreviewData()) return

    const currentPreview = preview.value
    const sourceId = sourceDiagramId.value
    const modelId = targetModelId.value
    const notationId = targetNotationId.value
    if (!sourceId || !modelId || !notationId) return

    loading.value = true
    error.value = null
    try {
      const result = await previewDiagramCopy(modelId, {
        sourceDiagramId: sourceId,
        targetNotationId: notationId,
        resolutions: currentPreview
          ? buildResolutionsFromPreview(currentPreview, resolutions.value)
          : [],
      })
      if (!result.success) {
        error.value = result.error.message
        return
      }

      preview.value = result.data
      if (!diagramName.value) diagramName.value = result.data.suggestedName
      if (!diagramVersion.value) diagramVersion.value = result.data.suggestedVersion
    } catch (cause) {
      error.value = errorMessage(cause, 'Не удалось подготовить копирование диаграммы')
    } finally {
      loading.value = false
    }
  }

  function setResolution(sourceId: string, resolution: DiagramCopyResolution): void {
    const next = new Map(resolutions.value)
    next.set(sourceId, resolution)
    resolutions.value = next
    void refreshPreview()
  }

  async function commit(): Promise<{ targetModelId: string; diagramId: string } | null> {
    if (!hasPreviewData() || !preview.value || !diagramName.value || !diagramVersion.value) {
      error.value = 'Заполните обязательные поля копирования диаграммы'
      return null
    }

    const sourceId = sourceDiagramId.value
    const modelId = targetModelId.value
    const notationId = targetNotationId.value
    if (!sourceId || !modelId || !notationId) return null

    loading.value = true
    error.value = null
    try {
      const result = await commitDiagramCopy(modelId, {
        sourceDiagramId: sourceId,
        targetNotationId: notationId,
        name: diagramName.value,
        version: diagramVersion.value,
        nodeId: folderNodeId.value,
        createParentNodeId: createParentNodeId.value,
        resolutions: buildResolutionsFromPreview(preview.value, resolutions.value),
      })
      if (!result.success) {
        error.value = result.error.message
        return null
      }

      return { targetModelId: modelId, diagramId: result.data.diagram.id }
    } catch (cause) {
      error.value = errorMessage(cause, 'Не удалось скопировать диаграмму')
      return null
    } finally {
      loading.value = false
    }
  }

  watch([targetModelId, targetNotationId], () => {
    if (!show.value || !hasPreviewData()) return
    resolutions.value = new Map()
    void refreshPreview()
  })

  return {
    show,
    step,
    sourceDiagramId,
    targetModelId,
    targetNotationId,
    diagramName,
    diagramVersion,
    folderNodeId,
    createParentNodeId,
    resolutions,
    preview,
    loading,
    error,
    availableModels,
    availableNotations,
    canFinish,
    open,
    close,
    refreshPreview,
    setResolution,
    commit,
  }
}
