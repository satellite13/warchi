import type { DiagramNodeInstance } from '../modelAttrs'

export const DIAGRAM_NOTE_NODE_PREFIX = '__diagram-note__:'
export const DIAGRAM_CONTAINER_NODE_PREFIX = '__diagram-container__:'
export const DIAGRAM_EDGE_ANCHOR_NODE_PREFIX = '__diagram-edge-anchor__:'
export const DIAGRAM_NOTE_EDGE_MODEL_LINK_PREFIX = '__diagram-note-edge__:'
export const DIAGRAM_UNTYPED_EDGE_MODEL_LINK_PREFIX = '__diagram-untyped-edge__:'

export const DEFAULT_CONTAINER_DIAGRAM_STYLE = {
  nodeShape: 'rectangle',
  fillColor: 'rgba(0,0,0,0)',
  strokeColor: '#8a8a8a',
  strokeWidth: 1.5,
  lineDash: [6, 4],
  labelColor: '#5c5c5c',
  labelFontSize: 12,
  labelAlign: 'left',
  labelVerticalAlign: 'top',
  labelInset: 8,
  labelPlacement: 'top',
} as const

export const DEFAULT_EDGE_ANCHOR_DIAGRAM_STYLE = {
  nodeShape: 'rectangle',
  fillColor: 'rgba(0,0,0,0)',
  strokeColor: 'rgba(0,0,0,0)',
  strokeWidth: 0,
  labelColor: 'rgba(0,0,0,0)',
  labelFontSize: 1,
} as const

export const DEFAULT_DIAGRAM_ONLY_LINK_STYLE = {
  edgeType: 'straight',
  startMarkerType: 'none',
  endMarkerType: 'none',
  lineDash: [4, 4],
} as const

export const EDGE_ANCHOR_SIZE = 8

export function isDiagramNoteModelNodeId(modelNodeId: string): boolean {
  return modelNodeId.startsWith(DIAGRAM_NOTE_NODE_PREFIX)
}

export function isDiagramContainerModelNodeId(modelNodeId: string): boolean {
  return modelNodeId.startsWith(DIAGRAM_CONTAINER_NODE_PREFIX)
}

export function isEdgeAnchorModelNodeId(modelNodeId: string): boolean {
  return modelNodeId.startsWith(DIAGRAM_EDGE_ANCHOR_NODE_PREFIX)
}

export function isDiagramOnlyEdgeModelLinkId(modelLinkId: string): boolean {
  return (
    modelLinkId.startsWith(DIAGRAM_NOTE_EDGE_MODEL_LINK_PREFIX) ||
    modelLinkId.startsWith(DIAGRAM_UNTYPED_EDGE_MODEL_LINK_PREFIX)
  )
}

export function isDiagramOnlyNodeModelNodeId(modelNodeId: string): boolean {
  return (
    isDiagramNoteModelNodeId(modelNodeId) ||
    isDiagramContainerModelNodeId(modelNodeId) ||
    isEdgeAnchorModelNodeId(modelNodeId)
  )
}

export function isContainerInstance(instance: DiagramNodeInstance): boolean {
  return instance.attrs?.isContainer === true
}

export function getContainerLabel(instance: DiagramNodeInstance): string {
  const value = instance.attrs?.containerLabel
  return typeof value === 'string' ? value : ''
}

/** Persist inline-edited canvas text onto a diagram-only container instance. */
export function applyContainerInlineLabel(
  instance: DiagramNodeInstance,
  labelText: string
): boolean {
  if (!isContainerInstance(instance)) return false
  if (labelText === getContainerLabel(instance)) return false
  if (!instance.attrs) instance.attrs = {}
  instance.attrs.containerLabel = labelText
  return true
}

export function isEdgeAnchorInstance(instance: DiagramNodeInstance): boolean {
  return instance.attrs?.isEdgeAnchor === true
}

export function getHostEdgeInstanceId(instance: DiagramNodeInstance): string | null {
  if (!isEdgeAnchorInstance(instance)) return null
  const hostId = instance.attrs?.hostEdgeInstanceId
  return typeof hostId === 'string' && hostId ? hostId : null
}
