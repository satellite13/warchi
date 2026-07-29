<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState, Compartment } from '@codemirror/state'
import { javascript } from '@codemirror/lang-javascript'
import { validationScriptAutocomplete } from '../validationScriptApiCatalog'

const props = withDefaults(
  defineProps<{
    modelValue: string
    readonly?: boolean
  }>(),
  {
    readonly: false,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const editorHost = ref<HTMLElement | null>(null)
let view: EditorView | null = null
const readOnlyCompartment = new Compartment()

function buildExtensions(readonly: boolean) {
  return [
    basicSetup,
    javascript(),
    validationScriptAutocomplete,
    readOnlyCompartment.of(EditorState.readOnly.of(readonly)),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        emit('update:modelValue', update.state.doc.toString())
      }
    }),
    EditorView.theme({
      '&': {
        height: '100%',
        fontSize: '13px',
        backgroundColor: 'var(--surface-muted)',
      },
      '.cm-scroller': {
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
        lineHeight: '1.55',
      },
      '.cm-gutters': {
        backgroundColor: 'var(--surface-panel)',
        color: 'var(--text-subtle)',
        borderRight: '1px solid var(--border)',
      },
      '.cm-activeLineGutter': {
        backgroundColor: 'var(--primary-soft)',
        color: 'var(--primary)',
      },
      '.cm-activeLine': {
        backgroundColor: 'rgba(124, 92, 252, 0.06)',
      },
      '&.cm-focused': {
        outline: 'none',
      },
      '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
        backgroundColor: 'rgba(124, 92, 252, 0.18)',
      },
      '.cm-cursor': {
        borderLeftColor: 'var(--primary)',
      },
      '.cm-tooltip': {
        border: '1px solid var(--border)',
        backgroundColor: 'var(--surface)',
        borderRadius: '8px',
        color: 'var(--base-text)',
      },
      '.cm-tooltip-autocomplete ul li[aria-selected]': {
        backgroundColor: 'var(--primary-soft)',
        color: 'var(--base-text)',
      },
    }),
  ]
}

onMounted(() => {
  if (!editorHost.value) return
  view = new EditorView({
    parent: editorHost.value,
    state: EditorState.create({
      doc: props.modelValue,
      extensions: buildExtensions(props.readonly),
    }),
  })
})

onBeforeUnmount(() => {
  view?.destroy()
  view = null
})

watch(
  () => props.modelValue,
  (value) => {
    if (!view) return
    const current = view.state.doc.toString()
    if (value === current) return
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
    })
  },
)

watch(
  () => props.readonly,
  (readonly) => {
    if (!view) return
    view.dispatch({
      effects: readOnlyCompartment.reconfigure(EditorState.readOnly.of(readonly)),
    })
  },
)
</script>

<template>
  <div class="validation-script-code-editor">
    <div ref="editorHost" class="validation-script-code-editor__host" />
  </div>
</template>

<style scoped>
.validation-script-code-editor {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  background: var(--surface-muted);
}

.validation-script-code-editor__host {
  flex: 1;
  min-height: 0;
}

.validation-script-code-editor__host :deep(.cm-editor) {
  height: 100%;
}

.validation-script-code-editor__host :deep(.cm-editor.cm-focused) {
  outline: none;
}
</style>
