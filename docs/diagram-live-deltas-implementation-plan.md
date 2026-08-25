# Diagram Live Deltas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Live-эфир диаграммы не шлёт весь `instances` и не отваливается 413 на больших холстах: в канал идут дельты и чанки, размер диаграммы больше не является потолком.

**Architecture:** Тело `POST /diagram-locks/{id}/live` — конверт (`patch` или `snapshot-chunk`), не полный `{ nodes, edges }`. Клиент считает diff относительно последнего подтверждённого снимка; если пакет больше транспортного лимита — режет на несколько POST с одним `seq`. Зритель применяет патч или собирает snapshot-чанки и подменяет холст. arepos по-прежнему только проверяет размер **одного** сообщения (DoS) и ретранслирует JSON в STOMP `instances`. Лимит 512 KB на диаграмму не поднимаем и не обходим тихим skip.

**Tech Stack:** Vue 3 / TypeScript / Vitest (warchi); Kotlin / Spring / MockMvc (arepos-server). papirus не трогаем.

---

## Правила выполнения

- Одна ветка в **warchi** и **arepos-server**: `feat/diagram-live-deltas`. papirus не менять.
- Не смешивать с `fix/chrome-accelerated-canvas-blank`.
- Каждый task: failing test → implement → прогон указанных тестов → commit (когда выполняете план; не коммитить этот файл заранее без запроса).
- Не поднимать `MAX_LIVE_PAYLOAD_BYTES` и не увеличивать STOMP/WebSocket message size. Нарезка пакетов должна укладываться в текущие 512 KB.

## Зафиксированные решения (не открывать заново)

- **Не слать live, если зрителей нет.** Pointer тоже не слать без зрителей.
- **Патч**, когда список зрителей не менялся: только `upsert*` / `remove*`.
- **Snapshot чанками**, когда в `diagram_spectators` появляется **новый** `userId` (не на каждый ping). Существующие зрители просто получают идемпотентную подмену.
- Конверт живёт в поле STOMP `instances` (как сейчас тело POST). Старый формат `{ nodes, edges }` без `kind` — полная подмена (совместимость на время выката).
- `seq` — монотонный счётчик на стороне lock holder, общий для всех чанков одного flush.
- Клиентский skip «если JSON > 512 KB — молчать» и блок после 413 **удалить**. Вместо этого резать пакет. Если один instance сам больше 512 KB (аномалия) — отправить его одним POST; 413 тогда честный, не нормальный путь HugePan.
- Равенство instance: `JSON.stringify` целого объекта. Не писать глубокий custom-equal.
- Транспортный бюджет чанка: `LIVE_CHUNK_MAX_BYTES = 400 * 1024` (запас под обёртку STOMP до 512 KB).

## Контракт конверта

```ts
type DiagramLiveEnvelope = {
  v: 1
  kind: 'patch' | 'snapshot-chunk'
  seq: number
  upsertNodes?: DiagramNodeInstance[]
  upsertEdges?: DiagramEdgeInstance[]
  removeNodeIds?: string[]
  removeEdgeIds?: string[]
  chunkIndex?: number
  chunkCount?: number
}
```

- `kind: 'patch'` — зритель мержит в текущие instances.
- `kind: 'snapshot-chunk'` — зритель буферит по `seq`+`chunkIndex`; когда все чанки на месте, **заменяет** `instances` на конкатенацию `upsertNodes` / `upsertEdges` (порядок чанков). `remove*` в snapshot пустые.

Legacy: если `instances.nodes` и `instances.edges` — массивы и нет `kind` → полная подмена, как сейчас.

## Карта файлов

**Новые (warchi):**

- `src/features/models/utils/diagramLivePayload.ts` — типы, diff, empty-check, chunk
- `src/features/models/utils/diagramLivePayload.test.ts`
- `src/features/models/utils/applyDiagramLiveMessage.ts` — apply legacy / patch / snapshot buffer
- `src/features/models/utils/applyDiagramLiveMessage.test.ts`

**Изменить (warchi):**

- `src/features/models/composables/useDiagramRealtimeCollab.ts` — flush дельтами/чанками, snapshot на newcomer, не слать без зрителей, убрать skip/413-block
- `src/features/models/composables/useDiagramRealtimeCollab.test.ts`

