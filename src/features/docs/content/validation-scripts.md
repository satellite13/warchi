# Скрипты

Раздел **Скрипты** позволяет писать и шарить JavaScript для **открытой диаграммы**: проверить холст, подвинуть фигуры или доложить уже существующие ноды и связи модели.

Скрипт **не выгружает дерево модели** и **не меняет граф** (не создаёт и не удаляет ноды/связи в дереве). Запись на холст идёт только через очередь `apply.*` после превью.

Запуск: в редакторе модели кнопка **Скрипты** (пока диаграмма не открыта — неактивна).

Права: просмотр скрипта и модели — для отчёта; чтобы нажать **Применить**, нужны право редактирования модели и обычный lock диаграммы.

## Встроенные объекты

### `ctx`

- `ctx.model` — **срез холста**: только ноды и связи, которые уже лежат на открытой диаграмме (`folders` пустой)
- `ctx.diagram` — открытая диаграмма (`id`, `name`, `notationId`, `nodeIds`, `linkIds`, `instances`, `edges`)
- `ctx.notations` — нотация этой диаграммы
- `ctx.types` — типы нод/связей с холста

## Структуры снимка

Ниже — поля объектов в `ctx` и возвращаемых хелперами значений (снимок read-only).

### Нода (`ctx.model.nodes[]`, `diagramNodes`, `nodesOfType`)

```ts
{
  id: string
  name: string
  parentId: string | null   // родитель в дереве модели (или null)
  nodeTypeId: string
  attrs: Record<string, unknown> | null  // разобранные attrs ноды
}
```

`nodes` — только ноды, уже лежащие на холсте. `ctx.model.folders` в этом снимке пустой: дерево модели скрипт не получает.

### Связь (`ctx.model.links[]`, `diagramLinks`, `linksOfType`)

```ts
{
  id: string
  name: string              // в снимке обычно пустая строка
  sourceId: string
  targetId: string
  linkTypeId: string
  attrs: Record<string, unknown> | null
}
```

### Диаграмма (`ctx.model.diagrams[]`, `ctx.diagram`)

```ts
{
  id: string
  name: string
  version: string
  notationId: string
  nodeIds: string[]
  linkIds: string[]
  instances: Array<{ id, modelNodeId, x, y, width?, height? }>
  edges: Array<{ id, modelLinkId, sourceInstanceId, targetInstanceId }>
}
```

Геометрия фигур — в `ctx.diagram.instances` / `edges`. Объекты нод и связей модели с холста — `diagramNodes(ctx.diagram)` / `diagramLinks(ctx.diagram)`. Связи **вне** холста ищите через `await linksBetween(...)`.

### Нотация (`ctx.notations[]`)

```ts
{
  id: string
  name: string
  version: string
  components: Component[]
  relations: Relation[]
  relationRules: RelationRule[]
}
```

**Компонент** (`components[]`, результат `componentForNode`):

```ts
{
  id: string
  name: string
  notationId: string
  nodeTypeId: string
}
```

**Отношение** (`relations[]`):

```ts
{
  id: string
  name: string
  notationId: string
  linkTypeId: string
}
```

**Правило отношения** (`relationRules[]`, `relationRules(notationId)`):

```ts
{
  id: string
  relationId: string
  fromComponentId: string
  toComponentId: string
}
```

### Типы (`ctx.types`)

```ts
{
  nodeTypes: Array<{ id: string; name: string; attrs: string | null }>
  linkTypes: Array<{ id: string; name: string; attrs: string | null }>
}
```

`attrs` у типов — сырая JSON-строка (или `null`), в отличие от разобранного объекта у нод/связей.

### Дубликаты связей (`findDuplicateLinks`)

```ts
findDuplicateLinks({ by?: 'endpoints' | 'endpoints+type', directed?: boolean })
// by по умолчанию 'endpoints+type'; directed по умолчанию true (учитывается source→target)

{
  linkIds: string[]
  sourceId: string
  targetId: string
  linkTypeId?: string   // есть при by: 'endpoints+type'
}
```

При `directed: false` пары A→B и B→A попадают в одну группу.

### Target для `report`

```ts
{ kind: 'node' | 'link' | 'diagram' | 'folder'; id: string }
```

### `report`

Пишет пункты в список результатов:

```js
report.error(message, target?)
report.warn(message, target?)
report.info(message, target?)
```

