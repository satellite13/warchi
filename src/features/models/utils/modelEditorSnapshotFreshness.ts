/** Suppress redundant live-sync pulls right after a full model load. */
let freshUntilMs = 0

export function markModelEditorSnapshotFresh(
  ttlMs = 8_000,
  nowMs: number = Date.now()
): void {
  freshUntilMs = nowMs + Math.max(0, ttlMs)
}

export function isModelEditorSnapshotFresh(nowMs: number = Date.now()): boolean {
  return nowMs < freshUntilMs
}

/** Test helper. */
export function resetModelEditorSnapshotFreshness(): void {
  freshUntilMs = 0
}
