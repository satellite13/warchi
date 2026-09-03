import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import type { ModelData } from '@/types/entities'
import { createEmptyModelEditorState } from '../types'
import { parseDiagramAttrs } from '../modelAttrs'
import { useModelEditorSync } from './useModelEditorSync'
import { useDiagramEditLock } from './useDiagramEditLock'
import { useDiagramRealtimeCollab } from './useDiagramRealtimeCollab'
import { useModelLiveSync } from './useModelLiveSync'

const mocks = vi.hoisted(() => ({
  useDiagramEditLock: vi.fn(),
  useDiagramRealtimeCollab: vi.fn(),
  useModelLiveSync: vi.fn(),
}))

vi.mock('./useDiagramEditLock', () => ({
  useDiagramEditLock: mocks.useDiagramEditLock,
}))

vi.mock('./useDiagramRealtimeCollab', () => ({
  useDiagramRealtimeCollab: mocks.useDiagramRealtimeCollab,
}))

vi.mock('./useModelLiveSync', () => ({
  useModelLiveSync: mocks.useModelLiveSync,
}))

function createModel(): ModelData {
  return {
    id: 'model-1',
    name: 'Model',
    version: '1.0.0',
    ownerId: 'owner-1',
    attrs: null,
    accessPermission: 'OWNER',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function createFacade() {
  const lock = {
    locksList: ref([{ diagramId: 'diagram-1', isLocked: true }]),
    isLockHeld: ref(true),
    isBlockedByOther: ref(false),
    lockHolderDisplay: ref<string | null>(null),
    remoteDiagramUpdatedAt: ref<string | null>(null),
    serverNewerWhileBlocked: ref(false),
    lockLost: ref(false),
    preserveLocalCanvasAfterLockLoss: ref(false),
    reloadAfterRemoteChange: vi.fn(async (loadModel: () => Promise<void>) => loadModel()),
    evaluateServerNewer: vi.fn(),
    verifyLockBeforeSave: vi.fn(async () => true),
    retryAcquire: vi.fn(async () => undefined),
  }
  const collab = {
    remoteEditorPointer: ref(null),
    diagramSpectators: ref([{ userId: 'user-2', displayName: 'Second User' }]),
    onLiveCollaborationGesture: vi.fn(),
    scheduleDebouncedLivePush: vi.fn(),
    handleModelTopicBroadcast: vi.fn(),
    onCanvasMouseMoveForPointer: vi.fn(),
    onCanvasMouseLeaveForPointer: vi.fn(),
    liveCanvasEpoch: ref(0),
  }
  mocks.useDiagramEditLock.mockReturnValue(lock)
  mocks.useDiagramRealtimeCollab.mockReturnValue(collab)

  const model = ref<ModelData | null>(createModel())
  const shellReady = ref(true)
  const state = ref(createEmptyModelEditorState())
  state.value.modelId = 'model-1'
  state.value.diagrams = [
    {
      id: 'diagram-1',
      name: 'Diagram',
      version: '1.0.0',
      modelId: 'model-1',
      ownerId: 'owner-1',
      notationId: 'notation-1',
      nodeId: null,
      parsedAttrs: parseDiagramAttrs(null),
    },
  ]
  const boundedSync = {
    materializedScopes: vi.fn(() => [{ kind: 'root' as const }]),
    refreshVisibleChildrenScope: vi.fn(async () => undefined),
    reloadOpenDiagramScope: vi.fn(async () => undefined),
  }

  const facade = useModelEditorSync({
    modelId: computed(() => state.value.modelId),
    state,
    model,
    enabled: ref(true),
    isLoading: ref(false),
    initialSnapshotReady: shellReady,
    catalogReady: ref(true),
    isSaving: ref(false),
    modelDirty: ref(false),
    selectedDiagramId: ref('diagram-1'),
    activeDiagramUpdatedAt: ref('2026-01-01T00:00:00.000Z'),
    isActiveDiagramLatest: ref(true),
    isDiagramReadOnlyBaseline: ref(false),
    canEditModel: ref(true),
    canInspectDiagramJson: ref(true),
    isSelectedDiagramPersistedOnServer: ref(true),
    currentUserId: ref('user-1'),
    getDiagramRenderer: () => null,
    ensureNotationRelationsAndRules: vi.fn(async () => undefined),
    boundedSync,
  })

  return { facade, lock, collab, shellReady, boundedSync }
}

describe('useModelEditorSync', () => {
  beforeEach(() => {
    mocks.useDiagramEditLock.mockClear()
    mocks.useDiagramRealtimeCollab.mockClear()
    mocks.useModelLiveSync.mockClear()
  })

  it('wires lock, collab and live sync with shared derived state', () => {
    const { facade, lock, collab, shellReady, boundedSync } = createFacade()

    expect(useDiagramEditLock).toHaveBeenCalled()
    expect(useDiagramRealtimeCollab).toHaveBeenCalledWith(
      expect.objectContaining({
        isLockHolder: facade.isDiagramLockHolder,
        isSpectator: facade.diagramLockBlockedByOther,
        preserveLocalCanvasAfterLockLoss: lock.preserveLocalCanvasAfterLockLoss,
      })
    )
    expect(useModelLiveSync).toHaveBeenCalledWith(
      expect.objectContaining({
        onModelTopicBroadcast: collab.handleModelTopicBroadcast,
        boundedSync,
      })
    )

    const liveSyncOptions = vi.mocked(useModelLiveSync).mock.calls[0]?.[0]
    expect(shellReady.value).toBe(true)
    expect(liveSyncOptions?.initialSnapshotReady).toBe(shellReady)
    expect(liveSyncOptions?.initialSnapshotReady.value).toBe(true)
    expect(liveSyncOptions?.preserveOpenDiagramCanvasInstances?.value).toBe(true)
    lock.isBlockedByOther.value = true
    expect(liveSyncOptions?.preserveOpenDiagramCanvasInstances?.value).toBe(false)
    expect(facade.isDiagramReadOnly.value).toBe(true)
    expect(facade.diagramLockHolderName.value).toBe('—')

    lock.isBlockedByOther.value = false
    expect(facade.isDiagramLockHolder.value).toBe(true)
    expect(facade.remoteEditorPointer).toBe(collab.remoteEditorPointer)
    expect(facade.diagramSpectators).toBe(collab.diagramSpectators)
    expect(facade.liveCanvasEpoch).toBe(collab.liveCanvasEpoch)
  })

  it('delegates lock reload and save verification', async () => {
    const { facade, lock } = createFacade()
    const loadModel = vi.fn(async () => undefined)

    await facade.handleReloadModelForDiagramLock(loadModel)
    await expect(facade.verifyLockBeforeSave()).resolves.toBe(true)

    expect(lock.reloadAfterRemoteChange).toHaveBeenCalledWith(loadModel)
    expect(lock.verifyLockBeforeSave).toHaveBeenCalled()
  })

  it('preserves open diagram canvas after lock loss even when blocked by other', () => {
    const { facade, lock } = createFacade()
    const liveSyncOptions = vi.mocked(useModelLiveSync).mock.calls[0]?.[0]
    lock.isBlockedByOther.value = true
    lock.preserveLocalCanvasAfterLockLoss.value = true
    expect(liveSyncOptions?.preserveOpenDiagramCanvasInstances?.value).toBe(true)
    lock.preserveLocalCanvasAfterLockLoss.value = false
    expect(liveSyncOptions?.preserveOpenDiagramCanvasInstances?.value).toBe(false)
    expect(facade.lockLost).toBe(lock.lockLost)
    expect(facade.retryAcquire).toBe(lock.retryAcquire)
    expect(facade.preserveLocalCanvasAfterLockLoss).toBe(lock.preserveLocalCanvasAfterLockLoss)
  })
})
