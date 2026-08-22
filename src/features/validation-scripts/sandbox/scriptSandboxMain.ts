import { createValidationScriptApi, executeValidationScript } from './validationScriptApi'
import type { DiagramScriptCommand } from './diagramScriptCommands'
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

type QueryResultMessage = {
  type: 'queryResult'
  requestId: string
  queryId: string
  data?: unknown
  error?: string
}

type PendingQuery = {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
}

const pendingQueries = new Map<string, PendingQuery>()
let activeRequestId: string | null = null

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

function isQueryResultMessage(value: unknown): value is QueryResultMessage {
  if (!value || typeof value !== 'object') return false
  const msg = value as Record<string, unknown>
  return (
    msg.type === 'queryResult' &&
    typeof msg.requestId === 'string' &&
    typeof msg.queryId === 'string'
  )
}

function rejectPending(reason: string): void {
  for (const pending of pendingQueries.values()) {
    pending.reject(new Error(reason))
  }
  pendingQueries.clear()
}

function queryRpc(
  requestId: string,
  method: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const queryId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `q-${Date.now()}-${Math.random().toString(16).slice(2)}`
  return new Promise((resolve, reject) => {
    pendingQueries.set(queryId, { resolve, reject })
    window.parent.postMessage(
      { type: 'query', requestId, queryId, method, args },
      '*'
    )
  })
}

window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== window.parent) return

  if (isQueryResultMessage(event.data)) {
    if (event.data.requestId !== activeRequestId) return
    const pending = pendingQueries.get(event.data.queryId)
    if (!pending) return
    pendingQueries.delete(event.data.queryId)
    if (event.data.error) pending.reject(new Error(event.data.error))
    else pending.resolve(event.data.data)
    return
  }

  if (!isRunMessage(event.data)) return

  rejectPending('Replaced by a new run')
  activeRequestId = event.data.requestId
  const issues: ValidationRunResult['issues'] = []
  const commands: DiagramScriptCommand[] = []
  const requestId = event.data.requestId

  const query = (method: string, args: Record<string, unknown>): Promise<unknown> =>
    queryRpc(requestId, method, args)

  void (async () => {
    let result: DoneMessage
    try {
      const api = createValidationScriptApi(
        event.data.snapshot,
        event.data.openDiagramId,
        issues,
        { commands, query }
      )
      const { error } = await executeValidationScript(event.data.source, api)
      result = error
        ? { type: 'done', requestId, issues, commands: [], error }
        : { type: 'done', requestId, issues, commands }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      result = {
        type: 'done',
        requestId,
        issues,
        commands: [],
        error: message,
      }
    }
    if (activeRequestId !== requestId) return
    rejectPending('Run finished')
    window.parent.postMessage(result, '*')
  })()
})

const ready: ReadyMessage = { type: 'ready' }
window.parent.postMessage(ready, '*')