**Изменить (arepos-server):**

- `src/test/kotlin/ru/kavader/arepos/controller/DiagramEditLocksControllerTest.kt` — 413 на oversized; 200 на patch-конверт при lock
- `docs/api-collaboration.md` — описать конверт и 413 как лимит **сообщения**

**Не менять:** `DiagramCollaborationService.MAX_LIVE_PAYLOAD_BYTES`, `ModelSyncBroadcaster.broadcastDiagramLive` (поле `instances` остаётся телом POST).

---

### Task 0: Ветки

- [ ] **Step 1: Ветка в warchi и arepos-server**

```bash
cd /Users/nikolaygroznyh/Work/warchi && git checkout -b feat/diagram-live-deltas
cd /Users/nikolaygroznyh/Work/arepos-server && git checkout -b feat/diagram-live-deltas
```

papirus не переключать.

---

### Task 1: Diff instances

**Files:**

- Create: `src/features/models/utils/diagramLivePayload.ts`
- Test: `src/features/models/utils/diagramLivePayload.test.ts`

- [ ] **Step 1: Написать падающие тесты**

```ts
import { describe, expect, it } from 'vitest'
import { diffDiagramInstances, isEmptyLivePatch } from './diagramLivePayload'
import type { DiagramNodeInstance, DiagramEdgeInstance } from '../modelAttrs'

const node = (id: string, x: number): DiagramNodeInstance => ({
  id,
  modelNodeId: `m-${id}`,
  x,
  y: 0,
})
const edge = (id: string): DiagramEdgeInstance => ({
  id,
  modelLinkId: `l-${id}`,
  sourceInstanceId: 'a',
  targetInstanceId: 'b',
})

describe('diffDiagramInstances', () => {
  it('returns empty patch when snapshots match', () => {
    const snap = { nodes: [node('n1', 1)], edges: [edge('e1')] }
    const patch = diffDiagramInstances(snap, structuredClone(snap))
    expect(isEmptyLivePatch(patch)).toBe(true)
  })

  it('upserts changed and added instances and lists removals', () => {
    const previous = { nodes: [node('n1', 1), node('gone', 0)], edges: [edge('e1')] }
    const next = { nodes: [node('n1', 9), node('n2', 2)], edges: [edge('e2')] }
    expect(diffDiagramInstances(previous, next)).toEqual({
      upsertNodes: [node('n1', 9), node('n2', 2)],
      upsertEdges: [edge('e2')],
      removeNodeIds: ['gone'],
      removeEdgeIds: ['e1'],
    })
  })
})
```

- [ ] **Step 2: Прогнать тест — должен упасть**

```bash
cd /Users/nikolaygroznyh/Work/warchi && npx vitest run src/features/models/utils/diagramLivePayload.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Минимальная реализация**

В `diagramLivePayload.ts`:

```ts
import type { DiagramEdgeInstance, DiagramNodeInstance } from '../modelAttrs'

export const LIVE_CHUNK_MAX_BYTES = 400 * 1024

export type DiagramInstances = {
  nodes: DiagramNodeInstance[]
  edges: DiagramEdgeInstance[]
}

export type DiagramLiveEnvelope = {
  v: 1
  kind: 'patch' | 'snapshot-chunk'
  seq: number
  upsertNodes?: DiagramNodeInstance[]
  upsertEdges?: DiagramEdgeInstance[]
  removeNodeIds?: string[]
  removeEdgeIds?: string[]
  chunkIndex?: number
  chunkCount?: number
}

export type DiagramLivePatch = {
  upsertNodes: DiagramNodeInstance[]
  upsertEdges: DiagramEdgeInstance[]
  removeNodeIds: string[]
  removeEdgeIds: string[]
}

const instanceKey = (item: { id: string }): string => item.id
const fingerprint = (item: unknown): string => JSON.stringify(item)

export function isEmptyLivePatch(patch: DiagramLivePatch): boolean {
  return (
    patch.upsertNodes.length === 0 &&
    patch.upsertEdges.length === 0 &&
    patch.removeNodeIds.length === 0 &&
    patch.removeEdgeIds.length === 0
  )
}

