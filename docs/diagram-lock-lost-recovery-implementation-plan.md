# Diagram Lock Lost Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Потеря блокировки диаграммы больше не маскируется под «снял администратор» и не выкидывает из редактора с потерей несохранённых правок.

**Architecture:** Клиент перестаёт считать пустой `GET /diagram-locks` админским force-release. Если лок, который мы держали, пропал — один тихий `acquire`; успех продолжает редактирование, чужой holder переводит в просмотр с сохранением локального холста, сеть/ошибка оставляет редактор открытым с кнопкой повтора. Навигация на список моделей по этому событию удаляется. arepos и papirus не меняем.

**Tech Stack:** Vue 3 / TypeScript / Vitest (warchi). arepos API без изменений: `acquire` / `heartbeat` / `GET /diagram-locks`.

---

## Правила выполнения

- Ветка только в **warchi**: `feat/diagram-lock-lost-recovery`. arepos-server и papirus не трогать.
- Каждый task: failing test → implement → указанные тесты → commit (когда выполняете план; этот файл не коммитить заранее без запроса).
- Не менять TTL сервера (180 с) и политику `visibilitychange → releaseHeld` (это сознательная коллаборация).
- Не вводить STOMP-событие / таблицу revocation / `FORCE_RELEASED` в этом плане.

## Зафиксированные решения (не открывать заново)

- **Нет сигнала «админ» без сервера.** Пустой список лока, 404 heartbeat, чужой holder — это `lost` / `blocked`, не `forceRevoked`.
- **Один тихий re-acquire** при неожиданной потере своего лока. Если пользователь жив, он не «завис» — вернуть лок корректно. Если лок уже у другого — зритель.
- **Никогда не `router.push('models')` из-за лока.** `allowLeave` для этого сценария не ставить. Диалог несохранённого остаётся единственным путём ухода.
- **Локальный холст не затирать**, если мы только что потеряли свой лок. `preserveOpenDiagramCanvasInstances` должен оставаться `true`, пока пользователь сам не нажмёт «Загрузить с сервера».
- **`applyLockForSelection` не делает release+acquire**, если уже держим ту же eligible-диаграмму. Это убирает щель, в которую попадает 15-секундный поллинг списка.
- **Пока идёт lock-операция** (`release` / `acquire` / `recover`), ответ `GET /diagram-locks` не вызывает recovery.
- **`visibilitychange=hidden`** по-прежнему отпускает лок и обнуляет `heldDiagramId` *до* fetch — это не recovery и не «админ».
- Ключ `models.diagramLockForceRevoked` удалить. Новые ключи — ниже. Существующий неиспользуемый `models.diagramLockRetryEdit` начать показывать в шапке.

## Поведение после потери лока

| Что на сервере | Что делает клиент | UI |
|---|---|---|
| Лок снова наш после `acquire` | `held` , редактирование как было | Без баннера |
| `reason=LOCKED_BY_OTHER` | `blocked`, холст read-only, локальные instances не затираются | Чип держателя + «Попробовать редактировать» + при необходимости «Загрузить с сервера» |
| `acquire` неуспешен (сеть / 5xx) | `lockLost=true`, остаёмся в редакторе | Чип «блокировка потеряна» + «Попробовать редактировать» |
| Пользователь жмёт Save, лока нет и recover не вернул `held` | `verifyLockBeforeSave` → `false` | `setUiError(diagramLockLostSaveBlocked)`, **не** уходим со страницы |

Реальный админский force-release в этой версии выглядит как обычная потеря лока (тихий re-acquire или зритель). Это приемлемо: force-release нужен для зависшей сессии; живой редактор не завис.

## Карта файлов

**Изменить (warchi):**

- `src/features/models/composables/useDiagramEditLock.ts` — recovery вместо force-revoke, skip same-diagram release, ignore stale list, heartbeat обрабатывает ошибку
- `src/features/models/composables/useDiagramEditLock.test.ts` — новые и обновлённые тесты
- `src/features/models/composables/useModelEditorSync.ts` — `lockLost`, `retryAcquire`, preserve canvas после потери лока
- `src/features/models/composables/useModelEditorSync.test.ts` — мок нового API
- `src/features/models/ModelEditor.vue` — убрать watch с `alert` + `router.push`; ошибка на Save; прокинуть retry
- `src/features/models/components/ModelEditorHeader.vue` — кнопка «Попробовать редактировать», чип потери лока
- `src/i18n/locales/models.ts` — ru/en ключи
- `src/features/docs/content/diagrams.md` и `diagrams.en.md` — что происходит при истечении/потере лока
- `CHANGELOG.md`, `CHANGELOG.ru.md`

