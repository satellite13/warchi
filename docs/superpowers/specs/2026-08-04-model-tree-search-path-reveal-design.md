# Model tree search: hierarchical path + reveal on clear

Date: 2026-08-04  
Status: approved design

## Goal

В поиске дерева редактора модели показывать найденные узлы в контексте иерархии (путь от корня виден структурно), а после сброса поиска сохранять выбор и переводить полное дерево к выбранному элементу (раскрыть предков + scroll).

## Problem

1. Режим поиска сейчас рендерит **плоский** список совпадений (`treeRows` при непустом query, `depth: 0`) — одинаковые имена неразличимы, полного пути нет.
2. При очистке поиска выделение в state часто остаётся (`selectedNodeId`), но ветка свёрнута: визуально кажется, что выбор «слетел», к узлу не переходят.

Уже есть заготовки: `visibleNodeIds` / `filteredChildNodes` (matches + ancestors), `expandToNode` / `focusNode`.

## Scope

**In:**
- `ModelTreePalettePanel.vue` — рендер search tree, auto-expand, reveal on clear, приглушение предков-несовпадений
- при необходимости хелпер в `useTreeSearch.ts` (например, цепочка предков)
- unit-тесты (`useTreeSearch` / panel)
- i18n только если появятся новые user-facing строки (сейчас не ожидается)

**Out:**
- backend / API / papirus
- авто-сброс поиска по клику на результат
- snapshot/restore `expandedNodes` «как было до поиска»
- отдельный breadcrumb-список результатов
- глобальный поиск по модели вне дерева

## Requirements (confirmed)

| Решение | Выбор |
|--------|--------|
| Формат пути в поиске | **Урезанное дерево**: matches + ancestors; соседи без match скрыты |
| Reveal выбранного | Только при **сбросе** поиска (пустое поле / крестик), не при клике |
| Подход | Доработать текущий tree, не отдельный SearchResultsList |
| Expand при поиске | Авто-раскрыть всех предков совпадений |
| После clear | `focusNode` / аналог для диаграммы; лишние раскрытые папки от поиска ок |
| Truncation | Сохранить лимит ~250 видимых строк + существующее предупреждение |

## Design

### Search rendering

Убрать отдельную ветку «flat matches» в `treeRows`.

Всегда строить строки через иерархический обход (`pushNode`), используя:
- без query — `visibleRootNodes` / `visibleChildNodes` (все узлы) + `expandedNodes`
- с query — те же helpers, уже ограниченные `visibleNodeIds` (matches + ancestors)

Корневые и node-диаграммы фильтровать как сейчас (`visibleRootDiagrams` / `visibleNodeDiagrams`).

При обходе учитывать `MAX_SEARCH_TREE_ROWS` (сейчас 250): truncate mid-walk, флаг `truncated`.

### Auto-expand on search

Когда `normalizedQuery` становится непустым (после debounce):

1. Собрать id предков для каждого id из `matchingNodeIds` (до `treeRootNodeId`, не включая root).
2. Для диаграмм, попавших в выдачу по имени: добавить предков их parent-node.
3. Добавить эти id в `expandedNodes` (union, не заменять set целиком чужими id без нужды).

Пользователь может дальше вручную сворачивать/разворачивать в режиме поиска.

### Ancestor styling

Узлы в выдаче, которые **не** входят в `matchingNodeIds`, но видны как предки — приглушённое имя (CSS-модификатор на `tree-node__name`, цвет `--text-subtle` / аналог). Прямые совпадения — без изменений.

### Reveal on clear

Watch переход «был непустой debounced/normalized query → стал пустой»:

1. Если `selectedNodeId` задан и узел ещё существует — `focusNode(selectedNodeId)` (expand ancestors + `scrollIntoView`).
2. Иначе если `selectedDiagramId` задан — раскрыть parent-node диаграммы (если есть) и проскроллить к `[data-…]` строки диаграммы (добавить data-атрибут при необходимости, по аналогии с `data-tree-node-id`).
3. Выбор в props/state **не** очищать.

Клик по результату во время поиска только `selectNode` / open diagram — поиск не сбрасывается.

### State notes

- Не вводить snapshot `expandedNodes` до поиска.
- `selectedNodeId` / `selectedDiagramId` остаются источником истины для reveal.
- Debounce поиска (200ms) не менять: reveal завязать на фактический выход из search mode (пустой normalized/debounced query), чтобы не дёргать дерево на каждый символ backspace до очистки.

## Tests

1. **Hierarchical search rows:** при query видны match + ancestor, sibling без match отсутствует; depth отражает иерархию.
2. **Auto-expand:** после установки query предки match есть в `expandedNodes`.
3. **Reveal on clear:** при очистке query вызывается expand+scroll к `selectedNodeId` (mock `scrollIntoView` / проверка expanded set); selection id не обнуляется.
4. Существующие filter/debounce тесты `useTreeSearch` сохранить.

## Risks

- Большие модели: авто-expand многих веток + лимит 250 — часть глубоких matches может обрезаться; поведение truncation уже принято продуктом.
- Лишние раскрытые папки после clear — осознанный компромисс vs сложность snapshot.
