# Скрипты

Раздел **Скрипты** позволяет писать и шарить JavaScript-скрипты проверки модели. Скрипт только **сообщает** о проблемах через `report` — модель и диаграмму он не изменяет.

Запуск: в редакторе модели кнопка **Скрипты** (иконка терминала) на панели инструментов.

## Контекст запуска

Скрипт всегда получает снимок **всей модели**. Открытая диаграмма влияет только на `ctx.diagram`:

| Ситуация | `ctx.diagram` |
|----------|----------------|
| В редакторе открыта диаграмма | объект этой диаграммы |
| Диаграмма не открыта | `null` |

Права: нужны право **просмотра скрипта** и **просмотра модели**.

## Встроенные объекты

### `ctx`

- `ctx.model` — граф модели: `nodes`, `links`, `folders`, `diagrams`, плюс `id` / `name` / `version`
- `ctx.diagram` — открытая диаграмма или `null` (`id`, `name`, `notationId`, `nodeIds`, `linkIds`)
- `ctx.notations` — нотации, используемые диаграммами снимка (компоненты, отношения, правила)
- `ctx.types` — `{ nodeTypes, linkTypes }` с `id`, `name`, `attrs`

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
  nodeIds: string[]   // id нод, видимых на диаграмме
  linkIds: string[]   // id связей на диаграмме
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
| `linksBetween(a, b, { linkType? })` | Связи между двумя нодами (нода или id) |
| `findDuplicateLinks({ by, directed? })` | Дубликаты связей; по умолчанию с учётом направления |
| `componentForNode(node)` | Компонент нотации для ноды (или `null`) |
| `relationRules(notationId)` | Правила отношений нотации |

Имена доступны в автодополнении редактора (Ctrl+Space).

## Ограничения песочницы

- Нет сети (`fetch` / XHR / WebSocket)
- Нет доступа к DOM приложения
- Таймаут выполнения (по умолчанию несколько секунд)
- Лимит числа сообщений в одном запуске

## Пример

```js
if (!ctx.diagram) {
  report.warn('Откройте диаграмму перед запуском')
} else {
  for (const n of diagramNodes(ctx.diagram)) {
    report.info('Node:', n)
  }
  for (const dup of findDuplicateLinks({ by: 'endpoints+type' })) {
    report.warn('Дублирующая связь', { kind: 'link', id: dup.linkIds[0] })
  }
}
```

## Каталог и доступ

В меню **Скрипты** создавайте скрипты кнопкой **«+»** в боковой панели, редактируйте исходный код и выдавайте доступ `VIEW` / `EDIT` через шаринг — как у других сущностей каталога. Скрипт — одна сущность **без** semver-версий. Запуск — из редактора модели (нужны просмотр скрипта и просмотр модели).