**Не менять:** arepos `DiagramEditLockService`, TTL, cleanup scheduler, admin force-release API.

## Контракт composable

После изменения `useDiagramEditLock` возвращает (новые/заменённые поля):

```ts
lockLost: Ref<boolean>          // acquire не удался после потери своего лока
retryAcquire: () => Promise<void>  // кнопка «Попробовать редактировать»
preserveLocalCanvasAfterLockLoss: Ref<boolean>
```

Удалить из публичного API:

```ts
lockForceRevoked
dismissForceRevoked
```

`verifyLockBeforeSave(): Promise<boolean>` остаётся, но при пропаже лока вызывает `recoverLostLock()` и возвращает `true` только если снова `held`.

`recoverLostLock` — внутренний, не экспортировать.

---

### Task 0: Ветка

**Files:** нет

- [ ] **Step 1: Создать ветку в warchi**

```bash
cd /Users/nikolaygroznyh/Work/warchi && git checkout -b feat/diagram-lock-lost-recovery
```

Expected: ветка `feat/diagram-lock-lost-recovery`, arepos/papirus не переключать.

---

### Task 1: Пустой список лока — recover, не force-revoke

**Files:**

- Test: `src/features/models/composables/useDiagramEditLock.test.ts`
- Modify: `src/features/models/composables/useDiagramEditLock.ts`

- [ ] **Step 1: Заменить тест, который закрепляет баг**

В `useDiagramEditLock.test.ts` удалить кейс `revokes local lock state when verify before save no longer finds our lock` (он требует `lockForceRevoked === true`). Добавить:

```ts
it('re-acquires when the locks list no longer contains our held lock', async () => {
  const { lock, selectedDiagramId } = mountLock()
  selectedDiagramId.value = 'diagram-1'
  await flushPromises()
  expect(lock.isLockHeld.value).toBe(true)

  vi.mocked(apiGet).mockResolvedValue({
    success: true,
    data: { items: [], total: 0, page: 0, size: 0 },
  })
  vi.mocked(apiPost).mockImplementation(async (url: string) => {
    if (String(url).endsWith('/acquire')) {
      return {
        success: true,
        data: { diagramId: 'diagram-1', isLocked: true, lockedByUserId: 'user-1' },
      }
    }
    return { success: true, data: {} }
  })

  await lock.fetchLocksList()
  await flushPromises()

  expect(lock.isLockHeld.value).toBe(true)
  expect(lock.lockLost.value).toBe(false)
  expect(apiPost).toHaveBeenCalledWith('/diagram-locks/diagram-1/acquire', {})
})

it('becomes blocked and keeps lockLost false when another user took the lock', async () => {
  const { lock, selectedDiagramId } = mountLock()
  selectedDiagramId.value = 'diagram-1'
  await flushPromises()

  vi.mocked(apiGet).mockResolvedValue({
    success: true,
    data: { items: [], total: 0, page: 0, size: 0 },
  })
  vi.mocked(apiPost).mockImplementation(async (url: string) => {
    if (String(url).endsWith('/acquire')) {
      return {
        success: true,
        data: {
          diagramId: 'diagram-1',
          isLocked: true,
          lockedByUserId: 'user-2',
          lockedByDisplay: 'Other User',
          reason: 'LOCKED_BY_OTHER',
        },
      }
    }
    return { success: true, data: {} }
  })

  await lock.fetchLocksList()
  await flushPromises()

  expect(lock.isLockHeld.value).toBe(false)
  expect(lock.isBlockedByOther.value).toBe(true)
  expect(lock.lockHolderDisplay.value).toBe('Other User')
  expect(lock.lockLost.value).toBe(false)
  expect(lock.preserveLocalCanvasAfterLockLoss.value).toBe(true)
})
```

В `beforeEach` мок `apiGet` может по-прежнему отдавать `{ content: [...] }` — `paginatedContent` это понимает. Новые ответы лучше сразу в формате arepos `{ items }`.

- [ ] **Step 2: Прогнать тесты — должны упасть**

```bash
cd /Users/nikolaygroznyh/Work/warchi && npx vitest run src/features/models/composables/useDiagramEditLock.test.ts
```

Expected: FAIL — нет `lockLost` / `preserveLocalCanvasAfterLockLoss`, старый `lockForceRevoked` ещё на месте, `fetchLocksList` выставляет revoke без acquire.

- [ ] **Step 3: Минимальная реализация recovery**

В `useDiagramEditLock.ts`:

1. Заменить `lockForceRevoked` на `lockLost = ref(false)` и добавить `preserveLocalCanvasAfterLockLoss = ref(false)`.
2. Удалить `dismissForceRevoked`.
3. `checkHeldLockRevoked`:
   - если нет `heldDiagramId` — return;
   - если `lockOpInFlight` — return;
   - если лок всё ещё наш — return;
   - иначе `void recoverLostLock()`.
