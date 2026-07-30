import { createValidationScriptApi, executeValidationScript } from './validationScriptApi'
import type { ValidationRunResult, ValidationSnapshot } from './types'

type RunMessage = {
  type: 'run'
  requestId: string
  source: string
  snapshot: ValidationSnapshot
  openDiagramId: string | null
}

type DoneMessage = {
  type: 'done'
  requestId: string
} & ValidationRunResult

type ReadyMessage = {
  type: 'ready'
}

function isRunMessage(value: unknown): value is RunMessage {
  if (!value || typeof value !== 'object') return false
  const msg = value as Record<string, unknown>
  return (
    msg.type === 'run' &&
    typeof msg.requestId === 'string' &&
    typeof msg.source === 'string' &&
    msg.snapshot != null &&
    typeof msg.snapshot === 'object'
  )
}

window.addEventListener('message', (event: MessageEvent) => {
  // Prefer source check: sandboxed iframe is opaque-origin ("null"), parent is real origin.
  if (event.source !== window.parent) return
  if (!isRunMessage(event.data)) return

  const issues: ValidationRunResult['issues'] = []
  let result: DoneMessage
  try {
    const api = createValidationScriptApi(event.data.snapshot, event.data.openDiagramId, issues)
    const { error } = executeValidationScript(event.data.source, api)
    result = error
      ? { type: 'done', requestId: event.data.requestId, issues, error }
      : { type: 'done', requestId: event.data.requestId, issues }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    result = {
      type: 'done',
      requestId: event.data.requestId,
      issues,
      error: message,
    }
  }
  // targetOrigin '*' is required when this document is opaque (sandbox without allow-same-origin).
  window.parent.postMessage(result, '*')
})

const ready: ReadyMessage = { type: 'ready' }
window.parent.postMessage(ready, '*')
