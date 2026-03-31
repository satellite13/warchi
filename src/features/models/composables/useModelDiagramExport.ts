import { ref, type Ref } from 'vue'
import { ImageExporter, SvgExporter, type DiagramRenderer } from '@ngroznykh/papirus'
import { uploadDiagramSvg } from '@/composables/useApi'
import { appendDiagramCaption } from '@/utils/diagramSvgCaption'
import type { EditorDiagram } from '../types'
import type { ModelData } from '@/types/entities'

function sanitizeFileName(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9а-яё_-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function getBackgroundColor(): string {
  return getComputedStyle(document.documentElement).getPropertyValue('--base-bg').trim() || '#ffffff'
}

export function useModelDiagramExport(
  model: Ref<ModelData | null>,
  activeDiagram: Ref<EditorDiagram | null>,
  diagramRenderer: Ref<DiagramRenderer | null>,
  activeDiagramNotationName: Ref<string>,
  activeDiagramNotationVersion: Ref<string>,
  setUiError: (msg: string) => void
) {
  const showDiagramImageShareModal = ref(false)

  function getDiagramExportBaseName(): string {
    const modelName = model.value?.name?.trim() || 'model'
    const diagramName = activeDiagram.value?.name?.trim() || 'diagram'
    const modelPart = sanitizeFileName(modelName) || 'model'
    const diagramPart = sanitizeFileName(diagramName) || 'diagram'
    return `${modelPart}-${diagramPart}`
  }

  function buildCaptionedSvg(): string | null {
    if (!activeDiagram.value || !diagramRenderer.value) return null
    const exporter = new SvgExporter(diagramRenderer.value)
    let svg = exporter.exportSVG({
      includeBackground: true,
      backgroundColor: getBackgroundColor(),
      padding: 24,
    })
    svg = appendDiagramCaption(svg, {
      diagramName: activeDiagram.value.name,
      diagramVersion: activeDiagram.value.version,
      notationName: activeDiagramNotationName.value,
      notationVersion: activeDiagramNotationVersion.value,
    })
    return svg
  }

  const exportActiveDiagramAsPng = async () => {
    if (!activeDiagram.value || !diagramRenderer.value) {
      setUiError('Откройте диаграмму перед экспортом.')
      return
    }
    const exporter = new ImageExporter(diagramRenderer.value)
    await exporter.download(`${getDiagramExportBaseName()}.png`, {
      scale: 2,
      padding: 24,
      backgroundColor: getBackgroundColor(),
    })
  }

  const exportActiveDiagramAsSvg = () => {
    const svg = buildCaptionedSvg()
    if (!svg) {
      setUiError('Откройте диаграмму перед экспортом.')
      return
    }
    const blob = new Blob([svg], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${getDiagramExportBaseName()}.svg`
    link.click()
    URL.revokeObjectURL(url)
  }

  const uploadDiagramPreview = async (): Promise<boolean> => {
    if (!activeDiagram.value?.id || !diagramRenderer.value) {
      setUiError('Откройте диаграмму перед обновлением превью.')
      return false
    }
    const svg = buildCaptionedSvg()
    if (!svg) return false
    const result = await uploadDiagramSvg(activeDiagram.value.id, svg)
    if (result.success) return true
    setUiError(result.error.message)
    return false
  }

  return {
    showDiagramImageShareModal,
    exportActiveDiagramAsPng,
    exportActiveDiagramAsSvg,
    uploadDiagramPreview,
  }
}
