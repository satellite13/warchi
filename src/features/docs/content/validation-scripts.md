# Скрипты

Раздел **Скрипты** позволяет писать и шарить JavaScript для **открытой диаграммы**: проверить холст, подвинуть фигуры или доложить уже существующие ноды и связи модели.

Скрипт **не выгружает дерево модели** и **не меняет граф** (не создаёт и не удаляет ноды/связи в дереве). Запись на холст идёт только через очередь `apply.*` после превью.

Запуск: в редакторе модели кнопка **Скрипты**. Без открытой диаграммы запуск недоступен.

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

Папки модели (тип Directory) в `nodes` не попадают — они в `ctx.model.folders[]`: `{ id, name, parentId }`.

### Связь (`ctx.model.links[]`, `diagramLinks`, `linksOfType`, `linksBetween`)

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

Список нод/связей диаграммы — через `diagramNodes(ctx.diagram)` / `diagramLinks(ctx.diagram)`, а не через вложенные объекты.

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
| `diagramNodes(diagram)` | Ноды модели, видимые на диаграмме |
| `diagramLinks(diagram)` | Связи модели на диаграмме |
| `nodesOfType(typeIdOrName)` | Ноды по id или имени типа |
| `linksOfType(typeIdOrName)` | Связи по id или имени типа |
| `neighbors(nodeId, { direction, linkType?, page? })` | Соседи в модели. Возвращает `{ items, last }` |
| `searchNodes({ q?, type?, limit? })` | Поиск нод модели. Нужен `q` или `type`, лимит ≤ 50 |
| `linksBetween(a, b, { linkType? })` | Все связи модели между парой (оба направления); async query |
| `apply.*` | Очередь команд холста. Ничего не пишет до кнопки **Применить** |
| `findDuplicateLinks({ by, directed? })` | Дубликаты связей; по умолчанию с учётом направления |
| `componentForNode(node)` | Компонент нотации для ноды (или `null`) |
| `relationRules(notationId)` | Правила отношений нотации |

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

После запуска: список issue и сводка команд. **Закрыть** — холст не менять. **Применить** — одна операция Undo.

## Каталог и доступ

В меню **Скрипты** создавайте скрипты кнопкой **«+»** в боковой панели, редактируйте исходный код и выдавайте доступ `VIEW` / `EDIT` через шаринг — как у других сущностей каталога. Скрипт — одна сущность **без** semver-версий и без поля «тип скрипта».