4. Добавить внутренний `recoverLostLock`:

```ts
async function recoverLostLock(): Promise<'held' | 'blocked' | 'failed'> {
  const diagramId = heldDiagramId.value ?? options.selectedDiagramId.value
  heldDiagramId.value = null
  heldByUserId.value = null
  clearHeartbeat()
  preserveLocalCanvasAfterLockLoss.value = true
  lockLost.value = false
  if (!diagramId) return 'failed'
  const res = await apiPost<DiagramLockStatusResponse>(`/diagram-locks/${diagramId}/acquire`, {})
  if (res.success && res.data && res.data.reason !== LOCKED_BY_OTHER) {
    heldDiagramId.value = diagramId
    heldByUserId.value = res.data.lockedByUserId ?? null
    startHeartbeat(diagramId)
    preserveLocalCanvasAfterLockLoss.value = false
    return 'held'
  }
  if (res.success && res.data?.reason === LOCKED_BY_OTHER) {
    isBlockedByOther.value = true
    lockHolderDisplay.value = res.data.lockedByDisplay ?? null
    remoteDiagramUpdatedAt.value = res.data.diagramUpdatedAt ?? null
    startBlockedPoll(diagramId)
    return 'blocked'
  }
  lockLost.value = true
  return 'failed'
}
```

5. `fetchLocksList` по-прежнему вызывает `checkHeldLockRevoked`.
6. Вернуть `lockLost`, `preserveLocalCanvasAfterLockLoss`, `retryAcquire` (пока `retryAcquire` может быть `() => applyLockForSelection()`, если apply уже не делает лишний release — это Task 2).
7. Не выставлять `lockForceRevoked` нигде.

- [ ] **Step 4: Прогнать тесты**

```bash
cd /Users/nikolaygroznyh/Work/warchi && npx vitest run src/features/models/composables/useDiagramEditLock.test.ts
```

Expected: PASS для новых кейсов. Старые acquire/blocked кейсы зелёные.

- [ ] **Step 5: Commit**

```bash
git add src/features/models/composables/useDiagramEditLock.ts src/features/models/composables/useDiagramEditLock.test.ts
git commit -m "$(cat <<'EOF'
fix: recover diagram lock instead of treating a missing list row as admin revoke

EOF
)"
```

---

### Task 2: Не отпускать лок, если уже держим ту же диаграмму

**Files:**

- Test: `src/features/models/composables/useDiagramEditLock.test.ts`
- Modify: `src/features/models/composables/useDiagramEditLock.ts`

- [ ] **Step 1: Failing-тест**

```ts
it('does not release and re-acquire when the same eligible diagram stays selected', async () => {
  const { lock, selectedDiagramId } = mountLock()
  selectedDiagramId.value = 'diagram-1'
  await flushPromises()
  vi.mocked(apiPost).mockClear()

  selectedDiagramId.value = 'diagram-1'
  await flushPromises()

  expect(apiPost).not.toHaveBeenCalledWith('/diagram-locks/diagram-1/release', {})
  expect(apiPost).not.toHaveBeenCalledWith('/diagram-locks/diagram-1/acquire', {})
  expect(lock.isLockHeld.value).toBe(true)
})
```

Смена `selectedDiagramId` на то же значение watch не вызовет. Нужен триггер watch: расширить `mountLock`, чтобы наружу отдать `isActiveDiagramLatest` (или `canEditModel`) и моргнуть им `true → false → true` — это как раз живой баг при live-sync.

Обновить helper:

```ts
function mountLock(selectedDiagramId = ref<string | null>(null)) {
  const isActiveDiagramLatest = ref(true)
  const canEditModel = ref(true)
  const isSelectedDiagramPersistedOnServer = ref(true)
  // ... передать эти ref в useDiagramEditLock
  return { lock, selectedDiagramId, isActiveDiagramLatest, canEditModel, wrapper }
}
```

Тест щели:

```ts
it('does not release when latest-flag flickers true on the same held diagram', async () => {
  const { lock, selectedDiagramId, isActiveDiagramLatest } = mountLock()
  selectedDiagramId.value = 'diagram-1'
  await flushPromises()
  expect(lock.isLockHeld.value).toBe(true)
  vi.mocked(apiPost).mockClear()

  isActiveDiagramLatest.value = false
  await flushPromises()
  isActiveDiagramLatest.value = true
  await flushPromises()

  expect(apiPost).not.toHaveBeenCalledWith('/diagram-locks/diagram-1/release', {})
  expect(lock.isLockHeld.value).toBe(true)
})
```

