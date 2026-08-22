import type { ModelLiveSyncPullReason } from './modelLiveSyncTelemetry'

export type CollectionPullDecision =
  | { action: 'pull' }
  | { action: 'skip' }
  | { action: 'skip_hello' }
  | { action: 'queue' }

export function decideCollectionPull(input: {
  reason: ModelLiveSyncPullReason
  snapshotReady: boolean
  skipConnectResyncOnce: boolean
}): CollectionPullDecision {
  if (input.reason === 'stomp_model_changed') {
    return input.snapshotReady ? { action: 'pull' } : { action: 'queue' }
  }
  if (!input.snapshotReady) {
    return { action: 'skip' }
  }
  // The current shell/materialized store is the initial baseline. A STOMP hello
  // only establishes the subscription; it must not trigger a legacy full pull.
  if (input.reason === 'ws_connect') {
    return { action: 'skip_hello' }
  }
  if (
    input.skipConnectResyncOnce &&
    input.reason === 'session_resync'
  ) {
    return { action: 'skip_hello' }
  }
  return { action: 'pull' }
}
