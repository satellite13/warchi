# Stage 3: ленивая загрузка редактора больших моделей

Дата: 2026-08-21
Репозитории: `warchi`, `arepos-server`
Ветка: `feat/large-model-editor-load-stage-3`

## Контекст и цель

Этапы 1–2 устранили повторный полный обход, ограничили параллелизм, добавили
progress bar и убрали глубокую Vue-реактивность массовых entities. На модели из
104 720 узлов, 169 602 связей и 7 868 диаграмм max long task снизился до 303 мс,
used JS heap — до 339 MiB.

Stage 3 заменяет обычную полную загрузку nodes/links материализацией видимого
дерева и scope открытой диаграммы. Требуется сохранить batch-save, live sync,
conflict reload и функции с обоснованной потребностью в полном снимке.

Целевое поведение:

- корень дерева открывается без полного `GET /nodes`;
- прямые дети папки загружаются при раскрытии;
- обычное открытие не загружает все links;
- diagram, search и deep-link догружают ограниченный scope;
- granular live sync не запускает автоматический full pull;
- трассировка использует постраничный graph API;
- мастер копирования лениво загружает только папки целевой модели.

Не входят: partial relation matrix/compare, lazy notation catalog, изменение
Page-формата, сжатие DTO, ручная команда полного refresh и автоматический full
pull для неизвестного sync-события.

## Архитектура

Выбран инкрементальный partial store. Совместимые массивы `nodes[]`/`links[]`
остаются materialized subset, рядом появляются индексы и явная семантика
полноты. Полная замена на `Map` отклонена как big-bang; API без partial merge
отклонены, потому что старый merge считает отсутствующую clean entity удалённой.

Store поддерживает:

- `nodeById`, `linkById`, `childrenByParent`;
- `childrenPages` с загруженными page numbers, `nextPage` и `totalElements`;
- `loadedChildrenFor` только для полностью загруженного parent scope;
- in-flight dedup, локальные ошибки и request token каждого scope;
- model generation guard;
- `treeScopeReady` и `diagramScopeReady`.

Stage 3 не вводит eviction: материализованные clean entities живут до смены модели
или scoped reset. Dirty/new/deleted entities никогда не вытесняются. Если длительная
сессия снова приблизится к full snapshot, eviction становится отдельным измеряемым
этапом, а не скрытой частью этой реализации.

Merge modes:

- `partial` — upsert, отсутствие id ничего не удаляет;
- `childrenPage(parentId, page)` — append/upsert страницы без удаления детей из
  других страниц;
- `childrenScope(parentId)` — reconcile всех прямых детей разрешён только после
  получения полного набора страниц в одном generation;
- `full` — прежняя drop-семантика для отдельного полного снимка;
- explicit delete очищает materialized entity и индексы;
- internal `remoteDeletedIds` tombstone, отдельный от пользовательского
  `_isDeleted`, не даёт старому in-flight ответу воскресить entity;
- dirty/new/deleted local entity сохраняет приоритет при любом merge.

## Backend API

### Дерево

```http
GET /api/v1/nodes
  ?modelId=<uuid>
  &parentId=root|<uuid>
  &excludeSystem=true|false
  &foldersOnly=true|false
  &page=0&size=...
```

- UUID возвращает direct children.
- `root` разрешается через `models.attrs.treeRootNodeId`; legacy fallback —
  `parent_node IS NULL` только при отсутствии `treeRootNodeId`. Ссылка на
  отсутствующий root считается повреждёнными данными и возвращает `409`.
- `modelId` обязателен при `parentId`. UUID parent из другой модели возвращает
  `404`, не раскрывая его существование.
- `excludeSystem=true` по умолчанию скрывает hidden root.
- `foldersOnly=false` по умолчанию; `true` оставляет node type с
  `lower(name) = 'directory'`, что совпадает с текущей frontend-семантикой.
