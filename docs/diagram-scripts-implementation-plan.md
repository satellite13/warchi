# Diagram Scripts Apply Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Диаграммные скрипты работают на снимке открытого холста, умеют искать в модели через REST и копить команды; запись на холст — только после превью, одной history-транзакцией.

**Architecture:** Тот же iframe (`sandbox=allow-scripts`). Хост отдаёт узкий snapshot, отвечает на `query` RPC и после `done` показывает issue + очередь `apply`. Перед записью хост резолвит ноды/связи в partial store, затем **одним** `DiagramHistoryCommand` мутирует `diagram.parsedAttrs.instances` (не вызывает `addExistingNodeToDiagram` / `placeTraceLinkOnDiagram` — у них свой history и silent no-op). Граф модели не меняется. arepos-server не трогаем.

**Tech Stack:** Vue 3 / TypeScript / Vitest; iframe postMessage; уже существующие `modelScopedApi` и papirus AlignDistribute.

**Design:** `docs/diagram-scripts-design.md`

---

## Правила выполнения

- Ветка только в `warchi`: `feat/diagram-scripts-apply`. arepos-server и papirus не менять (кроме импорта уже экспортированных `alignNodes` / `distributeNodes`).
- Не смешивать с `feat/model-validation-report` и `docs/model-validation-report-implementation-plan.md`.
- Убрать полный detached snapshot для запуска скриптов (`prepareValidationScriptRun` / `useDetachedModelSnapshot` на этом пути).
- Каждый task: failing test → implement → `npx vitest run <файлы>` → commit.
- Скрипт не вызывает `fetch`. Query только через postMessage.

## Зафиксированные решения (не открывать заново)

- `apply.addEdge({ linkId })` — только `linkId`. Концы хост берёт из `resolveModelLinks({ linkIds: [linkId] })`.
- `linksBetween(a, b, { linkType? })` возвращает **все** связи между парой (оба направления), затем фильтр типа.
- `neighbors` в скрипт: `{ items, last }` из Spring `Page` (`content` + `last`).
- `searchNodes` требует `q` или `type`; оба пустые → ошибка query, не «все ноды модели».
- `prepareValidationScriptRun` **сузить** до `buildDiagramScriptSnapshot`, `loadOverlayed` не вызывать.
- Apply: сначала `validateCommandQueue`, затем resolve в store, затем одна history-команда. Если диаграмма read-only / lock потерян — ошибка, холст не менять.
- Несколько notation component: взять единственный или уже записанный binding; иначе ошибка команды, **без** модалки выбора.
- Клик по issue — по `modelNodeId` / `modelLinkId`, как сейчас. Kind `instance` не добавляем.

## Карта файлов

**Новые:**

- `src/features/validation-scripts/sandbox/diagramScriptCommands.ts` — типы команд + `validateCommandQueue`
- `src/features/validation-scripts/sandbox/diagramScriptCommands.test.ts`
- `src/features/validation-scripts/sandbox/buildDiagramScriptSnapshot.ts`
- `src/features/validation-scripts/sandbox/buildDiagramScriptSnapshot.test.ts`
- `src/features/validation-scripts/sandbox/diagramScriptQueryHost.ts` — RPC → REST
- `src/features/validation-scripts/sandbox/diagramScriptQueryHost.test.ts`
- `src/features/validation-scripts/sandbox/applyDiagramScriptCommands.ts`
- `src/features/validation-scripts/sandbox/applyDiagramScriptCommands.test.ts`
- `src/features/validation-scripts/sandbox/layoutCommands.ts` — align/distribute/stack → набор setBounds

**Изменить:**

- `src/features/validation-scripts/sandbox/types.ts` — узкий snapshot, `commands` в результате
- `src/features/validation-scripts/sandbox/validationScriptApi.ts` — async API, apply, query stubs
- `src/features/validation-scripts/sandbox/runValidationScript.ts` — iframe query loop
- `src/features/validation-scripts/sandbox/scriptSandboxMain.ts` — async + query postMessage
- `src/features/validation-scripts/validationScriptApiCatalog.ts`
- `src/features/validation-scripts/components/ValidationScriptsRunModal.vue`
- `src/features/models/ModelEditor.vue` — не готовить full snapshot; apply hook
- `src/features/models/composables/prepareValidationScriptRun.ts` — только `buildDiagramScriptSnapshot`, без detached overlay
- `src/i18n/locales/validationScripts.ts`
- `src/features/docs/content/validation-scripts.md` и `.en.md`

---

### Task 0: Ветка

- [ ] **Step 1: Ветка в warchi**