export function diffDiagramInstances(
  previous: DiagramInstances,
  next: DiagramInstances
): DiagramLivePatch {
  const prevNodes = new Map(previous.nodes.map(n => [instanceKey(n), n]))
  const prevEdges = new Map(previous.edges.map(e => [instanceKey(e), e]))
  const nextNodeIds = new Set(next.nodes.map(instanceKey))
  const nextEdgeIds = new Set(next.edges.map(instanceKey))

  const upsertNodes = next.nodes.filter(n => {
    const prev = prevNodes.get(n.id)
    return !prev || fingerprint(prev) !== fingerprint(n)
  })
  const upsertEdges = next.edges.filter(e => {
    const prev = prevEdges.get(e.id)
    return !prev || fingerprint(prev) !== fingerprint(e)
  })
  const removeNodeIds = [...prevNodes.keys()].filter(id => !nextNodeIds.has(id))
  const removeEdgeIds = [...prevEdges.keys()].filter(id => !nextEdgeIds.has(id))
  return { upsertNodes, upsertEdges, removeNodeIds, removeEdgeIds }
}

export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length
}
```

`chunkLiveEnvelope` в этом task не экспортировать, если тестов на него ещё нет — добавите в Task 2.

- [ ] **Step 4: Прогнать тесты — должны пройти**

```bash
cd /Users/nikolaygroznyh/Work/warchi && npx vitest run src/features/models/utils/diagramLivePayload.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/models/utils/diagramLivePayload.ts src/features/models/utils/diagramLivePayload.test.ts
git commit -m "$(cat <<'EOF'
feat: diff diagram instances for live patches

EOF
)"
```

---

### Task 2: Нарезка конверта на чанки

**Files:**

- Modify: `src/features/models/utils/diagramLivePayload.ts`
- Modify: `src/features/models/utils/diagramLivePayload.test.ts`

- [ ] **Step 1: Падающие тесты чанков**

Добавить в тот же test-файл:

```ts
import { chunkLiveEnvelope, LIVE_CHUNK_MAX_BYTES } from './diagramLivePayload'

describe('chunkLiveEnvelope', () => {
  it('keeps a small patch as a single envelope', () => {
    const chunks = chunkLiveEnvelope({
      v: 1,
      kind: 'patch',
      seq: 3,
      upsertNodes: [node('n1', 1)],
      upsertEdges: [],
      removeNodeIds: ['gone'],
      removeEdgeIds: [],
    }, 4_000)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toMatchObject({ kind: 'patch', seq: 3, chunkIndex: 0, chunkCount: 1 })
    expect(chunks[0]?.removeNodeIds).toEqual(['gone'])
  })

  it('splits upserts so each packet stays under the byte budget', () => {
    const upsertNodes = Array.from({ length: 40 }, (_, i) =>
      node(`n-${String(i).padStart(3, '0')}`, i)
    )
    const chunks = chunkLiveEnvelope({
      v: 1,
      kind: 'snapshot-chunk',
      seq: 1,
      upsertNodes,
      upsertEdges: [],
      removeNodeIds: [],
      removeEdgeIds: [],
    }, 800)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every(c => utf8ByteLength(JSON.stringify(c)) <= 800)).toBe(true)
    expect(chunks.every(c => c.chunkCount === chunks.length)).toBe(true)
    expect(chunks.map(c => c.chunkIndex)).toEqual(chunks.map((_, i) => i))
    expect(chunks.flatMap(c => c.upsertNodes ?? [])).toHaveLength(40)
  })
})
```

Импортировать `utf8ByteLength` из того же модуля.

- [ ] **Step 2: Прогнать — FAIL на `chunkLiveEnvelope`**

```bash
cd /Users/nikolaygroznyh/Work/warchi && npx vitest run src/features/models/utils/diagramLivePayload.test.ts
```

- [ ] **Step 3: Реализация `chunkLiveEnvelope`**

Алгоритм:

1. `removes` (`removeNodeIds` / `removeEdgeIds`) класть только в **первый** чанк.
2. Кормить `upsertNodes` затем `upsertEdges` по одному. Кандидат чанка сериализовать; если `utf8ByteLength > maxBytes` и в чанке уже есть upsert — закрыть чанк и начать новый с этим элементом.
3. Если один элемент сам не влезает — отдельный чанк только с ним (аномалия; не дропать).
4. Проставить `chunkIndex` / `chunkCount`, сохранить `v`, `kind`, `seq`.
5. Пустой патч (нет upsert и remove) → `[]`.

Не использовать `LIVE_CHUNK_MAX_BYTES` внутри функции как единственный аргумент: тесты передают свой `maxBytes`. В проде вызывать `chunkLiveEnvelope(env, LIVE_CHUNK_MAX_BYTES)`.

- [ ] **Step 4: Тесты PASS**

```bash
cd /Users/nikolaygroznyh/Work/warchi && npx vitest run src/features/models/utils/diagramLivePayload.test.ts
```

- [ ] **Step 5: Commit**

```bash
git commit -am "$(cat <<'EOF'
feat: chunk live envelopes under transport budget

