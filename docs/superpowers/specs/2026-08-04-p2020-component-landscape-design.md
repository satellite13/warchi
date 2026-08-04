# P2020 Component Landscape (ArchiMate) — Design

## Goal

Создать в модели **LemanaPro** компонентную диаграмму продукта **P2020 - Web Archi** в нотации **Archimate 3.1**, отражающую продуктовый контур wArchi по исходникам репозиториев (без глубокой декомпозиции модулей frontend).

## Decisions (approved)

| Тема | Решение |
|------|---------|
| Модель | LemanaPro (`9e449958-1168-4c73-aa47-b197f10ef7a2`) |
| Привязка | Directory / Application Component **P2020 - Web Archi** |
| Нотация | Archimate 3.1 (`eb174cb9-371d-400a-b34f-b47c0824ed12`) |
| Охват | Весь продуктовый контур |
| Детализация | Только продукты-коробки (без модулей внутри wArchi) |
| Подход | Reuse существующего P2020 + новые соседние Application Component |
| papirus | **Aggregation** P2020 → papirus (библиотека входит во фронт; не Composition) |
| arepos ↔ P2020 / MCP | **Serving** (ArchiMate 3 аналог uses / used by): arepos → consumer |
| warchi-site ↔ P2020 | **Association** (маркетинг/продуктовая связь, не runtime Serving) |
| Документация | **Required** wiki на diagram (+ pointer на node P2020) |

## Components

| Имя | Действие | Тип | Смысл |
|-----|----------|-----|--------|
| P2020 - Web Archi | reuse | Application Component | Vue frontend wArchi |
| papirus | create | Application Component | Canvas engine (`@ngroznykh/papirus`) |
| arepos-server | create | Application Component | Backend REST/WS API |
| warchi-mcp | create | Application Component | MCP server поверх arepos |
| warchi-site | create | Application Component | Публичный/маркетинговый сайт |

Новые узлы: **siblings** Application Component P2020, `parentNodeId` = Directory `P2020 - Web Archi` (`82115c21-3e0f-4bb6-ae46-7383420ad24e`).

Существующий Application Component P2020: `7a80a09f-b44e-4c1f-94b4-d6c726ffa765`.

## Relations (model links)

| Source | Target | Relation | Meaning |
|--------|--------|----------|---------|
| P2020 - Web Archi | papirus | Aggregation | Frontend агрегирует canvas-библиотеку |
| arepos-server | P2020 - Web Archi | Serving | Backend API обслуживает UI (uses) |
| arepos-server | warchi-mcp | Serving | API + API-key exchange для MCP (uses) |
| warchi-site | P2020 - Web Archi | Association | Продуктовая/маркетинговая связь |

Точные `relationName` в нотации подтверждаются через `search_notation` (часто `Aggregation relation`, `Serving relation`, `Association relation`).

## Diagram

- Name: `P2020 component landscape`
- Version: `1.0.0`
- `notationId`: Archimate 3.1
- `nodeId`: Application Component P2020 (`7a80a09f-b44e-4c1f-94b4-d6c726ffa765`)
- Layout: P2020 сверху по центру; site слева; mcp справа; papirus под P2020; arepos внизу

## Implementation mechanism (MCP tools, ensure* update)

Plan: [`docs/superpowers/plans/2026-08-04-p2020-component-landscape.md`](../plans/2026-08-04-p2020-component-landscape.md)

1. **Discovery:** `search_catalog` → `search_model` (P2020 reuse) → `search_notation` (имена component/relation).
2. **Nodes:** `ensure_node(modelId, parentNodeId, name, notationId, componentName="Application Component")` → `{node, created}` (binding только на create).
3. **Links:** `ensure_link(..., notationId, relationName)` → `{link, created}`.
4. **Diagram:** `ensure_diagram(modelId, name, notationId, nodeId)` → `{diagram, created}`; затем `add_diagram_instances` (`modelNodeId` / `modelLinkId`).
5. **Docs (required):** `list_wiki` → `create_wiki` или `update_wiki` на diagram + pointer на node P2020.
6. **Idempotency:** повторный прогон предпочитает ensure*; `create_node` / `create_diagram` / `batch_save_model` — escape hatch.
7. Модель `wArchi` не трогать при `model_not_allowed`.

## Out of scope

- Декомпозиция Vue-модулей (models / notations / types / …)
- Внутренние модули arepos / papirus
- Business/Technology layer
- Flow parallel to Serving
- Изменение существующих диаграмм LemanaPro (кроме целевой)

## Acceptance

- В дереве под P2020 видны 4 новых Application Component
- 4 связи Aggregation / Serving / Association как в таблице
- Диаграмма `P2020 component landscape` в Archimate 3.1 показывает 5 компонентов и связи
- P2020 на диаграмме — существующий узел, не дубликат
- Wiki диаграммы (и pointer на node) читается через `get_wiki`