Когда `latest` стал `false`, текущий код **должен** отпустить лок (диаграмма больше не редактируемая). Когда снова `true` — взять. Flicker `true→false→true` как раз создаёт щель.

Продуктовое решение для flicker: **не отпускать при `latest=false`, если диаграмма та же и мы её держим**, только если `selectedDiagramId` сменился или `canEdit`/`persisted` стали false надолго? Нет — если открыта старая версия, лок надо отпустить.

Значит flicker `latest` всё ещё release+acquire. Этот task защищает другой случай: **повторный `applyLockForSelection` при том же eligible-наборе**. Его вызывает `visibilitychange=visible` и `reloadAfterRemoteChange`.

Тест:

```ts
it('skips release+acquire when apply is invoked while already holding the eligible diagram', async () => {
  const { lock, selectedDiagramId } = mountLock()
  selectedDiagramId.value = 'diagram-1'
  await flushPromises()
  vi.mocked(apiPost).mockClear()

  await lock.retryAcquire()
  await flushPromises()

  expect(apiPost).not.toHaveBeenCalledWith('/diagram-locks/diagram-1/release', {})
  expect(apiPost).not.toHaveBeenCalledWith('/diagram-locks/diagram-1/acquire', {})
  expect(lock.isLockHeld.value).toBe(true)
})
```

`retryAcquire` при уже удерживаемом лока — no-op (лок наш). Кнопка «Попробовать редактировать» имеет смысл только когда `!isLockHeld`.

- [ ] **Step 2: Прогон — FAIL** (retryAcquire либо всегда release+acquire, либо ещё нет)

```bash
cd /Users/nikolaygroznyh/Work/warchi && npx vitest run src/features/models/composables/useDiagramEditLock.test.ts -t "skips release"
```

- [ ] **Step 3: Реализация**

В начале `applyLockForSelection` (после чтения `diagramId` / `canEdit` / `latest` / `persisted`):

```ts
const eligible = !!diagramId && canEdit && latest && persisted
if (eligible && heldDiagramId.value === diagramId) {
  return
}
```

`retryAcquire`:

```ts
async function retryAcquire(): Promise<void> {
  if (heldDiagramId.value && heldDiagramId.value === options.selectedDiagramId.value) {
    return
  }
  await applyLockForSelection()
}
```

Для `latest=false` путь остаётся: `eligible=false` → `releaseHeld()` как сейчас.

- [ ] **Step 4: Прогон**

```bash
cd /Users/nikolaygroznyh/Work/warchi && npx vitest run src/features/models/composables/useDiagramEditLock.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/models/composables/useDiagramEditLock.ts src/features/models/composables/useDiagramEditLock.test.ts
git commit -m "$(cat <<'EOF'
fix: skip diagram lock release when the same eligible diagram is already held

EOF
)"
```

---

### Task 3: Игнорировать список лока во время release/acquire

**Files:**

- Test: `src/features/models/composables/useDiagramEditLock.test.ts`
- Modify: `src/features/models/composables/useDiagramEditLock.ts`

- [ ] **Step 1: Failing-тест гонки**

Нужно, чтобы `fetchLocksList` завершился *после* того, как `applyLockForSelection` уже начал release и ещё не закончил acquire (или сразу после acquire со stale-снимком «пусто»).

```ts
it('ignores a locks-list response that arrives during release or acquire', async () => {
  let resolveList: ((value: unknown) => void) | null = null
  vi.mocked(apiGet).mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveList = resolve
      })
  )
  vi.mocked(apiPost).mockResolvedValue({
    success: true,
    data: { diagramId: 'diagram-1', isLocked: true, lockedByUserId: 'user-1' },
  })

  const { lock, selectedDiagramId } = mountLock()
  selectedDiagramId.value = 'diagram-1'
  const listPromise = lock.fetchLocksList()
  await flushPromises()

  resolveList?.({
    success: true,
    data: { items: [], total: 0, page: 0, size: 0 },
  })
  await listPromise
  await flushPromises()

  expect(lock.lockLost.value).toBe(false)
  expect(lock.isLockHeld.value).toBe(true)
})
```

Сценарий точнее: сначала успешно взять лок (обычный `apiGet`), затем повесить `apiGet` в pending, вызвать `fetchLocksList`, параллельно сменить диаграмму туда-обратно чтобы пошёл `applyLockForSelection`, затем отдать пустой список. Если `lockOpInFlight` не проверяется — сработает recover/lost.

Практически достаточно флага:

```ts
let lockOpInFlight = 0
```

Инкремент в `applyLockForSelection` / `recoverLostLock` / `releaseHeld` на входе, декремент в `finally`. `checkHeldLockRevoked` выходит, если `lockOpInFlight > 0`.

