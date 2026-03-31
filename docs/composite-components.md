# Composite-компоненты: заметки по реализации

Документ фиксирует актуальную (на `0.5.0`) модель composite-компонентов в `warchi` для разработчиков.

## Что изменилось

- Вместо ручного редактирования patch-JSON добавлен UI-редактор composite-структуры и A5-биндингов.
- В Model Editor для composite-нод появился отдельный стиль-слой экземпляра с действиями восстановления из нотации.
- Биндинги текста и иконок теперь применяются согласованно между notation/runtime и palette model editor.

## Базовая структура

Composite-узел хранится как дерево `compositeContent` с типами:

- `container`
- `text`
- `icon`
- `divider`
- `shape`

Редактирование выполняется через:

- `CompositeTreeEditor.vue` (структура и иерархия),
- `CompositeNodeInspector.vue` (свойства узла по типу),
- `CompositeLivePreview.vue` (предпросмотр).

## Style Property Bindings (A5)

Биндинги применяются к `diagramStyle.stylePropertyBindings` и состоят из групп:

1. источник значения (`component` или `nodeType`) + имя свойства;
2. список веток `when`;
3. список `patch` для целевых узлов (`targetId`) или для внешнего контейнера (`__compositeOuter__`).

Операторы `when`, поддерживаемые рантаймом:

- `equals`
- `contains`
- `matchesRegex`
- `isEmpty`
- `isNotEmpty`
- `is`
- `range`
- `lt`
- `lte`
- `gt`
- `gte`

Рантайм-применение выполняется в `src/features/notations/utils/compositeBindings.ts`:

- `applyStylePropertyBindings(...)` — вычисляет совпавшие ветки и merge-ит patch в дерево/outer;
- `injectCompositeNameAndIcon(...)` — подставляет имя ноды в текст иконку нотации в `icon`-узлы;
- `resolveCompositeBoundIconName(...)` — извлекает связанную иконку для использования в палитре.

## Рекомендации по поддержке

- Сначала изменять структуру `compositeContent`, затем добавлять A5-правила.
- Новые поля биндингов добавлять вместе с тестами `compositeBindings.test.ts`.
- При добавлении нового типа composite-узла обновлять одновременно:
  - типы в `notationAttrs.ts`,
  - инспектор `CompositeNodeInspector.vue`,
  - дерево/превью/редакторы patch.
