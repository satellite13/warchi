# Layout preview modal (ELK)

Date: 2026-07-28  
Status: approved design  
Related: `2026-07-28-diagram-auto-layout-design.md`

## Goal

Перед применением ELK-раскладки показывать модалку с упрощённым эскизом и настройками, чтобы пользователь видел результат и мог подкрутить опции без порчи основной диаграммы.

## Problem

Кнопки «Авторазмещение» / «Убрать наложения» сразу пишут attrs на канвас. ELK часто даёт неожиданную картинку; undo/dirty уже чинили отдельно, но выбора «применить или нет» нет. Плюс две кнопки дублируют то, что логичнее выбрать как режим внутри одного диалога.

## Decisions

| Тема | Решение |
|------|---------|
| UI | Одна кнопка toolbar → модалка |
| Режимы | В модалке: Layered / Убрать наложения (sporeOverlap) |
| Сравнение | Toggle «Было» ↔ «Станет» (одна область) |
| Эскиз | Упрощённый SVG (прямоугольники + линии), не Papirus |
| Настройки | Основные + accordion «Расширенные» |
| Пересчёт эскиза | Только по кнопке «Обновить предпросмотр» |
| Scope | **Всегда вся диаграмма** (selection игнорируется) |
| Apply | Один history-шаг; до OK основной канвас не меняется |
| Рёбра после layout | bends → `editable-polyline` + `controlPoints`; без bends → `straight`, без `controlPoints` |

## Scope

**In:**
- Заменить две toolbar-кнопки на одну «Авторазмещение»
- `LayoutPreviewModal`: режим, настройки, toggle, SVG-эскиз, Обновить / Отмена / Применить
- `runDiagramLayout` принимает override ELK options (+ mode)
- Edge type policy при apply (и в after-attrs для эскиза)
- i18n ru/en, busy/error toast
- Unit-тесты: options override, edge type policy, sketch geometry helper

**Out (v1):**
- Selection-scoped layout
- Live debounce пересчёта
- Papirus / полный стиль в модалке
- localStorage / серверные пресеты
- Сырой key→value список всех ELK options
- Анимация перестановки на основном канвасе

## UI

```
┌─ Авторазмещение ─────────────────────────── × ─┐
│ ┌─ settings ──┐  ┌─ preview ─────────────────┐ │
│ │ Режим       │  │ [Было] [Станет]           │ │
│ │ ○ Слои      │  │ ┌───────────────────────┐ │ │
│ │ ○ Overlap   │  │ │   SVG sketch          │ │ │
│ │             │  │ └───────────────────────┘ │ │
│ │ Основные    │  │ [Обновить предпросмотр]   │ │
│ │ direction…  │  └───────────────────────────┘ │
│ │ spacing…    │                                │
│ │ edge route  │                                │
│ │ Расширенные▸│                                │
│ └─────────────┘                                │
│                     [Отмена]  [Применить]      │
└────────────────────────────────────────────────┘
```

- Открытие: snapshot `before = clone(diagram.attrs)`; сразу один layout с дефолтами → начальный `after` (чтобы «Станет» не пустой).
- Пока идёт layout: disable Обновить/Применить, индикатор на Обновить.
- Esc / Отмена: закрыть без изменений канваса.
- Применить: `history.execute({ before → after })` + `syncDiagram` + `fitToView`; dirty как при обычном layout apply (undo с чистого состояния снимает dirty — уже сделано).

## Settings

### Основные

| Поле | Layered | Overlap |
|------|---------|---------|
| Направление | Авто / RIGHT / DOWN / LEFT / UP | скрыто |
| Отступ нод | `elk.spacing.nodeNode` (40) | то же |
| Отступ слоёв | `elk.layered.spacing.nodeNodeBetweenLayers` (48) | скрыто |
| Рёбра | Orthogonal / Polyline → `elk.edgeRouting` | то же |

### Расширенные

- Layered: `elk.padding`, crossing minimization strategy (короткий enum), edge–node spacing
- Overlap: доп. spacing; опциональный флаг compaction (`sporeCompaction`) default off

Смена режима сбрасывает нерелевантные поля к дефолтам режима. Значения живут только пока модалка открыта (без persist в v1).

## Edge mapping (уточнение к auto-layout)

Для каждого ребра, попавшего в ELK-результат:

1. Если есть `bendPoints` → `attrs.controlPoints` + `diagramStyle.edgeType = 'editable-polyline'` (даже если раньше был bezier/straight/polyline).
2. Если bends нет → удалить `controlPoints`, поставить `edgeType = 'straight'`.
3. Не оставлять `bezier` после успешного layout apply.

Эскиз «Станет» рисует те же attrs (прямоугольники нод, ломаные/прямые по controlPoints или start–end).

## Architecture

```
ModelEditorHeader (одна кнопка auto-layout)
  → ModelEditor открывает LayoutPreviewModal
       before snapshot
       on Update / on open: runDiagramLayout({ diagram: before, mode, options })
         → diagramLayoutGraph + elkLoader (как сейчас)
       LayoutSketchSvg({ attrs, view: before|after })
       on Apply → canvas.applyLayoutResult(after) / history command
```

### Modules

1. `src/features/models/components/LayoutPreviewModal.vue` — UI
2. `src/features/models/layout/layoutSketch.ts` — SVG geometry из `DiagramAttrs` (fit viewBox)
3. `src/features/models/layout/layoutOptions.ts` — типы UI-опций → `ElkLayoutOptions`
4. Расширить `runDiagramLayout` / `applyElkLayout` — options override + edge type policy
5. Toolbar/i18n: одна кнопка; убрать вторую tidy-кнопку (режим внутри модалки)

`ModelDiagramCanvas` больше не вызывает layout сразу из toolbar; Apply идёт через тот же history helper (`suppressHistoryCanvasPersist` / `dirty: false` on undo), что и текущий auto-layout.

## Edge cases

| Case | Behavior |
|------|----------|
| &lt;2 нод | noop: toast / сообщение в модалке, Применить disabled |
| ELK error | toast, `after` не заменить |
| Read-only | кнопка toolbar disabled |
| Правки на канвасе при открытой модалке | v1: `before` зафиксирован при открытии; Apply пишет поверх текущего parsedAttrs через after (пользователь сам закрывает модалку если правил параллельно) |

## Testing

1. Options → ELK `layoutOptions` mapping
2. applyElkLayout: bends → editable-polyline; no bends → straight
3. layoutSketch: viewBox и сегменты рёбер
4. Modal integration (лёгкий): Update меняет after; Cancel не вызывает apply

Manual: открыть → Станет виден → сменить spacing → Обновить → Применить → undo.

## Verification checklist

- [ ] Одна кнопка авторазмещения в header
- [ ] Модалка: режим, основные + расширенные, toggle, SVG, Обновить
- [ ] Scope = вся диаграмма
- [ ] Apply / Cancel / undo / dirty
- [ ] Edge type policy
- [ ] Unit tests green, i18n ru/en