EOF
)"
```

---

### Task 3: Применение live-сообщения у зрителя

**Files:**

- Create: `src/features/models/utils/applyDiagramLiveMessage.ts`
- Test: `src/features/models/utils/applyDiagramLiveMessage.test.ts`

- [ ] **Step 1: Падающие тесты**

```ts
import { describe, expect, it } from 'vitest'
import { applyDiagramLiveMessage, createLiveSnapshotBuffer } from './applyDiagramLiveMessage'
import type { DiagramLiveEnvelope } from './diagramLivePayload'
import type { DiagramEdgeInstance, DiagramNodeInstance } from '../modelAttrs'

const node = (id: string, x: number): DiagramNodeInstance => ({
  id,
  modelNodeId: `m-${id}`,
  x,
  y: 0,
})
const edge = (id: string): DiagramEdgeInstance => ({
  id,
  modelLinkId: `l-${id}`,
  sourceInstanceId: 'a',
  targetInstanceId: 'b',
})

describe('applyDiagramLiveMessage', () => {
  it('replaces instances for legacy { nodes, edges }', () => {
    const current = { nodes: [node('old', 0)], edges: [] }
    const next = applyDiagramLiveMessage(
      current,
      { nodes: [node('n1', 1)], edges: [edge('e1')] },
      createLiveSnapshotBuffer()
    )
    expect(next?.nodes).toEqual([node('n1', 1)])
    expect(next?.edges).toEqual([edge('e1')])
  })

  it('merges a patch onto current instances', () => {
    const current = { nodes: [node('n1', 1), node('gone', 0)], edges: [edge('e1')] }
    const envelope: DiagramLiveEnvelope = {
      v: 1,
      kind: 'patch',
      seq: 2,
      upsertNodes: [node('n1', 9)],
      removeNodeIds: ['gone'],
      upsertEdges: [edge('e2')],
      removeEdgeIds: ['e1'],
    }
    const next = applyDiagramLiveMessage(current, envelope, createLiveSnapshotBuffer())
    expect(next?.nodes.map(n => n.id).sort()).toEqual(['n1'])
    expect(next?.nodes[0]?.x).toBe(9)
    expect(next?.edges.map(e => e.id)).toEqual(['e2'])
  })

  it('replaces only after all snapshot chunks arrive', () => {
    const current = { nodes: [node('stale', 0)], edges: [] }
    const buffer = createLiveSnapshotBuffer()
    const chunk0: DiagramLiveEnvelope = {
      v: 1,
      kind: 'snapshot-chunk',
      seq: 7,
      chunkIndex: 0,
      chunkCount: 2,
      upsertNodes: [node('n1', 1)],
    }
    const chunk1: DiagramLiveEnvelope = {
      v: 1,
      kind: 'snapshot-chunk',
      seq: 7,
      chunkIndex: 1,
      chunkCount: 2,
      upsertEdges: [edge('e1')],
    }
    expect(applyDiagramLiveMessage(current, chunk0, buffer)).toBeNull()
    const next = applyDiagramLiveMessage(current, chunk1, buffer)
    expect(next).toEqual({ nodes: [node('n1', 1)], edges: [edge('e1')] })
  })

  it('drops a previous incomplete snapshot when seq changes', () => {
    const current = { nodes: [node('keep', 0)], edges: [] }
    const buffer = createLiveSnapshotBuffer()
    applyDiagramLiveMessage(
      current,
      { v: 1, kind: 'snapshot-chunk', seq: 1, chunkIndex: 0, chunkCount: 2, upsertNodes: [node('a', 1)] },
      buffer
    )
    const next = applyDiagramLiveMessage(
      current,
      { v: 1, kind: 'snapshot-chunk', seq: 2, chunkIndex: 0, chunkCount: 1, upsertNodes: [node('b', 2)] },
      buffer
    )
    expect(next).toEqual({ nodes: [node('b', 2)], edges: [] })
  })
})
```

- [ ] **Step 2: Прогнать — FAIL**

```bash
cd /Users/nikolaygroznyh/Work/warchi && npx vitest run src/features/models/utils/applyDiagramLiveMessage.test.ts
```

- [ ] **Step 3: Реализация**

`createLiveSnapshotBuffer()` возвращает объект `{ seq: number | null, chunks: Map<number, DiagramLiveEnvelope> }`.

`applyDiagramLiveMessage(current, raw, buffer)`:

- не record → `null`;
- есть `kind` `patch` → применить upsert/remove к копии `current`, вернуть новый `{ nodes, edges }`;
- есть `kind` `snapshot-chunk` → если `seq !== buffer.seq`, очистить `chunks` и запомнить seq; положить чанк по `chunkIndex`; если `chunks.size === chunkCount` — собрать nodes/edges в порядке `chunkIndex`, очистить buffer, вернуть replace; иначе `null`;
- иначе если `raw.nodes` и `raw.edges` массивы — legacy replace;
- иначе `null`.

Upsert: заменить по `id` или добавить в конец. Remove: выкинуть по id.

- [ ] **Step 4: PASS**

```bash
cd /Users/nikolaygroznyh/Work/warchi && npx vitest run src/features/models/utils/applyDiagramLiveMessage.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/features/models/utils/applyDiagramLiveMessage.ts src/features/models/utils/applyDiagramLiveMessage.test.ts
git commit -m "$(cat <<'EOF'
feat: apply live patch and snapshot chunks

