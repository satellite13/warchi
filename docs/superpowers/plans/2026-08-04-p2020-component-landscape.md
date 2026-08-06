# P2020 Component Landscape Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Создать в LemanaPro под P2020 ArchiMate-диаграмму продуктового контура wArchi (5 Application Component + 4 связи + wiki) через idempotent convenience tools wArchi MCP.

**Architecture:** Discovery через `search_catalog` / `search_model` / `search_notation`; узлы — `ensure_node`; связи — `ensure_link`; диаграмма — `ensure_diagram` + `add_diagram_instances`; описание — `create_wiki`. Повторный прогон плана безопасен (ensure* возвращают `{…, created}`). `batch_save_model` / `create_node` / `create_diagram` — только escape hatch.

**Tech Stack:** wArchi MCP → arepos REST; нотация Archimate 3.1; модель LemanaPro.

**Spec:** [`docs/superpowers/specs/2026-08-04-p2020-component-landscape-design.md`](../specs/2026-08-04-p2020-component-landscape-design.md)

---

## MCP tool map (обновлено)

| Шаг | Tool | Зачем |
|-----|------|--------|
| Найти модель / нотацию | `search_catalog` | Slim hits |
| Найти P2020 (reuse) | `search_model` | directory + Application Component |
| Имена component/relation | `search_notation` | точные имена / id при ambiguous |
| Узлы продуктов | `ensure_node` ×4 | find-or-create по modelId+parentNodeId+name |
| Связи | `ensure_link` ×4 | find-or-create + notation relation binding |
| Диаграмма | `ensure_diagram` | find-or-create по modelId+name |
| Canvas | `add_diagram_instances` | upsert nodes/edges по modelNodeId/modelLinkId |
| Документация | `create_wiki` | diagram (+ node P2020); перед create — `list_wiki` |
| Проверка | `get_diagram`, `list_wiki` / `get_wiki` | Acceptance |

**Предпочитать:** `ensure_node` / `ensure_link` / `ensure_diagram` вместо `create_*` + ручного search на дубли.

**Не использовать без нужды:** полный `list_nodes`; ручные `notationComponents`/`notationRelations`; `batch_save_model` для этого сценария; `force=true`.

**Замечания ensure*:**
- `ensure_node`: match = `modelId` + `parentNodeId` + `name` (case-insensitive). Binding `notationId+componentName` применяется **только на create**; hit не мутирует. Несколько matches → `409 AMBIGUOUS_NODE`.
- `ensure_diagram`: match = `modelId` + `name` → latest non-deleted. Hit **не** обновляет notation/nodeId/attrs.
- `ensure_link`: direction-strict; concurrent dual-create может race (нет DB unique).
- Wiki: отдельного `ensure_wiki` нет — перед `create_wiki` проверить `list_wiki`.

---

## Constants

```text
modelId:    9e449958-1168-4c73-aa47-b197f10ef7a2   # LemanaPro
notationId: eb174cb9-371d-400a-b34f-b47c0824ed12   # Archimate 3.1
parentDir:  82115c21-3e0f-4bb6-ae46-7383420ad24e   # Directory P2020 — bind diagram here (tree expands folders)
p2020Node:  7a80a09f-b44e-4c1f-94b4-d6c726ffa765   # Application Component (on canvas)
diagramName: P2020 component landscape
diagramId:  91956327-6a4e-4d37-a0b8-37d9b51ea957
```

Имена связей подтвердить через `search_notation` (часто `Aggregation relation`, `Serving relation`, `Association relation`).

---

### Task 1: Discovery

**Files:** none (MCP only)

- [ ] **Step 1:** `search_catalog` `q=LemanaPro` `kinds=models`
- [ ] **Step 2:** `search_catalog` `q=Archimate` `kinds=notations`
- [ ] **Step 3:** `search_model` `q=P2020` `kinds=nodes` → подтвердить `parentDir` + `p2020Node` (Application Component)
- [ ] **Step 4:** `search_notation` `q=Application Component` `kinds=components`
- [ ] **Step 5:** `search_notation` `q=Aggregation` / `Serving` / `Association` `kinds=relations` → точные `relationName` (или `relationId` при ambiguous)

Ручной pre-search по papirus/arepos/диаграмме **не обязателен** — это делают ensure*.

---

### Task 2: Ensure Application Component nodes

**Files:** none (MCP `ensure_node`)

Для `papirus`, `arepos-server`, `warchi-mcp`, `warchi-site`:

```text
ensure_node(
  modelId,
  name=<name>,
  parentNodeId=<parentDir>,
  notationId=<notationId>,
  componentName="Application Component"   # или componentId
)
→ { node, created }
```

- [ ] **Step 1–4:** ensure 4 узлов; сохранить `node.id`
- [ ] **Step 5:** при `created=false` — reuse id (не создавать дубликат)
- [ ] **Step 6:** при `AMBIGUOUS_NODE` — разобрать hits через `search_model` / `get_node`, выбрать нужный id вручную и продолжить без второго create

---

### Task 3: Ensure model links

**Files:** none (MCP `ensure_link`)

| source | target | relationName (после search_notation) |
|--------|--------|--------------------------------------|
| p2020Node | papirus | Aggregation relation |
| arepos-server | p2020Node | Serving relation |
| arepos-server | warchi-mcp | Serving relation |
| warchi-site | p2020Node | Association relation |

```text
ensure_link(
  modelId, sourceId, targetId,
  notationId,
  relationName="<exact name>"
)
→ { link, created }
```

- [ ] **Step 1–4:** ensure 4 связей; сохранить `link.id`
- [ ] **Step 5:** повторный вызов → `created=false`, тот же id — ок

---

### Task 4: Ensure diagram + place instances

**Files:** none (MCP `ensure_diagram`, `add_diagram_instances`)

```text
ensure_diagram(
  modelId,
  name="P2020 component landscape",
  notationId,
  nodeId=parentDir,   # Directory — в UI диаграммы висят под папкой, не под Application Component
  version="1.0.0"   # only used on create
)
→ { diagram, created }
```

Если hit и у диаграммы другой `notationId`/`nodeId` — **не** полагаться на silent fix (ensure не обновляет). Проверить `get_diagram`; при неверном binding — `update_diagram`.

- [ ] **Step 1:** `ensure_diagram` → `diagramId`
- [ ] **Step 2:** `add_diagram_instances` с layout:

| modelNode | x | y | width | height |
|-----------|---|---|-------|--------|
| warchi-site | 40 | 40 | 160 | 70 |
| P2020 | 280 | 40 | 160 | 70 |
| warchi-mcp | 520 | 40 | 160 | 70 |
| papirus | 280 | 200 | 160 | 70 |
| arepos-server | 280 | 320 | 160 | 70 |

```text
nodesJson = [ { modelNodeId, x, y, width, height }, ... ]
edgesJson = [ { modelLinkId }, ... ]   # endpoints auto-resolve
```

- [ ] **Step 3:** при `DIAGRAM_CONFLICT` — `get_diagram` → повторить с `baseUpdatedAt`
- [ ] **Step 4:** `get_diagram` — 5 nodes + 4 edges в instances

**Не использовать** `batch_save_model` / `create_diagram` для этого шага (кроме отладки).

---

### Task 5: Wiki description (required)

**Files:** none (MCP `list_wiki`, `create_wiki` / `update_wiki`, `get_wiki`)

- [ ] **Step 1:** `list_wiki` `diagramId=…` — если wiki есть → `update_wiki`, иначе `create_wiki`  
      Markdown: цель; таблица компонентов; Aggregation / Serving / Association; источники репозиториев
- [ ] **Step 2:** `list_wiki` `nodeId=p2020Node` — create или update короткий pointer на диаграмму
- [ ] **Step 3:** `get_wiki` — контент читается
- [ ] **Step 4:** если storage недоступен — явно сообщить; модель/диаграмму не откатывать

---

### Task 6: Acceptance

- [ ] **Step 1:** повторный прогон Task 2–4 даёт `created=false` и те же ids (smoke idempotency)
- [ ] **Step 2:** 4 связи нужных relation types
- [ ] **Step 3:** диаграмма Archimate 3.1, `nodeId=p2020Node`, canvas полный
- [ ] **Step 4:** wiki на diagram (и node) доступна
- [ ] **Step 5:** отчёт: ids узлов / связей / диаграммы / wiki fileIds + флаги created

---

## Rollback

- Только сущности с `created=true` в этом прогоне: `delete_link` / `delete_node`
- Диаграмму с `created=true` — не трогать чужие; delete path если доступен
- Wiki: не удалять без запроса

## Out of scope

- Код приложений (только данные модели)
- Декомпозиция Vue-модулей
- Модель `wArchi` при `model_not_allowed`
- Auto-layout tool (координаты задаём явно в `add_diagram_instances`)
- Композитный `upsert_diagram_from_spec` (ещё нет в MCP)