- `message` — текст результата (обязателен)
- `target` (необязательно):
  - явный: `{ kind: 'node' | 'link' | 'diagram' | 'folder', id: '...' }`
  - или объект ноды/связи из снимка — имя попадёт в текст, а клик по результату выделит сущность

Это **не** `console.log`: без текста в `message` (или без имени в объекте-target) в отчёте будет пусто.

## Хелперы

| Функция | Назначение |
|---------|------------|
| `diagramNodes(diagram)` | Ноды **среза холста** |
| `diagramLinks(diagram)` | Связи **среза холста** |
| `nodesOfType(typeIdOrName)` | Ноды среза с типом по id или имени |
| `linksOfType(typeIdOrName)` | Связи среза с типом по id или имени |
| `neighbors(nodeId, { direction, linkType?, page? })` | Соседи в модели. `{ items, last }` |
| `searchNodes({ q?, type?, limit? })` | Поиск нод модели. Нужен `q` или `type`, лимит ≤ 50 |
| `linksBetween(a, b, { linkType? })` | Все связи модели между парой (оба направления) |
| `findDuplicateLinks({ by, directed? })` | Дубликаты связей **на холсте** |
| `componentForNode(node)` | Компонент нотации для ноды (или `null`) |
| `relationRules(notationId)` | Правила отношений нотации |

`neighbors` / `searchNodes` / `linksBetween` — async query в модель, не снимок.

### `apply` (очередь, не запись)

| Команда | Смысл |
|---------|--------|
| `apply.setBounds({ instanceId, x, y, width?, height? })` | Геометрия фигуры |
| `apply.addInstance({ nodeId, x?, y? })` | Положить существующую ноду модели |
| `apply.addEdge({ linkId })` | Положить существующую связь; концы резолвит хост |
| `apply.removeInstance({ instanceId })` | Снять фигуру; нода в дереве остаётся |
| `apply.removeEdge({ edgeInstanceId })` | Снять ребро; связь в дереве остаётся |
| `apply.align({ instanceIds, mode })` | `left` / `center` / `right` / `top` / `middle` / `bottom` |
| `apply.distribute({ instanceIds, axis })` | `horizontal` / `vertical` |
| `apply.stack({ instanceIds, mode })` | `vertical` (зазор 8px) или `overlap` |
| `apply.setEdgeStyle({ linkId, strokeColor })` | Цвет обводки ребра на холсте (`#rgb` / `#rrggbb`) |

Ничего не пишется до кнопки **Применить**.

Имена доступны в автодополнении редактора (Ctrl+Space).

## Ограничения песочницы

- Нет сети (`fetch` / XHR / WebSocket). Запросы в модель — только `neighbors` / `searchNodes` / `linksBetween`
- Нет доступа к DOM приложения
- Таймаут на весь прогон вместе с query
- Лимит числа сообщений в одном запуске
- `apply.addEdge({ linkId })` — только id связи модели; концы хост резолвит сам

## Примеры

Проверка холста:

```js
const locations = diagramNodes(ctx.diagram).filter((n) =>
  nodesOfType('Location').some((loc) => loc.id === n.id)
)
if (locations.length === 0) {
  report.error('На диаграмме нет Location', { kind: 'diagram', id: ctx.diagram.id })
}
```

Раскладка:

```js
const ids = ctx.diagram.instances.map((i) => i.id)
apply.align({ instanceIds: ids, mode: 'left' })
apply.distribute({ instanceIds: ids, axis: 'vertical' })
```

Доложить соседей (нода уже есть в модели):

```js
const id = ctx.diagram.instances[0].modelNodeId
const ns = await neighbors(id, { direction: 'outgoing', linkType: 'Flow' })
for (const item of ns.items) {
  apply.addInstance({ nodeId: item.node.id, x: 40, y: 40 })
  apply.addEdge({ linkId: item.link.id })
}
```

После запуска: список issue и сводка команд. **Закрыть** — холст не менять. **Применить** — записать одной операцией Undo и закрыть окно.

## Каталог и доступ

В меню **Скрипты** создавайте скрипты кнопкой **«+»** в боковой панели, редактируйте исходный код и выдавайте доступ `VIEW` / `EDIT` через шаринг — как у других сущностей каталога. Скрипт — одна сущность **без** semver-версий и без поля «тип скрипта».