- [ ] **Step 2: Прогон — FAIL без флага**

```bash
cd /Users/nikolaygroznyh/Work/warchi && npx vitest run src/features/models/composables/useDiagramEditLock.test.ts -t "ignores a locks-list"
```

- [ ] **Step 3: Реализация флага**

```ts
let lockOpInFlight = 0

function beginLockOp(): void {
  lockOpInFlight += 1
}
function endLockOp(): void {
  lockOpInFlight = Math.max(0, lockOpInFlight - 1)
}

function checkHeldLockRevoked(serverLocks: DiagramLockStatusResponse[]): void {
  if (lockOpInFlight > 0) return
  // ... existing stillOurs / recoverLostLock
}
```

Обернуть тело `applyLockForSelection`, `releaseHeld`, `recoverLostLock` в `try/finally`.

- [ ] **Step 4: Прогон всего файла**

```bash
cd /Users/nikolaygroznyh/Work/warchi && npx vitest run src/features/models/composables/useDiagramEditLock.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/models/composables/useDiagramEditLock.ts src/features/models/composables/useDiagramEditLock.test.ts
git commit -m "$(cat <<'EOF'
fix: ignore diagram lock list snapshots while a lock operation is in flight

EOF
)"
```

---

### Task 4: Heartbeat 404/403 запускает recover, а не молчит

**Files:**

- Test: `src/features/models/composables/useDiagramEditLock.test.ts`
- Modify: `src/features/models/composables/useDiagramEditLock.ts`

- [ ] **Step 1: Failing-тест**

```ts
it('recovers the lock when heartbeat reports the lock is gone', async () => {
  vi.useFakeTimers()
  const { lock, selectedDiagramId } = mountLock()
  selectedDiagramId.value = 'diagram-1'
  await flushPromises()
  expect(lock.isLockHeld.value).toBe(true)

  vi.mocked(apiPost).mockImplementation(async (url: string) => {
    if (String(url).endsWith('/heartbeat')) {
      return { success: false, error: { status: 404, message: 'Lock expired' } }
    }
    if (String(url).endsWith('/acquire')) {
      return {
        success: true,
        data: { diagramId: 'diagram-1', isLocked: true, lockedByUserId: 'user-1' },
      }
    }
    return { success: true, data: {} }
  })

  await vi.advanceTimersByTimeAsync(60_000)
  await flushPromises()

  expect(apiPost).toHaveBeenCalledWith('/diagram-locks/diagram-1/acquire', {})
  expect(lock.isLockHeld.value).toBe(true)
  expect(lock.lockLost.value).toBe(false)
  vi.useRealTimers()
})
```

- [ ] **Step 2: Прогон — FAIL** (`startHeartbeat` делает `void apiPost` без проверки)

```bash
cd /Users/nikolaygroznyh/Work/warchi && npx vitest run src/features/models/composables/useDiagramEditLock.test.ts -t "recovers the lock when heartbeat"
```

- [ ] **Step 3: Реализация**

```ts
const startHeartbeat = (diagramId: string): void => {
  clearHeartbeat()
  heartbeatTimer = setInterval(() => {
    void (async () => {
      const res = await apiPost<DiagramLockStatusResponse>(
        `/diagram-locks/${diagramId}/heartbeat`,
        {}
      )
      if (res.success) return
      const status = res.error.status
      if (status === 404 || status === 403 || status === 409) {
        await recoverLostLock()
      }
    })()
  }, HEARTBEAT_MS)
}
```

Сеть/5xx не трогать — TTL ещё жив, следующий heartbeat через 60 с. Три неудачи за 180 с по-прежнему истекают на сервере; тогда сработает list-poll → recover.

- [ ] **Step 4: Прогон файла**

```bash
cd /Users/nikolaygroznyh/Work/warchi && npx vitest run src/features/models/composables/useDiagramEditLock.test.ts
```

Expected: PASS. В `afterEach`/`finally` теста обязательно `vi.useRealTimers()`.

- [ ] **Step 5: Commit**

```bash
git add src/features/models/composables/useDiagramEditLock.ts src/features/models/composables/useDiagramEditLock.test.ts
git commit -m "$(cat <<'EOF'
fix: recover a diagram lock when heartbeat says it is gone

EOF
)"
```

---

### Task 5: Save не выкидывает; сначала recover, потом отказ

**Files:**

- Test: `src/features/models/composables/useDiagramEditLock.test.ts`
- Modify: `src/features/models/composables/useDiagramEditLock.ts`

- [ ] **Step 1: Failing-тесты**