- Сортировка `treeOrder,id`; total относится к parent scope.
- В parent-scoped Page `NodeResponse.hasChildren` обязателен. При
  `foldersOnly=true` он означает наличие хотя бы одного видимого Directory child;
  иначе — любого видимого child. EXISTS повторяет ACL, `excludeSystem` и
  `foldersOnly`.
- В point/full/resolve ответах `hasChildren` nullable и не вычисляется массовым
  N+1; ancestors явно возвращают его для path nodes.
- Без `parentId` сохраняется существующий full-list escape hatch.
- ACL выполняется до pagination; owner/shared viewer/admin/MCP получают одинаковый
  порядок и корректный total. Lazy-tree использует единый ACL SQL path без
  admin/user веток с разной сортировкой; admin global list без `modelId` остаётся
  старым endpoint.
- `hasChildren` реализуется projection/correlated EXISTS, не N+1.
- Клиент запрашивает `size=500`. При оставшихся страницах дерево добавляет
  служебную строку «Загрузить ещё»; повторное раскрытие не считается полностью
  загруженным до последней страницы.

### Batch resolve

```http
POST /api/v1/models/{modelId}/nodes:resolve
{ "nodeIds": ["uuid"] }
```

Возвращает nodes в порядке входных id и `missingIds`. Лимит — 2 000 id, клиент
делит больший scope на chunks. Чужие/недоступные ids попадают в `missingIds`;
oversized или пустой request возвращает `400`.

```http
POST /api/v1/models/{modelId}/links:resolve
{
  "linkIds": ["uuid"],
  "endpointNodeIds": ["uuid"]
}
```

Возвращает deduplicated links, явно перечисленные по id или имеющие source/target
из endpoint ids, плюс `missingLinkIds`. Хотя бы один массив непустой. Добавляются
индексы `(model, source)` и `(model, target)`. Каждый массив ограничен 2 000 id,
клиент выполняет chunked requests; чужие ids не раскрываются и считаются missing.

### Предки

```http
GET /api/v1/models/{modelId}/nodes/{nodeId}/ancestors
```

Ordered list от корневого ребёнка до непосредственного parent; hidden root
исключён. Для hidden root ответ пуст. Максимальная глубина 256; превышение или
цикл возвращает `409`.

### Трассировка

```http
GET /api/v1/models/{modelId}/graph/neighbors
  ?nodeId=<uuid>
  &direction=outgoing|incoming
  &linkTypeId=<uuid?>
  &page=0&size=50
```

Возвращает Page `GraphNeighborResponse { link, node }`. Только прямые соседи;
следующая глубина загружается при раскрытии ветки. Для outgoing `node` — target,
для incoming — source. Сортировка стабильна по `link.id,node.id`.

```http
GET /api/v1/models/{modelId}/diagram-references
  ?nodeId=<uuid>&page=0&size=50
```

Возвращает slim Page диаграмм, содержащих instance node. Query ограничен model id
и сортируется по `name,id`. Используется
`GIN (attrs jsonb_path_ops) WHERE deleted = false`; SQL ограничивает model id и
проверяет JSONPath `$.instances.nodes[*].modelNodeId`. Ответ не содержит attrs.

## Основные потоки

### Открытие

1. Загрузить model metadata.
2. Параллельно загрузить `parentId=root` и slim diagrams.
3. Присвоить partial state, снять blocking progress.
4. Считать initial snapshot готовым после model + root + diagram list и запустить
   live sync.
5. Загружать notation catalog по независимому readiness.
6. Не запускать background full `/links`.

### Дерево, поиск и deep-link

Раскрытие папки проверяет cache/in-flight, загружает direct children и применяет
`childrenPage`. Последняя страница переводит parent в `loadedChildrenFor`.
«Загрузить ещё» догружает следующую страницу. Полный scoped refresh сбрасывает
page cursor и reconcile выполняется только после получения всех страниц. Ошибка
локальна строке и повторяема.

