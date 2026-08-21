import { describe, expect, it } from 'vitest'
import { decideCollectionPull } from './modelLiveSyncPullGate'

describe('decideCollectionPull', () => {
  it('skips opportunistic pulls until the local snapshot is ready', () => {
    for (const reason of ['ws_connect', 'session_resync', 'poll_timer', 'visibility', 'auth_refresh'] as const) {
      expect(
        decideCollectionPull({
          reason,
          snapshotReady: false,
          skipConnectResyncOnce: false,
        })
      ).toEqual({ action: 'skip' })
    }
  })

  it('queues a foreign model_changed until the local snapshot is ready', () => {
    expect(
      decideCollectionPull({
        reason: 'stomp_model_changed',
        snapshotReady: false,
        skipConnectResyncOnce: false,
      })
    ).toEqual({ action: 'queue' })
  })

  it('skips the first connect/resync after the local snapshot becomes ready', () => {
    expect(
      decideCollectionPull({
        reason: 'ws_connect',
        snapshotReady: true,
        skipConnectResyncOnce: true,
      })
    ).toEqual({ action: 'skip_hello' })
    expect(
      decideCollectionPull({
        reason: 'session_resync',
        snapshotReady: true,
        skipConnectResyncOnce: true,
      })
    ).toEqual({ action: 'skip_hello' })
  })

  it('pulls later connect/resync, poll, visibility and queued model_changed', () => {
    expect(
      decideCollectionPull({
        reason: 'ws_connect',
        snapshotReady: true,
        skipConnectResyncOnce: false,
      })
    ).toEqual({ action: 'pull' })
    expect(
      decideCollectionPull({
        reason: 'poll_timer',
        snapshotReady: true,
        skipConnectResyncOnce: true,
      })
    ).toEqual({ action: 'pull' })
    expect(
      decideCollectionPull({
        reason: 'stomp_model_changed',
        snapshotReady: true,
        skipConnectResyncOnce: true,
      })
    ).toEqual({ action: 'pull' })
  })
})
