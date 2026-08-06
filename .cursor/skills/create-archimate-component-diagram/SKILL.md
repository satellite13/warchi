---
name: create-archimate-component-diagram
description: >-
  Creates ArchiMate Application Component landscape diagrams in wArchi models via
  wArchi MCP (ensure_node/link/diagram, add_diagram_instances, wiki, componentProperties).
  Use when the user asks to create a component diagram, application landscape,
  ArchiMate product map, or to place products/services as Application Components
  with Serving/Aggregation/Association links.
---

# Create ArchiMate Component Diagram (wArchi MCP)

Скилл по созданию **компонентных ландшафтов** в модели через MCP `user-warchi`. Не пишет код приложений — только данные модели.

## Before writing

1. Уточни (кратко, по одному вопросу если неочевидно):
   - модель (часто LemanaPro)
   - папка-якорь (Directory), куда вешать диаграмму
   - охват: только продукты-коробки vs глубже
2. Прочитай актуальные схемы tools: `GetMcpTools` для `user-warchi` (ensure_*, add_diagram_instances, create_wiki).
3. При 403 на write: проверить scopes `models:write`; Bearer CSRF уже должен быть снят в arepos. При 503 Cerbos — authz недоступен.

## MCP pipeline (обязательный порядок)

```text
search_catalog → search_model → search_notation
  → ensure_node (Application Components)
  → update_node (componentProperties: status, sourceLink, comment, technology)
  → ensure_link (Aggregation / Serving / Association)
  → ensure_diagram (nodeId = Directory!)
  → add_diagram_instances
  → list_wiki → create_wiki | update_wiki
  → verify get_diagram / get_node
```

**Предпочитать** `ensure_*` вместо `create_*` + ручной дедупликации.  
`batch_save_model` — только escape hatch.

## Hard rules (из практики)

| Правило | Почему |
|---------|--------|
| Диаграмму вешать на **Directory**, не на Application Component | В дереве UI компонент не раскрывается — диаграммы «теряются» |
| После `ensure_node` сразу заполнять **componentProperties** | Binding пишет только `notationComponents`; `status`/`sourceLink`/… пустые |
| Для живых продуктов `status=active` | Default enum в нотации — `new` |
| `sourceLink` = `https://…` | Regex свойства: `^https?:\/\/\S+$` |
| Lib во фронте → **Aggregation** (whole→part) | Serving для lib неверен |
| API обслуживает потребителя → **Serving** (provider→consumer) | ArchiMate 3 аналог uses |
| Маркетинг/слабая связь → **Association** | Не Serving |
| Query MCP без пробелов в `q` | `Invalid character ' '` в QUERY_PARAM — искать `Application`, `Serving`, `landscape` |

## Discovery

```text
search_catalog(q=<modelName>, kinds=models)
search_catalog(q=Archimate, kinds=notations)
search_model(modelId, q=<folderOrProduct>, kinds=nodes)
search_notation(notationId, q=Application, kinds=components)  # → Application Component id
search_notation(notationId, q=relation, kinds=relations)     # → Aggregation/Serving/Association
```

При ambiguous name → передавай `componentId` / `relationId`, не короткое имя.

## Nodes

```text
ensure_node(
  modelId, name, parentNodeId=<Directory>,
  notationId, componentId=<Application Component>
) → { node, created }
```

Затем **обязательно** `update_node` с полным attrs (merge с уже существующими полями вроде `documentFileId` / `treeOrder`):

```json
{
  "notationComponents": {
    "<notationId>": { "componentId": "<Application Component id>" }
  },
  "componentProperties": {
    "<notationId>": {
      "<componentId>": {
        "status": "active",
        "sourceLink": "https://gitverse.ru/…",
        "comment": "кратко что делает",
        "technology": "стек"
      }
    }
  },
  "typeProperties": {}
}
```

Свойства Application Component (Archimate 3.1): см. [reference.md](reference.md).

## Links

| Смысл | relation | Направление |
|-------|----------|-------------|
| Frontend включает lib | Aggregation | frontend → lib |
| Backend API для UI/MCP | Serving | arepos → consumer |
| Сайт ↔ продукт | Association | site — product (без «uses») |

```text
ensure_link(modelId, sourceId, targetId, notationId, relationId)
→ { link, created }
```

## Diagram + canvas

```text
ensure_diagram(modelId, name, notationId, nodeId=<Directory>)
add_diagram_instances(
  diagramId,
  nodesJson=[{modelNodeId,x,y,width,height},…],
  edgesJson=[{modelLinkId},…]   // endpoints auto-resolve
)
```

Если `ensure_diagram` вернул hit со старым `nodeId` на Application Component — сразу `update_diagram(nodeId=<Directory>)`.

Типичный layout коробок: продукт по центру сверху; соседи слева/справа; lib под продуктом; backend снизу.

При `DIAGRAM_CONFLICT` — `get_diagram` → повторить merge с `baseUpdatedAt`.

## Wiki (required)

1. `list_wiki(diagramId)` — если есть → `update_wiki`, иначе `create_wiki(entityKind=diagram, …)`
2. Опционально wiki на ключевой Application Component / Directory
3. Markdown: цель, таблица компонентов, смысл связей, ссылки на репозитории

## Acceptance checklist

- [ ] Диаграмма видна под **папкой** в дереве
- [ ] На canvas все Application Component + рёбра нужных типов
- [ ] У каждого компонента: `status=active`, `sourceLink`, `comment`, `technology`
- [ ] Wiki диаграммы читается через `get_wiki`
- [ ] Повторный `ensure_node` / `ensure_link` / `ensure_diagram` → `created=false`

## Out of scope

- Декомпозиция Vue-модулей (если пользователь не просил)
- Business/Technology layer ArchiMate (если не просил)
- Модели вне allowlist API key (`model_not_allowed`)

## Example session

P2020 landscape в LemanaPro: plan/spec  
`docs/superpowers/plans/2026-08-04-p2020-component-landscape.md`  
`docs/superpowers/specs/2026-08-04-p2020-component-landscape-design.md`