```bash
cd /Users/nikolaygroznyh/Work/warchi && git checkout -b feat/diagram-scripts-apply
```

Не создавать ветку в arepos-server.

---

### Task 1: Типы команд и валидация очереди

**Files:**

- Create: `src/features/validation-scripts/sandbox/diagramScriptCommands.ts`
- Test: `src/features/validation-scripts/sandbox/diagramScriptCommands.test.ts`

- [ ] **Step 1: Падающие тесты**

```ts
it('rejects addEdge when endpoints are not on diagram and not added earlier', () => {
  const result = validateCommandQueue({
    instanceModelNodeIds: new Set(['a']),
    instanceIds: new Set(['ia']),
    edgeIds: new Set(),
    linkEndpoints: { l1: { sourceId: 'a', targetId: 'b' } },
    commands: [
      { type: 'addEdge', linkId: 'l1' },
    ],
  })
  expect(result.ok).toBe(false)
})

it('accepts addInstance then addEdge', () => {
  const result = validateCommandQueue({
    instanceModelNodeIds: new Set(['a']),
    instanceIds: new Set(['ia']),
    edgeIds: new Set(),
    linkEndpoints: { l1: { sourceId: 'a', targetId: 'b' } },
    commands: [
      { type: 'addInstance', nodeId: 'b', x: 0, y: 0 },
      { type: 'addEdge', linkId: 'l1' },
    ],
  })
  expect(result.ok).toBe(true)
})
```

Команда в очереди: `{ type: 'addEdge', linkId }`. Карта `linkEndpoints` в `validateCommandQueue` заполняет **хост** после `resolveModelLinks({ linkIds })`, не скрипт. Песочница в `done` шлёт только `linkId`.

- [ ] **Step 2: `npx vitest run` — FAIL**

```bash
npx vitest run src/features/validation-scripts/sandbox/diagramScriptCommands.test.ts
```

- [ ] **Step 3: Реализовать union команд и `validateCommandQueue`**

```ts
export type DiagramScriptCommand =
  | { type: 'setBounds'; instanceId: string; x: number; y: number; width?: number; height?: number }
  | { type: 'addInstance'; nodeId: string; x?: number; y?: number }
  | { type: 'addEdge'; linkId: string }
  | { type: 'removeInstance'; instanceId: string }
  | { type: 'removeEdge'; edgeInstanceId: string }
  | { type: 'align'; instanceIds: string[]; mode: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom' }
  | { type: 'distribute'; instanceIds: string[]; axis: 'horizontal' | 'vertical' }
  | { type: 'stack'; instanceIds: string[]; mode: 'vertical' | 'overlap' }
```

Симуляция очереди: множество instance/edge обновляется по ходу. `setBounds` / `remove*` / align требуют, чтобы id уже был в множестве (на холсте или добавлен ранее).

- [ ] **Step 4: Тесты зелёные + commit**

```bash
npx vitest run src/features/validation-scripts/sandbox/diagramScriptCommands.test.ts
git commit -m "Add diagram script command queue validation."
```

---

### Task 2: Узкий snapshot открытой диаграммы

**Files:**

- Create: `src/features/validation-scripts/sandbox/buildDiagramScriptSnapshot.ts`
- Test: `src/features/validation-scripts/sandbox/buildDiagramScriptSnapshot.test.ts`
- Modify: `src/features/validation-scripts/sandbox/types.ts`

- [ ] **Step 1: Падающий тест**

Собрать state с 3 нодами, на диаграмме только 1 instance. Snapshot.model.nodes (если поле ещё нужно для хелперов) содержит **только** эту ноду. `ctx.diagram.instances` содержит id/x/y. Ноды вне холста отсутствуют.

```ts
expect(snap.model.nodes.map(n => n.id)).toEqual(['on-canvas'])
expect(snap.diagrams[0]?.instances).toHaveLength(1)
```

- [ ] **Step 2: FAIL, затем реализация**

Расширить `SnapshotDiagram` полями `instances` и `edges` (геометрия). `buildValidationSnapshot` не удалять сразу: новые запуски из редактора перевести на `buildDiagramScriptSnapshot`. Старый builder можно оставить, пока тесты хелперов на полном снимке не переведены — затем удалить вызов из `prepareValidationScriptRun`.

В snapshot `model.nodes` / `model.links` = только сущности с холста. `model.folders` / прочие диаграммы — пустые массивы. `notations` / `types` — только нотация открытой диаграммы и типы этих нод/связей.

- [ ] **Step 3: Commit**

```bash
npx vitest run src/features/validation-scripts/sandbox/buildDiagramScriptSnapshot.test.ts
git commit -m "Build diagram-scoped snapshot for scripts without the full model."
```

