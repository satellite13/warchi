export type PendingDiagramAction = 'switch' | 'close'

export type PendingDiagramSwitchResult =
  | { ok: false }
  | { ok: true; effect: 'none' }
  | { ok: true; effect: 'close' }
  | { ok: true; effect: 'switch'; diagramId: string }

export async function applyPendingDiagramSwitch(options: {
  discard: () => Promise<boolean>
  action: PendingDiagramAction | null
  targetDiagramId: string | null
}): Promise<PendingDiagramSwitchResult> {
  if (!options.action) return { ok: true, effect: 'none' }
  const discarded = await options.discard()
  if (!discarded) return { ok: false }
  if (options.action === 'close') return { ok: true, effect: 'close' }
  if (!options.targetDiagramId) return { ok: true, effect: 'none' }
  return { ok: true, effect: 'switch', diagramId: options.targetDiagramId }
}