EOF
)"
```

---

### Task 4: Lock holder шлёт дельты и snapshot, не полный холст

**Files:**

- Modify: `src/features/models/composables/useDiagramRealtimeCollab.ts`
- Modify: `src/features/models/composables/useDiagramRealtimeCollab.test.ts`

- [ ] **Step 1: Заменить/добавить тесты collab**

Удалить тесты:

- `does not post live instances that exceed the server 512 KB limit`
- `stops live posts for the diagram after the server rejects with 413`

Добавить (имена зафиксировать):

1. `does not post live or pointer when there are no spectators`
   - lock holder, `flushLivePushNow()` и `onCanvasMouseMoveForPointer` → `apiPost` не вызывается для `/live` и `/pointer`.
2. `posts a patch of changed instances after a spectator is present`
   - сначала `handleModelTopicBroadcast({ type: 'diagram_spectators', diagramId: 'diagram-1', viewers: [{ userId: 'u2', displayName: 'B' }] })` — это вызовет snapshot (см. ниже);
   - затем изменить один node `x`;
   - `flushLivePushNow()`;
   - последний `apiPost` на `/live` имеет `kind: 'patch'` и `upsertNodes` только с этим node, **без** полного массива edges.
3. `sends snapshot chunks when a new spectator appears`
   - набить `instances` так, чтобы один чанк при бюджете 400 KB не обязателен (достаточно проверить `kind: 'snapshot-chunk'` и что ушло не `{ nodes, edges }` legacy);
   - broadcast viewers `[{ userId: 'u2', ... }]`;
   - `apiPost` на `/live` с `kind: 'snapshot-chunk'`, `seq` задан, `upsertNodes`/`upsertEdges` покрывают текущие instances.
4. `does not snapshot again when the same spectator list is rebroadcast`
   - после шага 3 очистить mock calls;
   - повторный `diagram_spectators` с тем же `userId`;
   - новых `/live` нет.
5. `applies a remote patch for spectators` — вместо/рядом с текущим `applies remote diagram live instances`:
   - прислать envelope `kind: 'patch'`;
   - локальные instances смержены, не затёрты целиком, если патч частичный.
6. Оставить legacy-тест полной подмены `{ nodes, edges }` — старый сервер/клиент на выкате.

Для теста 2 snapshot при первом viewer сбросит `lastSent` в текущий снимок **после успешных POST**. Поэтому правка после snapshot должна дать маленький patch. В тесте мок `apiPost` сразу `success: true`.

Pointer: в `beforeEach` `vi.setSystemTime` не обязателен, если в тесте 1 зрителей нет — pointer не должен уходить независимо от throttle.

- [ ] **Step 2: Прогнать — FAIL**

```bash
cd /Users/nikolaygroznyh/Work/warchi && npx vitest run src/features/models/composables/useDiagramRealtimeCollab.test.ts
```

- [ ] **Step 3: Переписать flush / spectator / apply**

В `useDiagramRealtimeCollab.ts`:

- Удалить `LIVE_PAYLOAD_MAX_BYTES`, локальный `utf8ByteLength`, `livePushBlockedDiagramId`.
- Держать `let lastSentInstances: DiagramInstances | null = null` и `let liveSeq = 0`.
- `createLiveSnapshotBuffer()` на уровне composable для входящих snapshot.
- `hasSpectators`: `diagramSpectators.value.length > 0`.
- `postLiveChunks(kind, patchOrFull)`:
  - для `patch`: `chunkLiveEnvelope({ v: 1, kind: 'patch', seq, ...patch }, LIVE_CHUNK_MAX_BYTES)`;
  - для snapshot: собрать `{ upsertNodes: all nodes, upsertEdges: all edges, remove*: [] }`, `kind: 'snapshot-chunk'`, тот же `seq`, chunk;
  - `for (const chunk of chunks) await apiPost(\`/diagram-locks/${id}/live\`, chunk)`;
  - если любой chunk `!success` — **не** обновлять `lastSentInstances`, выйти;
  - если все success — `lastSentInstances = structuredClone(current instances)`.
- `flushLivePushNow`:
  - нет lock / hidden / нет диаграммы / нет зрителей → return;
  - `previous = lastSentInstances ?? { nodes: [], edges: [] }`;
  - `patch = diffDiagramInstances(previous, current)`;
  - empty → return;
  - `postLiveChunks('patch', patch)`.
  - Пустой `lastSent` при уже существующих зрителях (рефреш страницы lock holder) даст большой patch ≈ snapshot; chunking это переживёт. Не делать отдельный путь.
- `handleModelTopicBroadcast` `diagram_spectators`:
  - посчитать newcomers относительно предыдущего `diagramSpectators.value` **до** записи нового списка;
  - записать список;
  - если lock holder и есть хотя бы один новый `userId` — `void` snapshot flush (не patch).
- `diagram_live`: `applyDiagramLiveMessage` вместо ручного replace; если вернулся `null` — не трогать state; иначе как сейчас записать `structuredClone(next)` (apply уже может вернуть новые массивы).
- Pointer: в начале `onCanvasMouseMoveForPointer` / `onCanvasMouseLeaveForPointer` return, если нет зрителей.
- Сброс `lastSentInstances = null` при смене `selectedDiagramId` или потере lock.

Не слать snapshot из `flushLivePushNow` по watch instances — только patch.

- [ ] **Step 4: PASS**

```bash
cd /Users/nikolaygroznyh/Work/warchi && npx vitest run \
  src/features/models/composables/useDiagramRealtimeCollab.test.ts \
  src/features/models/utils/diagramLivePayload.test.ts \
  src/features/models/utils/applyDiagramLiveMessage.test.ts
```

- [ ] **Step 5: Commit**

```bash
git commit -am "$(cat <<'EOF'
feat: relay diagram live as patches and snapshot chunks

EOF
)"
```

---

### Task 5: arepos — 413 только на одно сообщение, patch принимается

**Files:**

- Modify: `/Users/nikolaygroznyh/Work/arepos-server/src/test/kotlin/ru/kavader/arepos/controller/DiagramEditLocksControllerTest.kt`
- Modify: `/Users/nikolaygroznyh/Work/arepos-server/docs/api-collaboration.md`

Код `relayLive` не менять, если тесты проходят на текущем лимите. Не поднимать `MAX_LIVE_PAYLOAD_BYTES`.

- [ ] **Step 1: Тесты контроллера**

Добавить в `DiagramEditLocksControllerTest`:

1. `live patch envelope from lock holder returns 200`
   - acquire lock;
   - POST `/live` body:

```json
{
  "v": 1,
  "kind": "patch",
  "seq": 1,
  "upsertNodes": [{ "id": "n1", "modelNodeId": "00000000-0000-0000-0000-000000000001", "x": 1, "y": 2 }],
  "upsertEdges": [],
  "removeNodeIds": [],
  "removeEdgeIds": []
}
```

   - status 200.

2. `live payload larger than 512 KB returns 413`
   - acquire lock;
   - body — JSON объект с полем `pad` из строки длиной `512 * 1024 + 64` (через ` "x".repeat(...) ` в Kotlin);
   - status 413, reason/message содержит `instances payload too large` (как бросает `ResponseStatusException`).

Подсмотреть `createDiagramFixture` + `withAuth` у соседнего `live update without active lock`.

- [ ] **Step 2: Прогнать — 413-тест должен PASS уже сейчас; patch-тест тоже, сервер не валидирует форму**

```bash
cd /Users/nikolaygroznyh/Work/arepos-server && ./gradlew test --tests "ru.kavader.arepos.controller.DiagramEditLocksControllerTest"
```

Если 413-теста нет и поведение уже такое — тест фиксирует контракт. Если 413 не воспроизводится (Jackson стримит иначе) — слать массив из ~20k uuid-строк, пока `writeValueAsBytes` > 512 KB.

- [ ] **Step 3: Документация**

В `docs/api-collaboration.md` у строки `POST /{diagramId}/live` заменить note на:

- тело — JSON-конверт wArchi (`v=1`, `kind=patch|snapshot-chunk`, `seq`, upsert/remove, опционально `chunkIndex`/`chunkCount`) **или** legacy `{ nodes, edges }`;
- HTTP **413**, если **одно** тело > 512 KB (`instances payload too large`); это лимит сообщения, не размер диаграммы — клиент режет чанки;
- сервер не интерпретирует конверт, только lock + broadcast в `instances`.

- [ ] **Step 4: Commit в arepos-server**

```bash
git add src/test/kotlin/ru/kavader/arepos/controller/DiagramEditLocksControllerTest.kt docs/api-collaboration.md
git commit -m "$(cat <<'EOF'
test: lock live accepts patches and rejects oversized messages

EOF
)"
```

---

### Task 6: Регрессия соседних тестов

- [ ] **Step 1: warchi**

```bash
cd /Users/nikolaygroznyh/Work/warchi && npx vitest run \
  src/features/models/composables/useDiagramRealtimeCollab.test.ts \
  src/features/models/composables/useModelEditorSync.test.ts \
  src/features/models/utils/diagramLivePayload.test.ts \
  src/features/models/utils/applyDiagramLiveMessage.test.ts
```

Expected: PASS.

- [ ] **Step 2: arepos**

```bash
cd /Users/nikolaygroznyh/Work/arepos-server && ./gradlew test --tests "ru.kavader.arepos.controller.DiagramEditLocksControllerTest"
```

Expected: PASS.

---

## Проверка вручную

1. Два браузера, одна диаграмма: A держит lock, B зритель.
2. A двигает один узел — в Network `/live` маленький `kind: patch`, у B узел едет.
3. Открыть HugePan (~160 узлов / ~4000 рёбер): A lock, B заходит зрителем — несколько `/live` `snapshot-chunk`, без 413, B видит актуальный холст (включая несохранённое).
4. Pan/zoom без изменения instances — новых `/live` нет (watch не должен слать empty patch).
5. A один на диаграмме — `/live` и `/pointer` не уходят.

---

## Вне скоупа

- Поднятие 512 KB / WebSocket message size.
- Сжатие (gzip) live.
- Дельты на уровне полей (`x`/`y` без attrs).
- papirus, MCP, batch-save.
- Не слать live на pan, если pan всё же пишет instances — это отдельный баг холста; diff тогда всё равно будет пустой, если координаты instance не менялись.