---

### Task 3: Query host

**Files:**

- Create: `src/features/validation-scripts/sandbox/diagramScriptQueryHost.ts`
- Test: `src/features/validation-scripts/sandbox/diagramScriptQueryHost.test.ts`

- [ ] **Step 1: Моки `fetchGraphNeighbors`, `searchModelNodes`, `resolveModelLinks`**

```ts
it('neighbors forwards linkType and page', async () => {
  const host = createDiagramScriptQueryHost({ modelId: 'm', fetchNeighbors, search, resolveLinks })
  await host.handle({ method: 'neighbors', args: { nodeId: 'n1', direction: 'outgoing', linkType: 'lt', page: 0 } })
  expect(fetchNeighbors).toHaveBeenCalledWith('m', 'n1', expect.objectContaining({
    direction: 'outgoing',
    linkTypeId: 'lt',
    page: 0,
  }))
})

it('linksBetween uses resolveModelLinks with two endpoint ids', async () => {
  await host.handle({ method: 'linksBetween', args: { a: 'a', b: 'b', linkType: 'lt' } })
  expect(resolveLinks).toHaveBeenCalledWith('m', { endpointNodeIds: ['a', 'b'], linkIds: [] })
})
```

`linksBetween`: `resolveModelLinks({ endpointNodeIds: [a, b], linkIds: [] })`, оставить связи, чьи концы — множество `{a, b}` (оба направления: A→B и B→A). Если задан `linkType` — фильтр по `linkTypeId` или имени типа.

`neighbors` наружу скрипта: `{ items: GraphNeighborResponse[], last: boolean }` (из `Page.content` / `Page.last`).

`searchNodes`: если нет `q` и нет `type` — `{ error: 'q or type required' }`. Иначе `searchModelNodes(modelId, q ?? type, { kinds: ['nodes'], limit: min(limit ?? 50, 50) })` и при наличии `type` фильтр по `nodeTypeId` / `typeName`.

- [ ] **Step 2: Реализация + commit**

```bash
npx vitest run src/features/validation-scripts/sandbox/diagramScriptQueryHost.test.ts
git commit -m "Route diagram script queries through existing model search APIs."
```

Не вызывать `GET /nodes` без id.

---

### Task 4: Async execute + iframe RPC

**Files:**

- Modify: `src/features/validation-scripts/sandbox/validationScriptApi.ts`
- Modify: `src/features/validation-scripts/sandbox/runValidationScript.ts`
- Modify: `src/features/validation-scripts/sandbox/scriptSandboxMain.ts`
- Modify: `src/features/validation-scripts/sandbox/runValidationScript.test.ts`
- Modify: `src/features/validation-scripts/sandbox/validationScriptApi.test.ts`
- Modify: `src/features/validation-scripts/validationScriptApiCatalog.ts`

- [ ] **Step 1: Падающие тесты**

- `executeValidationScript` поддерживает `await neighbors(...)` (in-process: передать fake async query).
- `runValidationScript` возвращает `{ issues, commands }` (iframe и inProcess).
- `apply.addInstance` не меняет snapshot, только очередь.
- Старый синхронный скрипт `report.info('x')` без await всё ещё работает (обёртка async).

```ts
const source = `
const n = await neighbors(ctx.diagram.instances[0].modelNodeId, { direction: 'outgoing' })
apply.addInstance({ nodeId: n[0].node.id, x: 10, y: 10 })
`
```

- [ ] **Step 2: Протокол**

Песочница:

```ts
async function queryRpc(method, args) {
  const id = crypto.randomUUID()
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    parent.postMessage({ type: 'query', requestId: runId, queryId: id, method, args }, '*')
  })
}
```

Хост в `runInIframe`: на `query` вызвать `diagramScriptQueryHost.handle`, ответить `queryResult`. На `done` — issues + commands.

`executeValidationScript` оборачивает source:

```ts
const fn = new Function(
  ...names,
  `"use strict"; return (async () => { ${trimmed} })()`
)
await fn(...)
```

`new Function` + async IIFE. In-process query — опция `query?: QueryFn` в тестах.

Timeout: как сейчас, на весь прогон; при timeout не принимать поздний `done`.

Каталог: добавить `neighbors`, `searchNodes`, `linksBetween`, `apply` и методы apply.

Старый `linksBetween` хелпер на снимке **переименовать конфликт**: spec даёт query `linksBetween` по модели. Хелпер снимка больше не нужен для полного графа — оставить имя для query RPC. Локальный хелпер по холсту назвать не надо: query покрывает кейс. Удалить snapshot-`linksBetween` из top-level, чтобы не путать (обновить golden-тесты).