```ts
it('verifyLockBeforeSave re-acquires a missing lock and allows save', async () => {
  const { lock, selectedDiagramId } = mountLock()
  selectedDiagramId.value = 'diagram-1'
  await flushPromises()

  vi.mocked(apiGet).mockResolvedValue({
    success: true,
    data: { items: [], total: 0, page: 0, size: 0 },
  })
  vi.mocked(apiPost).mockImplementation(async (url: string) => {
    if (String(url).endsWith('/acquire')) {
      return {
        success: true,
        data: { diagramId: 'diagram-1', isLocked: true, lockedByUserId: 'user-1' },
      }
    }
    return { success: true, data: {} }
  })

  await expect(lock.verifyLockBeforeSave()).resolves.toBe(true)
  expect(lock.isLockHeld.value).toBe(true)
  expect(lock.lockLost.value).toBe(false)
})

it('verifyLockBeforeSave returns false when another user holds the lock', async () => {
  const { lock, selectedDiagramId } = mountLock()
  selectedDiagramId.value = 'diagram-1'
  await flushPromises()

  vi.mocked(apiGet).mockResolvedValue({
    success: true,
    data: { items: [], total: 0, page: 0, size: 0 },
  })
  vi.mocked(apiPost).mockImplementation(async (url: string) => {
    if (String(url).endsWith('/acquire')) {
      return {
        success: true,
        data: {
          diagramId: 'diagram-1',
          isLocked: true,
          lockedByUserId: 'user-2',
          lockedByDisplay: 'Other User',
          reason: 'LOCKED_BY_OTHER',
        },
      }
    }
    return { success: true, data: {} }
  })

  await expect(lock.verifyLockBeforeSave()).resolves.toBe(false)
  expect(lock.isBlockedByOther.value).toBe(true)
  expect(lock.lockLost.value).toBe(false)
})
```

- [ ] **Step 2: Прогон — FAIL**, если `verifyLockBeforeSave` ещё ставит revoke / сразу `false` без acquire

```bash
cd /Users/nikolaygroznyh/Work/warchi && npx vitest run src/features/models/composables/useDiagramEditLock.test.ts -t "verifyLockBeforeSave"
```

- [ ] **Step 3: Реализация**

```ts
async function verifyLockBeforeSave(): Promise<boolean> {
  if (!heldDiagramId.value) return true
  const mid = options.modelId.value
  if (!mid) return true
  const res = await apiGet<PaginatedResponse<DiagramLockStatusResponse>>(
    `/diagram-locks?modelId=${encodeURIComponent(mid)}`
  )
  if (!res.success) return false
  const entry = paginatedContent(res.data).find((l) => l.diagramId === heldDiagramId.value)
  const stillOurs =
    entry != null &&
    entry.isLocked &&
    (heldByUserId.value == null || entry.lockedByUserId === heldByUserId.value)
  if (stillOurs) return true
  return (await recoverLostLock()) === 'held'
}
```

- [ ] **Step 4: Прогон файла**

```bash
cd /Users/nikolaygroznyh/Work/warchi && npx vitest run src/features/models/composables/useDiagramEditLock.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/models/composables/useDiagramEditLock.ts src/features/models/composables/useDiagramEditLock.test.ts
git commit -m "$(cat <<'EOF'
fix: re-acquire a lost diagram lock before refusing save

EOF
)"
```

---

### Task 6: ModelEditor больше не уводит на список моделей

**Files:**

- Modify: `src/features/models/ModelEditor.vue`
- Modify: `src/features/models/composables/useModelEditorSync.ts`
- Test: `src/features/models/composables/useModelEditorSync.test.ts`
- Modify: `src/i18n/locales/models.ts`

- [ ] **Step 1: Обновить мок sync-теста**

В `useModelEditorSync.test.ts` заменить

```ts
lockForceRevoked: ref(false),
dismissForceRevoked: vi.fn(),
```

на

```ts
lockLost: ref(false),
preserveLocalCanvasAfterLockLoss: ref(false),
retryAcquire: vi.fn(async () => undefined),
```

Добавить проверку preserve:

```ts
it('preserves open diagram canvas after lock loss even when blocked by other', () => {
  const { facade, lock } = createFacade()
  const liveSyncOptions = vi.mocked(useModelLiveSync).mock.calls[0]?.[0]
  lock.isBlockedByOther.value = true
  lock.preserveLocalCanvasAfterLockLoss.value = true
  expect(liveSyncOptions?.preserveOpenDiagramCanvasInstances?.value).toBe(true)
  lock.preserveLocalCanvasAfterLockLoss.value = false
  expect(liveSyncOptions?.preserveOpenDiagramCanvasInstances?.value).toBe(false)
})
```

