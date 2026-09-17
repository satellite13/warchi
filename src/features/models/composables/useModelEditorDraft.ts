import { markRaw, reactive } from 'vue'
import { loadJson, removeJson, saveJson } from '@/utils/localStorage'
import type { ModelData } from '@/types/entities'
import type { EditorDiagram, EditorLink, EditorNode, ModelEditorState } from '../types'

const STORAGE_KEY = 'warchi:model-editor-draft:v1'
const SCHEMA_VERSION = 1

/**
 * Локальный черновик открытой модели. Хранит только редактируемый контент
 * (узлы/связи/диаграммы с parsedAttrs и флагами `_isNew/_isDirty/_isDeleted`)
 * и метаданные модели. Каталог (нотации/типы/компоненты/отношения) в черновик
 * не входит — он догружается с сервера при открытии.
 */
export type ModelEditorDraftSnapshot = {
  schemaVersion: number
  savedAt: number
  model: { id: string; name: string; version: string; ownerId: string }
  nodes: EditorNode[]
  links: EditorLink[]
  diagrams: EditorDiagram[]
}

export function hasModelEditorDraft(modelId: string): boolean {
  return loadModelEditorDraft(modelId) !== null
}

export function loadModelEditorDraft(modelId: string): ModelEditorDraftSnapshot | null {
  const map = loadJson<Record<string, ModelEditorDraftSnapshot>>(STORAGE_KEY)
  if (!map) return null
  const snap = map[modelId]
  if (!snap || snap.schemaVersion !== SCHEMA_VERSION || snap.model.id !== modelId) return null
  return snap
}

export function saveModelEditorDraft(modelId: string, snapshot: ModelEditorDraftSnapshot): void {
  const map = loadJson<Record<string, ModelEditorDraftSnapshot>>(STORAGE_KEY) ?? {}
  map[modelId] = snapshot
  saveJson(STORAGE_KEY, map)
}

export function clearModelEditorDraft(modelId: string): void {
  const map = loadJson<Record<string, ModelEditorDraftSnapshot>>(STORAGE_KEY)
  if (!map || !(modelId in map)) return
  delete map[modelId]
  if (Object.keys(map).length === 0) {
    removeJson(STORAGE_KEY)
  } else {
    saveJson(STORAGE_KEY, map)
  }
}

export function createModelEditorDraftSnapshot(
  state: ModelEditorState,
  model: ModelData
): ModelEditorDraftSnapshot {
  return {
    schemaVersion: SCHEMA_VERSION,
    savedAt: Date.now(),
    model: { id: model.id, name: model.name, version: model.version, ownerId: model.ownerId },
    nodes: state.nodes,
    links: state.links,
    diagrams: state.diagrams,
  }
}

/**
 * Восстанавливает редакторские сущности из черновика. Массив `state` уже
 * реактивен, поэтому узлы/связи оборачиваем `markRaw` (как при загрузке), а
 * диаграммы — `reactive`, чтобы изменённый холст отслеживался как обычно.
 */
export function restoreModelEditorDraft(snapshot: ModelEditorDraftSnapshot): {
  nodes: EditorNode[]
  links: EditorLink[]
  diagrams: EditorDiagram[]
} {
  return {
    nodes: snapshot.nodes.map(node => markRaw({ ...node })),
    links: snapshot.links.map(link => markRaw({ ...link })),
    diagrams: snapshot.diagrams.map(diagram => {
      const materialized = reactive({ ...diagram })
      void materialized.parsedAttrs
      return materialized
    }),
  }
}