Поиск использует существующий `/search/models/{id}?kinds=nodes`. Выбор результата
получает ancestors и batch-resolve node, после чего раскрывает путь. Ancestor
merge остаётся `partial`: наличие одного path child не помечает siblings scope
полностью загруженным. Search исключает hidden root. Server limit 50 относится к
hits; `MAX_SEARCH_TREE_ROWS=250` остаётся лимитом отрисованных строк.

Deep-link сначала выбирает diagram из slim-list, затем гидратирует attrs, parent
path и diagram scope. Canvas может открыться раньше фокусировки дерева.

### Диаграмма

1. `GET /diagrams/{id}` гидратирует attrs.
2. Из instances извлекаются `modelNodeId[]` и `modelLinkId[]`.
3. Nodes и links загружаются batch resolve chunks по 2 000 id.
4. Endpoint ids добавляются для reuse/connection UI.
5. Результат вливается через `partial`.
6. Scope имеет progress, cancellation и generation guard.

### Мастер копирования

Дерево целевой модели использует parent API с `foldersOnly=true`; полного
`fetchAllByModelId('/nodes')` нет.

## Live sync

Parsed/coalesced granular events применяются напрямую:

- create/update materialized entity — point fetch и partial upsert;
- create в loaded parent — scoped refresh;
- событие незагруженной ветки не материализует её;
- delete удаляет materialized entity и инвалидирует известный parent;
- diagram update обновляет slim row, сохраняя hydrated local attrs открытой
  диаграммы;
- неизвестное событие логируется и инвалидирует известный scope без full pull.

Dirty local entity имеет приоритет над remote update. Full collection load
остаётся только detached-механизмом глобальной валидации/scripts и отдельных
matrix/compare экранов. Conflict/OEF/discard выполняют partial reset, описанный
ниже, а не full pull.

WS/hybrid применяют granular payload. Чистый poll и fallback poll сначала
сравнивают model `updatedAt`; при изменении выполняют bounded reconciliation:
slim diagrams, все materialized parent scopes и открытый diagram scope. Poll,
visibility и auth-refresh никогда не вызывают `fetchAllByModelId` обычных
nodes/links. Offset-pagination scope после remote create/move сбрасывается и
перечитывается с первой страницы до прежней видимой границы.

## Save, validation и reload

Batch-save отправляет только local dirty/new/deleted entities. Отсутствие entity
в partial store никогда не означает delete.

Required-properties validation перед Save использует временный detached full
snapshot. Перед проверкой поверх server snapshot накладывается local delta:
dirty/new upsert и deleted remove. Иначе несохранённые изменения не попадут в
валидацию. Snapshot не сливается в editor state и освобождается после проверки.
Save показывает отдельный cancellable progress «Подготовка проверки модели»;
cancel не меняет partial state и не отправляет batch-save. Ошибка полной загрузки
блокирует Save с повторяемым сообщением.

Conflict reload, OEF reload и discard пересоздают root/diagram partial state.
Relation matrix, version diff и visual compare сохраняют отдельные full-load
пути. Defaults применяются при materialization; глобальный
`syncDefaultsOnLoadChunked` при обычном открытии отключается.

## Трассировка

Корневая и каждая раскрытая ветка запрашивают свою страницу direct neighbors.
Direction и link type фильтруются сервером. Loading/error/retry локальны ветке,
циклы блокируются текущим path-множеством. Секция диаграмм использует
`diagram-references`, не негидратированные attrs slim-list.

## Ошибки и конкурентность

- Каждый model/scope request проверяет generation, model id и request token.
- Повторный scope deduplicated.
- Навигация игнорирует старые ответы.
- Ошибка root shell блокирует открытие; child/search/graph/diagram ошибки локальны.
- Partial response после delete не преодолевает tombstone.
- Selection id может ссылаться на нематериализованный node: properties panel
  выполняет `nodes:resolve`; до результата показывает локальный loading.