- [ ] **Step 2: Прогон — FAIL** (мок не совпадает с реальным return, preserve ещё `!isBlockedByOther`)

```bash
cd /Users/nikolaygroznyh/Work/warchi && npx vitest run src/features/models/composables/useModelEditorSync.test.ts
```

- [ ] **Step 3: Прокинуть новое API**

`useModelEditorSync.ts`:

```ts
preserveOpenDiagramCanvasInstances: computed(
  () =>
    !diagramEditLock.isBlockedByOther.value ||
    diagramEditLock.preserveLocalCanvasAfterLockLoss.value
),
```

В return добавить `lockLost`, `retryAcquire`, `preserveLocalCanvasAfterLockLoss`. Убрать `dismissForceRevoked`.

`reloadAfterRemoteChange` / кнопка «Загрузить с сервера» должны сбрасывать флаг:

В `useDiagramEditLock.reloadAfterRemoteChange` первой строкой:

```ts
preserveLocalCanvasAfterLockLoss.value = false
```

`ModelEditor.vue`:

1. Удалить целиком watch на `diagramEditLock.lockForceRevoked` (alert + `allowLeave` + `router.push`).
2. В `saveWithValidation` после неуспешного `verifyLockBeforeSave`:

```ts
const lockOk = await verifyLockBeforeSave()
if (!lockOk) {
  setUiError(t('models.diagramLockLostSaveBlocked'))
  return false
}
```

3. Деструктурировать `retryAcquire` / `lockLost` из `useModelEditorSync` и прокинуть в header (Task 7).

Ключи в `src/i18n/locales/models.ts` (ru и en, рядом с `diagramLockRetryEdit`):

```ts
diagramLockLost: 'Блокировка редактирования потеряна. Несохранённые изменения на холсте остались локально.',
diagramLockLostChip: 'Блокировка потеряна',
diagramLockLostSaveBlocked: 'Нельзя сохранить холст: блокировка редактирования потеряна. Нажмите «Попробовать редактировать» или дождитесь освобождения.',
```

```ts
diagramLockLost: 'The edit lock was lost. Unsaved canvas changes are still kept locally.',
diagramLockLostChip: 'Lock lost',
diagramLockLostSaveBlocked: 'Cannot save the canvas: the edit lock was lost. Click “Try to edit” or wait until the diagram is free.',
```

Удалить `diagramLockForceRevoked` в обоих языках.

- [ ] **Step 4: Прогон**

```bash
cd /Users/nikolaygroznyh/Work/warchi && npx vitest run src/features/models/composables/useModelEditorSync.test.ts src/features/models/composables/useDiagramEditLock.test.ts
```

Expected: PASS. `vue-tsc` не требуется на этом шаге, но не должно остаться ссылок на `lockForceRevoked` / `dismissForceRevoked`.

```bash
rg -n "lockForceRevoked|dismissForceRevoked|diagramLockForceRevoked" src
```

Expected: пусто.

- [ ] **Step 5: Commit**

```bash
git add src/features/models/ModelEditor.vue \
  src/features/models/composables/useModelEditorSync.ts \
  src/features/models/composables/useModelEditorSync.test.ts \
  src/features/models/composables/useDiagramEditLock.ts \
  src/i18n/locales/models.ts
git commit -m "$(cat <<'EOF'
fix: keep the model editor open when a diagram lock is lost

EOF
)"
```

---

### Task 7: Шапка — чип потери и кнопка «Попробовать редактировать»

**Files:**

- Modify: `src/features/models/components/ModelEditorHeader.vue`
- Modify: `src/features/models/ModelEditor.vue`

В шапке ключ `diagramLockRetryEdit` уже есть, но нигде не рендерится. Кнопку «Загрузить с сервера» не убирать.

- [ ] **Step 1: Пропсы header**

Добавить:

```ts
diagramLockLost?: boolean
```

emit:

```ts
diagramLockRetry: []
```

Показывать группу лока, если `isDiagramReadOnly && (diagramLockBlockedByOther || diagramLockLost)`.

Чип:

- blocked → как сейчас, имя держателя;
- lost и не blocked → текст чипа `t('models.diagramLockLostChip')`, `title` = `t('models.diagramLockLost')`.

Кнопка retry всегда, когда `diagramLockBlockedByOther || diagramLockLost`:

```vue
<button
  type="button"
  class="lock-reload-btn"
  @click="emit('diagramLockRetry')"
>
  {{ t('models.diagramLockRetryEdit') }}
</button>
```

Кнопка reload — как сейчас, только при `diagramLockServerNewer`.

- [ ] **Step 2: ModelEditor прокидывает события**

