import {
  VALIDATION_SCRIPT_TIMEOUT_MS,
  type ValidationRunResult,
  type ValidationSnapshot,
} from './types'
import type { DiagramScriptCommand } from './diagramScriptCommands'
import {
  createValidationScriptApi,
  executeValidationScript,
  type DiagramScriptQueryFn,
} from './validationScriptApi'

export type RunValidationScriptOptions = {
  source: string
  snapshot: ValidationSnapshot
  openDiagramId: string | null
  timeoutMs?: number
  /** Prefer in-process for tests / environments without DOM iframe. */
  inProcess?: boolean
  signal?: AbortSignal
  query?: DiagramScriptQueryFn
}

type SandboxDoneMessage = {
  type: 'done'
  requestId: string
  issues?: ValidationRunResult['issues']
  commands?: DiagramScriptCommand[]
  error?: string
  timedOut?: boolean
}

type SandboxReadyMessage = {
  type: 'ready'
}

type SandboxQueryMessage = {
  type: 'query'
  requestId: string
  queryId: string
  method: string
  args?: Record<string, unknown>
}

function sandboxPageUrl(): string {
  const base = import.meta.env.BASE_URL || '/'
  return new URL('script-sandbox.html', window.location.origin + base).href
}

export async function runValidationScript(
  options: RunValidationScriptOptions
): Promise<ValidationRunResult> {
  if (options.inProcess || typeof document === 'undefined') {
    return runInProcess(options)
  }
  return runInIframe(options)
}

async function runInProcess(options: RunValidationScriptOptions): Promise<ValidationRunResult> {
  const issues: ValidationRunResult['issues'] = []
  const commands: DiagramScriptCommand[] = []
  const api = createValidationScriptApi(options.snapshot, options.openDiagramId, issues, {
    commands,
    query: options.query,
  })
  const { error } = await executeValidationScript(options.source, api)
  return error ? { issues, commands, error } : { issues, commands }
}

function runInIframe(options: RunValidationScriptOptions): Promise<ValidationRunResult> {
  const timeoutMs = options.timeoutMs ?? VALIDATION_SCRIPT_TIMEOUT_MS
  const requestId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `run-${Date.now()}-${Math.random().toString(16).slice(2)}`

  return new Promise((resolve) => {
    const iframe = document.createElement('iframe')
    iframe.setAttribute('sandbox', 'allow-scripts')
    iframe.setAttribute('title', 'validation-script-sandbox')
    iframe.style.display = 'none'

    let settled = false
    let ready = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const finish = (result: ValidationRunResult) => {
      if (settled) return
      settled = true
      if (timer != null) clearTimeout(timer)
      window.removeEventListener('message', onMessage)
      options.signal?.removeEventListener('abort', onAbort)
      iframe.remove()
      resolve(result)
    }

    const onAbort = () => {
      finish({ issues: [], commands: [], error: 'Cancelled' })
    }

    const armTimeout = () => {
      if (timer != null) clearTimeout(timer)
      timer = setTimeout(() => {
        finish({ issues: [], commands: [], error: 'Script timed out', timedOut: true })
      }, timeoutMs)
    }

    const sendRun = () => {
      armTimeout()
      iframe.contentWindow?.postMessage(
        {
          type: 'run',
          requestId,
          source: options.source,
          snapshot: options.snapshot,
          openDiagramId: options.openDiagramId,
        },
        '*'
      )
    }

    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframe.contentWindow) return
      const data = event.data as
        | SandboxReadyMessage
        | SandboxDoneMessage
        | SandboxQueryMessage
        | null
      if (!data || typeof data !== 'object') return

      if (data.type === 'ready') {
        if (ready || settled) return
        ready = true
        sendRun()
        return
      }

      if (data.type === 'query' && data.requestId === requestId) {
        if (settled) return
        void (async () => {
          let reply: { data?: unknown; error?: string }
          try {
            if (!options.query) {
              reply = { error: 'Query is not available' }
            } else {
              reply = { data: await options.query(data.method, data.args ?? {}) }
            }
          } catch (err) {
            reply = { error: err instanceof Error ? err.message : String(err) }
          }
          if (settled) return
          iframe.contentWindow?.postMessage(
            {
              type: 'queryResult',
              requestId,
              queryId: data.queryId,
              ...reply,
            },
            '*'
          )
        })()
        return
      }

      if (data.type === 'done' && data.requestId === requestId) {
        finish({
          issues: data.issues ?? [],
          commands: data.error || data.timedOut ? [] : (data.commands ?? []),
          error: data.error,
          timedOut: data.timedOut,
        })
      }
    }

    options.signal?.addEventListener('abort', onAbort, { once: true })
    window.addEventListener('message', onMessage)

    iframe.onerror = () => {
      finish({ issues: [], commands: [], error: 'Failed to load script sandbox' })
    }

    iframe.src = sandboxPageUrl()
    document.body.appendChild(iframe)
  })
}
