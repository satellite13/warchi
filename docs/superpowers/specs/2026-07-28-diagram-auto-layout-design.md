# Diagram auto-layout rewrite (ELK)

Date: 2026-07-28  
Status: approved design

## Goal

Заменить текущее авторазмещение нод на диаграмме модели (наивная сетка `√n`, игнорирующая рёбра) на графовый layout через **elkjs**, чтобы диаграмма не превращалась в «кашу» из пересекающихся связей.

## Problem

`ModelDiagramCanvas.autoLayoutNodes` расставляет инстансы в сетку по индексу, без учёта `instances.edges`. Papirus `AutoLayout.applyGridLayout` — то же самое. После кнопки рёбра пересекаются хаотично.

## Decisions

| Тема | Решение |
|------|---------|
| Движок | **elkjs** (ELK), не dagre / d3-dag / свой Sugiyama |
| Где код | **warchi** (`src/features/models/layout/`), не papirus |
| Режимы | два: полная перестройка + убрать наложения |
| Scope | выделение → только оно; без выделения → вся диаграмма |
| Вложенность | compound по **геометрии** (bounds) |
| Направление layered | **авто** по ориентации рёбер (RIGHT vs DOWN) |
| Рёбра | ноды **и** маршруты из ELK → `attrs.controlPoints` |
| Бандл | dynamic import + Web Worker |

## Scope

**In:**
- Кнопка авторазмещения в редакторе модели (toolbar split/dropdown)
- Режим «Авторазмещение» — ELK Layered + orthogonal edges
- Режим «Убрать наложения» — ELK SPOrE Overlap Removal (+ orthogonal edges)
- Конвертация `DiagramAttrs` ↔ ELK graph / layout result
- i18n ru/en, undo одним шагом, fitToView, toast при ошибке
- Unit-тесты на graph build / apply / direction / scope

**Out (v1):**
- Notation editor `autoLayoutComponents` / papirus `AutoLayout`
- Ports-aware ELK (якоря/порты — layout от сторон нод без точного port model)
- Анимация перестановки
- Выбор направления вручную в UI

## Architecture

```
ModelEditorHeader (dropdown)
  → ModelEditor / ModelDiagramCanvas
    → runDiagramLayout({ mode, diagram, selectedIds })
      → diagramLayoutGraph.toElk(...)
      → dynamic import('elkjs') + worker
      → diagramLayoutGraph.applyElk(...)
    → emit('updateDiagram') + fitToView
```

### Modules

1. `src/features/models/layout/diagramLayoutGraph.ts`
   - `buildElkGraph(nodes, edges, options)` → ELK JSON
   - `applyElkLayout(diagram, elkResult, scopeIds)` → обновлённый `DiagramAttrs`
   - geometric compound: parent = наименьший по area контейнер, в чьи bounds нода полностью входит
   - ELK bend points → `edge.attrs.controlPoints` (как в `diagramCanvasSync`)

2. `src/features/models/layout/runDiagramLayout.ts`
   - `mode: 'layered' | 'overlap'`
   - resolve scope (selection ∪ needed ancestors policy — см. ниже)
   - auto direction for layered
   - load elkjs once (cached promise), run layout, return attrs or error

3. UI: `ModelEditorHeader` — split button / dropdown вместо одной кнопки  
   Events: `auto-layout-nodes` (layered), `auto-layout-tidy` (overlap)  
   `ModelDiagramCanvas` экспортирует оба метода (или один с `mode`).

### Dependency

- `elkjs` (EPL-2.0 OR GPL-3.0-or-later — совместимо с AGPL через GPL secondary)
- Import: API + worker (`elk-api` + `elk-worker.min.js` via `new URL(..., import.meta.url)`), не обязательно весь `elk.bundled` в main chunk

## Modes

### Full rebuild (`layered`)

```
elk.algorithm: layered
elk.direction: RIGHT | DOWN   // auto
elk.edgeRouting: ORTHOGONAL
elk.layered.spacing.nodeNodeBetweenLayers: ~48
elk.spacing.nodeNode: ~40
```

**Auto direction:** по рёбрам в scope взять векторы центр→центр; если медиана \|dx\| ≥ медиана \|dy\| → `RIGHT`, иначе `DOWN`.

Disconnected components: ELK packing по умолчанию.

### Tidy (`overlap`)

```
elk.algorithm: sporeOverlap   // org.eclipse.elk.sporeOverlap
elk.edgeRouting: ORTHOGONAL
```

Цель — убрать наложения с минимальным сдвигом. Рёбра тоже получают новый orthogonal route из ELK.

Если overlap-only окажется недостаточным на практике — follow-up: опциональный `sporeCompaction`; в v1 не усложняем UI.

## Scope rules

1. Если есть selected node instances → layout set = selection.
2. Иначе → все node instances диаграммы.
3. Edges in ELK: только те, у кого **оба** конца в layout set.
4. **Compound v1:** строить parent/child только среди нод **внутри layout set**. Геометрический контейнер вне selection **не** создаёт compound-границу и **не** двигается.
5. Ноды вне layout set не меняют `x/y/width/height`; их рёбра (если один конец вне set) не трогаем.

## Edge mapping

- Input: `sourceInstanceId` / `targetInstanceId` → ELK edge `sources`/`targets`.
- Output: section bend points ELK (без endpoints) → `attrs.controlPoints: {x,y}[]`.
- Пустой список bends → удалить `controlPoints` (как в sync при empty polyline).
- Path type на canvas: editable polyline / orthogonal — сохранить совместимость с тем, как canvas уже читает `controlPoints` (`readControlPointsFromAttrs`).

## UI / UX

- Toolbar: одна зона авторазмещения с двумя действиями:
  - «Авторазмещение» / «Auto-layout»
  - «Убрать наложения» / «Remove overlaps»
- Disabled при отсутствии активной диаграммы или read-only.
- Undo: один `updateDiagram` со всем набором изменений.
- После успеха: `fitToView` по затронутому rect (или всей диаграмме при full scope).
- Пока грузится elk / считается layout: busy на кнопке.
- Ошибка загрузки/layout: toast, attrs не менять.

## Edge cases

| Case | Behavior |
|------|----------|
| 0 или 1 нода в scope | no-op (можно только fit) |
| Нода в нескольких контейнерах | parent = минимальная area |
| Cycles | ELK layered cycle breaking — ok |
| Self-loops | оставить ELK; controlPoints писать только если есть bends |
| 200+ nodes | worker + busy indicator |
| Sticky / diagram-only / containers | обычные ноды в графе; containers — candidates for compound parents |

## Testing

Vitest (mock `elk.layout`):

1. Nested bounds → корректный `children` tree.
2. Auto direction: horizontal-ish vs vertical-ish edge sets.
3. `applyElkLayout` пишет `x/y` и `controlPoints`.
4. Scope: selected subset не двигает остальных.
5. Mode maps to expected `elk.algorithm` option.

Manual:

1. Диаграмма со связями → layered даёт слои без сетки-каши.
2. Перекрытые ноды → tidy раздвигает, относительная география узнаваема.
3. Selection layout не двигает невыбранных.
4. Undo возвращает предыдущее состояние.
5. Контейнер с детьми (full scope) — дети остаются визуально внутри после layout.

## Verification checklist

- [ ] `elkjs` в dependencies, layout не в начальном bundle (lazy)
- [ ] Dropdown: два режима, i18n ru/en
- [ ] Layered + auto direction
- [ ] Overlap mode
- [ ] Selection / all scope
- [ ] Geometric compound within scope
- [ ] `controlPoints` from ELK
- [ ] Undo + fitToView + error toast
- [ ] Unit tests green
