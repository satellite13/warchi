import { ref, type Ref } from 'vue'
import type { EditorDiagram } from '../types'

export function useNoteEditor(
  activeDiagram: Ref<EditorDiagram | null>,
  isDiagramReadOnly: Ref<boolean>,
  markDiagramDirty: (id: string) => void
) {
  const showNoteEditorModal = ref(false)
  const editingNoteInstanceId = ref<string | null>(null)
  const noteEditorText = ref('')

  const isNoteInstance = (instance: { attrs?: Record<string, unknown> }): boolean =>
    instance.attrs?.isNote === true

  const openNoteEditor = (instanceId: string) => {
    const diagram = activeDiagram.value
    if (!diagram) return
    const instance = diagram.parsedAttrs.instances.nodes.find(item => item.id === instanceId)
    if (!instance || !isNoteInstance(instance)) return
    const currentText = instance.attrs?.noteText
    noteEditorText.value = typeof currentText === 'string' ? currentText : 'Новая заметка'
    editingNoteInstanceId.value = instanceId
    showNoteEditorModal.value = true
  }

  const saveNoteEditor = () => {
    if (isDiagramReadOnly.value) return
    const diagram = activeDiagram.value
    const instanceId = editingNoteInstanceId.value
    if (!diagram || !instanceId) return
    const instance = diagram.parsedAttrs.instances.nodes.find(item => item.id === instanceId)
    if (!instance || !isNoteInstance(instance)) return

    const nextText = noteEditorText.value.trim()
    if (!instance.attrs) instance.attrs = {}
    instance.attrs.noteText = nextText.length > 0 ? nextText : 'Новая заметка'
    markDiagramDirty(diagram.id)
    showNoteEditorModal.value = false
    editingNoteInstanceId.value = null
  }

  const cancelNoteEditor = () => {
    showNoteEditorModal.value = false
    editingNoteInstanceId.value = null
  }

  return {
    showNoteEditorModal,
    editingNoteInstanceId,
    noteEditorText,
    isNoteInstance,
    openNoteEditor,
    saveNoteEditor,
    cancelNoteEditor,
  }
}
