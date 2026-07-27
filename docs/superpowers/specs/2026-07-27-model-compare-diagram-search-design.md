# Model compare: searchable diagram select

Date: 2026-07-27  
Status: approved design (pending implementation plan)

## Goal

На экране сравнения моделей (`/models/:id/compare`) сделать выбор поля **Диаграмма** через существующий `SearchableSelect`, чтобы при большом числе диаграмм можно было искать по вхождению в имя.

## Scope

**In:**
- `ModelVisualCompareView.vue` — только селектор диаграммы в `#topbar-extra`

**Out:**
- Селекторы версий слева/справа
- `DiagramVersionsCompareView`
- Изменения API / backend
- Новые UI-компоненты

## Design

Заменить native `<select v-model="diagramName">` на `SearchableSelect` из `@/components/forms/SearchableSelect.vue`.

- `modelValue` / `v-model`: текущий `diagramName` (имя диаграммы, как сейчас)
- `options`: computed из `diagramNames` → `{ id: name, label: name }[]`
- Placeholders:
  - `searchPlaceholder`: `t('common.search')`
  - `emptyText`: `t('common.nothingFound')`
  - `placeholder`: текущий label контекста или пустая строка (значение уже выбрано обычно)
- Фильтрация: встроенная в `SearchableSelect` — `includes` по `label`/`id`, case-insensitive
- Стили: при необходимости лёгкий `:deep` / class, чтобы контрол влезал в `.ddc-pick` как соседние селекты (по образцу других экранов с `SearchableSelect` в компактной панели)

Поведение выбора диаграммы (latest по имени на каждой стороне, загрузка canvas) не меняется.

## Verification

1. Открыть `/models/<id>/compare` с моделью, у которой много диаграмм.
2. В поле «Диаграмма» открыть список, ввести фрагмент имени — список сужается.
3. Выбор пункта обновляет оба canvas как раньше.
4. Пустой поиск показывает все имена; нет совпадений → `common.nothingFound`.