```vue
:diagram-lock-lost="diagramEditLock.lockLost.value"
@diagram-lock-retry="() => diagramEditLock.retryAcquire()"
```

(или через уже прокинутые computed из sync, без `.value` в шаблоне).

`retryAcquire` при `blocked` должен вызывать `applyLockForSelection` (лок мы не держим — skip same-diagram не сработает, пойдёт acquire). Это существующий путь «попробовать, когда освободят».

- [ ] **Step 3: Прогон unit**

```bash
cd /Users/nikolaygroznyh/Work/warchi && npx vitest run src/features/models/composables/useDiagramEditLock.test.ts src/features/models/composables/useModelEditorSync.test.ts
```

Expected: PASS. Отдельного component-теста header нет — не заводить, проверка ручная в Task 9.

- [ ] **Step 4: Commit**

```bash
git add src/features/models/components/ModelEditorHeader.vue src/features/models/ModelEditor.vue
git commit -m "$(cat <<'EOF'
fix: show retry edit when a diagram lock is lost or held by another user

EOF
)"
```

---

### Task 8: Документация и changelog

**Files:**

- Modify: `src/features/docs/content/diagrams.md`
- Modify: `src/features/docs/content/diagrams.en.md`
- Modify: `CHANGELOG.md`
- Modify: `CHANGELOG.ru.md`

- [ ] **Step 1: Дописать секцию блокировки**

В `diagrams.md` после пункта про истечение TTL добавить (не удаляя абзац про админов):

```markdown
- Если блокировка **пропала, пока вы редактировали** (истечение, обрыв сети, другая вкладка отпустила лок), редактор **остаётся открытым**. Несохранённые правки холста не сбрасываются. Клиент один раз запрашивает блокировку снова; если диаграмму уже занял кто-то другой, холст переходит в просмотр, локальная копия сохраняется, пока вы не нажмёте **«Загрузить с сервера»**.
- Сообщение «блокировку снял администратор» больше не показывается при обычной потере лока. Админское снятие зависшей блокировки по-прежнему есть в [Администрирование](/docs/admin); если ваша сессия жива, клиент ведёт себя как при обычной потере лока.
```

Английский зеркальный абзац в `diagrams.en.md`.

- [ ] **Step 2: CHANGELOG [Unreleased]**

`CHANGELOG.ru.md`:

```markdown
### Исправлено
- Потеря блокировки диаграммы больше не показывается как снятие администратором и не выкидывает из редактора с потерей несохранённых правок.
```

`CHANGELOG.md` — тот же смысл по-английски.

- [ ] **Step 3: Commit**

```bash
git add src/features/docs/content/diagrams.md src/features/docs/content/diagrams.en.md CHANGELOG.md CHANGELOG.ru.md
git commit -m "$(cat <<'EOF'
docs: describe diagram lock recovery instead of a false admin revoke

EOF
)"
```

---

### Task 9: Проверка

- [ ] **Step 1: Юнит-тесты затронутых файлов**

```bash
cd /Users/nikolaygroznyh/Work/warchi && npx vitest run \
  src/features/models/composables/useDiagramEditLock.test.ts \
  src/features/models/composables/useModelEditorSync.test.ts
```

Expected: PASS, 0 failed.

- [ ] **Step 2: Поиск мёртвых имён**

```bash
rg -n "lockForceRevoked|dismissForceRevoked|diagramLockForceRevoked" src tests
```

Expected: пусто.

- [ ] **Step 3: Ручной сценарий (когда есть стенд)**

1. Открыть последнюю версию диаграммы, поменять элемент, **не сохранять**.
2. В DevTools заблокировать `POST /diagram-locks/*/heartbeat` (offline / 404) и подождать до 60 с — либо выполнить `GET /diagram-locks` так, чтобы списка не было. Ожидание: редактор на месте, правки на холсте, нет текста про администратора.
3. Если другой пользователь взял лок — чип с его именем, холст read-only, локальные фигуры на месте, Save пишет `diagramLockLostSaveBlocked`.
4. «Попробовать редактировать» после освобождения возвращает редактирование.
5. Переключение на другую вкладку и назад не показывает «админ» и не уводит на `/models`.
6. Настоящий force-release из `/admin/diagram-locks` при живой вкладке: тихий re-acquire или зритель, без выкидывания.

---

## Вне скоупа (отдельный план, если понадобится)

- Серверный `FORCE_RELEASED` (строка revocation / STOMP), чтобы отличить админа от TTL.
- Запрет re-acquire тем же userId сразу после force-release (нужен, только если админы часто отбирают лок у живого редактора).
- Менять TTL, интервал heartbeat или отключать release на `visibilitychange`.
- E2E Playwright на гонку списка — юнитов достаточно для корневых веток.
