/** Слушатель: window.addEventListener(WARCHI_MODEL_LIVE_SYNC_EVENT, …) */
export const WARCHI_MODEL_LIVE_SYNC_EVENT = "warchi-model-live-sync"

export type ModelLiveSyncPullReason =
  | "stomp_model_changed"
  | "ws_connect"
  | "session_resync"
  | "visibility"
  | "poll_timer"
  | "auth_refresh"

export type ModelLiveSyncTelemetryDetail =
  | {
      kind: "ws_message_received"
      modelId: string
      messageType: string
      eventId?: string
    }
  | { kind: "ws_message_deduped"; modelId: string; eventId: string }
  | {
      kind: "pull_trigger"
      modelId: string
      reason: ModelLiveSyncPullReason
    }

export function emitModelLiveSyncTelemetry(detail: ModelLiveSyncTelemetryDetail): void {
  if (typeof window === "undefined") {
    return
  }
  window.dispatchEvent(new CustomEvent(WARCHI_MODEL_LIVE_SYNC_EVENT, { detail }))
}