- Scoped refresh не фильтрует links по текущему `nodeById`: endpoints могут быть
  ещё не материализованы и разрешаются по требованию.
- Reorder/move/create в parent с неполными страницами сначала догружает всех
  siblings. Только после этого клиент пересчитывает `treeOrder` в полном
  `childrenScope`; при ошибке догрузки операция не выполняется. Это исключает
  дубли treeOrder без отдельного reorder API.

## Матрица потребителей полного снимка

| Потребитель | Trigger | Scope Stage 3 | Progress / ошибка |
|---|---|---|---|
| Required properties Save guard | Save | detached full + local delta | cancellable; ошибка блокирует Save |
| Validation scripts | ручной запуск script | detached full + local delta | отдельный progress; editor не меняется |
| Relation matrix | открытие matrix | существующий отдельный full-load | локальный экран loading/error |
| Version/visual/diagram compare | открытие compare | существующий отдельный full-load | локальный экран loading/error |
| Batch conflict reload | выбор reload | reset partial + root/open diagram scope | blocking reload/retry |
| OEF import reload | успешный commit import | reset partial + root/open diagram scope | import progress/retry |
| Discard fallback | point restore не удался | reset partial + root/open diagram scope | blocking reload/retry |
| Diagram lock remote reload | подтверждение reload | open diagram scope + affected tree scopes | локальный progress/retry |
| Diagram copy wizard | выбор target model | lazy folders, не full snapshot | row/tree loading/retry |
| Package export/import/backend copy | отдельная server operation | editor state не используется | существующий server progress |

Полный снимок — временный read model, а не merge в partial editor state. Ручной
user-facing full refresh исключён принятым решением; source requirements должны
использовать эту же формулировку.

## Поставка

1. Partial store, scoped merge, lazy-tree API и lazy folders copy wizard.
2. `nodes:resolve`/`links:resolve`, diagram scope, удаление full background links.
3. Server search, ancestors и deep-link.
4. Granular live sync.
5. Paged graph neighbors, diagram references и traceability.
6. Detached full snapshot для validation и служебных reload.

Каждый инкремент работоспособен и имеет отдельный commit в обоих репозиториях.

## Проверки

Backend:

- root/UUID/legacy parent, excludeSystem, foldersOnly, hasChildren, order и Page;
- одинаковые ACL semantics для owner/shared/admin/MCP;
- resolve ACL/dedup/missing/empty/oversized;
- ancestor order/cycle/hidden root;
- graph direction/type/Page и diagram-reference ACL;
- query-plan smoke test широкой папки.

Frontend:

- индексы и `partial`/`childrenScope`/`full`;
- branch pagination/dedup/retry/stale generation/tombstone;
- append страниц без удаления предыдущих и full-scope reconcile после последней;
- root shell без full nodes/links;
- diagram scope только по ids attrs с сохранением dirty;
- search/deep-link ancestor path;
- granular sync без full pull и удаления unloaded;
- poll/hybrid bounded reconciliation без full collection pull;
- lazy folders wizard и lazy traceability;
- detached validation с local delta без раздувания editor state;
- reorder/move после полной materialization siblings;
- корректные conflict/OEF/discard reload.

Benchmark на эталонной модели:

- обычное открытие не обходит полностью `/nodes` и `/links`;
- root доступен после parent shell;
- expand получает direct children, diagram — только свой scope;
- live sync не вызывает full pull;
- branch error не закрывает редактор;
- heap и трафик ниже baseline 339 MiB;
- max long task < 2 с, p95 `/diagram-locks` < 1 с.

## Риски

- ACL post-filter после Page исказит total — фильтрация должна быть в SQL.
- `reindexTreeOrders` запускается только после полной загрузки parent scope.
- Full validation дорога, но не влияет на opening и не остаётся в editor state.
- Search limit остаётся 50.