- [ ] **Step 3: Тесты + commit**

```bash
npx vitest run src/features/validation-scripts
git commit -m "Run diagram scripts asynchronously with query RPC and apply queue."
```

---

### Task 5: Убрать full-model prepare из редактора

**Files:**

- Modify: `src/features/models/ModelEditor.vue`
- Modify: `src/features/models/composables/prepareValidationScriptRun.ts`
- Modify: `src/features/validation-scripts/components/ValidationScriptsRunModal.vue`
- Test: `src/features/models/composables/prepareValidationScriptRun.ts` тесты, если есть; иначе новые

- [ ] **Step 1: Падающий тест prepare**

`prepareValidationScriptRun` вызывает только `buildDiagramScriptSnapshot` из текущего `state` и `openDiagramId`. `loadOverlayed` / detached snapshot на этом пути не использовать. Если диаграмма не открыта — `{ ok: false }`. Instance открытой диаграммы Stage 3 уже держит в editor state.

- [ ] **Step 2: Редактор**

Удалить `scriptsDetachedSnapshot` / `isPreparingScripts` full-load на пути скриптов. Открытие модалки — сразу, без прогресса «готовим всю модель».

Модалка: `canRun` = выбран скрипт **и** `openDiagramId != null`. Текст `t('validationScripts.runNeedsDiagram')`.

- [ ] **Step 3: Commit**

```bash
npx vitest run src/features/models/composables src/features/validation-scripts
git commit -m "Stop loading the full model before running a diagram script."
```

---

### Task 6: Превью в модалке

**Files:**

- Modify: `src/features/validation-scripts/components/ValidationScriptsRunModal.vue`
- Modify: `src/i18n/locales/validationScripts.ts`
- Test: компонент-тест модалки или unit сводки команд

- [ ] **Step 1: Сводка**

```ts
export function summarizeCommands(commands: DiagramScriptCommand[]): {
  addNodes: number
  addEdges: number
  remove: number
  layout: number
}
```

`layout` = setBounds + align + distribute + stack.

- [ ] **Step 2: UI**

После run: issue list как сейчас. Если `commands.length` и `canEdit` — блок сводки + кнопка Apply. Emit `apply-commands` с очередью. Закрыть без emit — холст не менять.

Без `canEdit` — issue видны, Apply нет.

Timeout / error — issue и commands не показывать (spec).

- [ ] **Step 3: i18n ru+en** + commit

```bash
npx vitest run src/features/validation-scripts
git commit -m "Show apply preview after a diagram script run."
```

Проп `canEdit` передать из `ModelEditor` (`canEditModel`).

---

### Task 7: align / distribute / stack → bounds

**Files:**

- Create: `src/features/validation-scripts/sandbox/layoutCommands.ts`
- Test: `src/features/validation-scripts/sandbox/layoutCommands.test.ts`

- [ ] **Step 1: Тест**

Два instance `{x:0,y:0,w:10,h:10}`, `{x:50,y:20,w:10,h:10}`. `align left` → оба x=0. `distribute horizontal` — как papirus `distributeNodes` (портировать арифметику на plain `{x,y,width,height}`, не тащить papirus Node в unit-тест, либо импортировать `alignNodes` с тонкими адаптерами).

`stack vertical` v1: упаковать по Y с зазором 8px, X = min X. `stack overlap` — те же x/y (друг на друга). Не создавать контейнеры.

- [ ] **Step 2: Встроить в validate + apply**

`align`/`distribute`/`stack` в `validateCommandQueue` проверяют, что все `instanceIds` известны. `apply` сначала считает новые bounds, потом `setBounds`.

- [ ] **Step 3: Commit**

```bash
npx vitest run src/features/validation-scripts/sandbox/layoutCommands.test.ts
git commit -m "Expand diagram script layout commands via existing align math."
```

---

### Task 8: Применить команды одной history-транзакцией

**Files:**

- Create: `src/features/validation-scripts/sandbox/applyDiagramScriptCommands.ts`
- Test: `src/features/validation-scripts/sandbox/applyDiagramScriptCommands.test.ts`
- Modify: `src/features/models/ModelEditor.vue`

- [ ] **Step 1: Падающие тесты apply**

Одна `executeHistory` на всю очередь. `addExistingNodeToDiagram` / `placeTraceLinkOnDiagram` в тестах **не** мокаются и не вызываются.

