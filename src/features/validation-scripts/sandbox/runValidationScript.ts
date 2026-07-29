import {
  VALIDATION_SCRIPT_TIMEOUT_MS,
  type ValidationRunResult,
  type ValidationSnapshot,
} from './types'
import { createValidationScriptApi, executeValidationScript } from './validationScriptApi'

export type RunValidationScriptOptions = {
  source: string
  snapshot: ValidationSnapshot
  openDiagramId: string | null
  timeoutMs?: number
  /** Prefer in-process for tests / environments without DOM iframe. */
  inProcess?: boolean
  signal?: AbortSignal
}

type SandboxDoneMessage = {
  type: 'done'
  requestId: string
  issues?: ValidationRunResult['issues']
  error?: string
  timedOut?: boolean
}

type SandboxReadyMessage = {
  type: 'ready'
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

function runInProcess(options: RunValidationScriptOptions): ValidationRunResult {
  const issues: ValidationRunResult['issues'] = []
  const api = createValidationScriptApi(options.snapshot, options.openDiagramId, issues)
  const { error } = executeValidationScript(options.source, api)
  return error ? { issues, error } : { issues }
}

function runInIframe(options: RunValidationScriptOptions): Promise<ValidationRunResult> {
  const timeoutMs = options.timeoutMs ?? VALIDATION_SCRIPT_TIMEOUT_MS
  const requestId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `run-${Date.now()}-${Math.random().toString(16).slice(2)}`

  return new Promise((resolve) => {
    const iframe = document.createElement('iframe')
    // No allow-same-origin: opaque origin so user script cannot touch parent DOM.
    iframe.setAttribute('sandbox', 'allow-scripts')
    iframe.setAttribute('title', 'validation-script-sandbox')
    iframe.style.display = 'none'

    let settled = false
    let ready = false

    const finish = (result: ValidationRunResult) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      window.removeEventListener('message', onMessage)
      options.signal?.removeEventListener('abort', onAbort)
      iframe.remove()
      resolve(result)
    }

    const onAbort = () => {
      finish({ issues: [], error: 'Cancelled' })
    }

    const sendRun = () => {
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
      const data = event.data as SandboxReadyMessage | SandboxDoneMessage | null
      if (!data || typeof data !== 'object') return

      if (data.type === 'ready') {
        if (ready || settled) return
        ready = true
        sendRun()
        return
      }

      if (data.type === 'done' && data.requestId === requestId) {
        finish({
          issues: data.issues ?? [],
          error: data.error,
          timedOut: data.timedOut,
        })
      }
    }

    const timer = setTimeout(() => {
      finish({ issues: [], error: 'Script timed out', timedOut: true })
    }, timeoutMs)

    options.signal?.addEventListener('abort', onAbort, { once: true })
    window.addEventListener('message', onMessage)

    iframe.onerror = () => {
      finish({ issues: [], error: 'Failed to load script sandbox' })
    }

    iframe.src = sandboxPageUrl()
    document.body.appendChild(iframe)
  })
}