```ts
it('pushes instances and edges in one history command', () => {
  const history: DiagramHistoryCommand[] = []
  applyDiagramScriptCommands({
    diagram,
    commands: [
      { type: 'addInstance', nodeId: 'n2', x: 1, y: 2 },
      { type: 'addEdge', linkId: 'l1' },
    ],
    linkEndpoints: { l1: { sourceId: 'n1', targetId: 'n2' } },
    executeHistory: cmd => history.push(cmd),
  })
  expect(history).toHaveLength(1)
  history[0]!.execute()
  expect(diagram.parsedAttrs.instances.nodes.some(n => n.modelNodeId === 'n2')).toBe(true)
  expect(diagram.parsedAttrs.instances.edges.some(e => e.modelLinkId === 'l1')).toBe(true)
  history[0]!.undo()
  expect(diagram.parsedAttrs.instances.nodes.some(n => n.modelNodeId === 'n2')).toBe(false)
})
```

- [ ] **Step 2: Хост перед apply (ModelEditor)**

1. Если `isDiagramReadOnly` — ошибка, не вызывать apply.
2. Собрать id из `addInstance` / `addEdge`. `resolveModelNodes` + `resolveModelLinks({ linkIds })`. Отсутствующие id → ошибка превью, холст не менять. Положить найденные сущности в partial store (тот же merge, что diagram scope / `resolve` в редакторе).
3. Построить `linkEndpoints` из resolved links.
4. `validateCommandQueue`.
5. Notation: для каждой add-ноды ровно один совместимый component **или** уже есть binding. Иначе ошибка, без модалки.
6. `executeDiagramHistoryCommand` один раз: внутри мутировать `parsedAttrs.instances` (push node/edge, splice remove, присвоить x/y/width/height). `align`/`distribute`/`stack` сначала прогнать через `layoutCommands` → набор setBounds, затем применить. `markDiagramDirty` + `onDiagramInstancesChanged`.
7. Remove instance: логика как `removeNodesFromCurrentDiagramByInstances` (снять фигуру и инцидентные edge instance), но **внутри** этой же history-команды, не отдельным вызовом с собственным undo.

Не создавать ноды/связи в `state.nodes` / `state.links` кроме merge уже существующих с сервера.

- [ ] **Step 3: Модалка `@apply-commands` → этот пайплайн. Тесты + commit**

```bash
npx vitest run src/features/validation-scripts/sandbox/applyDiagramScriptCommands.test.ts src/features/validation-scripts/sandbox/layoutCommands.test.ts
git commit -m "Apply diagram script commands in one undoable history transaction."
```

---

### Task 9: Справка и каталог

**Files:**

- Modify: `src/features/docs/content/validation-scripts.md`
- Modify: `src/features/docs/content/validation-scripts.en.md`
- Modify: `src/features/validation-scripts/validationScriptApiHelp.ts` и тесты help, если есть

- [ ] **Step 1: Переписать help**

Убрать «скрипт только репортит» и «снимок всей модели». Три примера:

1. нет Location на холсте → `report.error`;
2. `apply.align` / `apply.distribute`;
3. `const ns = await neighbors(id, { linkType: '...' })` + `apply.addInstance`.

Явно: дерево не выгружается и не меняется. `apply.addEdge({ linkId })` — только id связи модели.

- [ ] **Step 2: Commit**

```bash
npx vitest run src/features/validation-scripts/validationScriptApiHelp.test.ts src/features/validation-scripts/validationScriptApiCatalog.test.ts
git commit -m "Document diagram script query and apply APIs in help."
```

---

## Порядок

```
Task 0 ветка
  → Task 1 команды
  → Task 2 snapshot
  → Task 3 query host
  → Task 4 async iframe
  → Task 5 убрать full load
  → Task 6 превью UI
  → Task 7 layout math
  → Task 8 apply (нужен Task 7)
  → Task 9 docs
```

Task 1–3 независимы после ветки и могут идти подряд. Task 4 зависит от 1 и 3. Task 5–6 — от 2 и 4. Task 8 — от 1 и 7.

## Покрытие spec

| Spec | Task |
|---|---|
| Снимок только холста | 2, 5 |
| neighbors / searchNodes / linksBetween | 3, 4 |
| apply очередь, не запись во время run | 1, 4 |
| Превью + Apply / Закрыть | 6 |
| Одна history-транзакция, resolve в store, lock | 8 |
| align / distribute / stack | 7 |
| Нет create node/link в дереве | 7 (только addExisting*) |
| Запуск без диаграммы нельзя | 5 |
| Timeout сбрасывает команды | 4 |
| Help и каталог | 4, 9 |
| Не серверный runner / не ключи | границы |

`findDuplicateLinks` после Task 2 автоматически смотрит только связи холста — отдельный task не нужен, добавить assert в тест snapshot/api.
