# План: Составная метка из кастомных свойств

## Контекст

Сейчас метка узла на диаграмме — это просто `component.name`. Нужно добавить возможность задать шаблон метки вида `${name} — ${status}`, где плейсхолдеры подставляются из имени компонента и его кастомных свойств. Шаблон хранится в `DiagramStyle`, поддерживается только для узлов (не связей).

## Синтаксис шаблона

- `${name}` — зарезервировано, подставляет имя компонента
- `${<propertyName>}` — значение кастомного свойства по имени (без префикса)
- Если шаблон пуст или не задан — используется `name` (текущее поведение)
- Если свойство не найдено — плейсхолдер заменяется на пустую строку
- Пример: `${protocol}://${name}:${port}`

## Изменения

### 1. Тип `DiagramStyle` — добавить поле `labelTemplate`
**Файл**: `src/features/notations/notationAttrs.ts`
- Добавить `labelTemplate?: string` в тип `DiagramStyle`
- Добавить нормализацию в `normalizeDiagramStyle()`

### 2. Функция резолва шаблона
**Файл**: `src/features/notations/composables/useNotationDiagram.ts`
- Добавить функцию `resolveLabelTemplate(template: string, name: string, customProperties: CustomProperty[]): string`
- Заменяет `${name}` на имя компонента
- Заменяет `${X}` на `defaultValue` кастомного свойства с именем X
- Использовать регулярку `/\$\{(\w+)\}/g`

### 3. Модифицировать `buildNodeLabel`
**Файл**: `src/features/notations/composables/useNotationDiagram.ts`
- Передавать `DiagramStyle` и `customProperties` в функцию
- Если `ds.labelTemplate` задан — вызвать `resolveLabelTemplate`, иначе использовать `name`

### 4. Обновить создание и синхронизацию узлов
**Файл**: `src/features/notations/composables/useNotationDiagram.ts`
- В `createComponentNode` (~строка 379): передать `customProperties` при вызове `buildNodeLabel`
- В синхронизации узлов (~строка 453): при обновлении `existing.label` тоже применять шаблон

### 5. UI: textarea на панели стилей (NodeStylePanel)
**Файл**: `src/features/notations/components/NodeStylePanel.vue`
- Добавить `const labelTemplate = ref("")`
- Добавить обработчик `handleLabelTemplateChange`
- Добавить textarea в секцию «Метка» для узлов (после имени)
- Добавить загрузку из `DiagramStyle` в `loadNodeProps`
- Добавить в `emitNodeStyle()`

### 6. Доработка Papirus: поддержка `editableText` в TextLabel
**Файл**: `../papirus/src/elements/TextLabel.ts`
- Добавить опциональное поле `editableText?: string` в `TextLabelOptions`
- В `TextLabel` хранить `editableText` отдельно от `text`

**Файл**: `../papirus/src/core/InteractionManager.ts`
- В `handleDoubleClick` (~строка 471): использовать `label.editableText ?? label.text` как начальное значение для inline-редактора
- В `finishInlineLabelEdit` (~строка 634): при commit обновлять `editableText` (а не `text`), чтобы Warchi мог перехватить изменение через `history.on('change')` и пересобрать составную метку

**Файл**: `src/features/notations/composables/useNotationDiagram.ts`
- При создании узла с `labelTemplate` — передавать `editableText: component.name` в `TextLabelOptions`
- При синхронизации — обновлять и `text` (составная метка), и `editableText` (имя)
- В `detectLabelChanges` — читать `editableText` для обновления `component.name`

### 7. UI: textarea на панели свойств (CustomPropertiesPanel)
**Файл**: `src/features/notations/components/CustomPropertiesPanel.vue`
- Добавить сворачиваемую секцию «Составная метка» между секцией «Теги» и «Свойства»
- Textarea для ввода/редактирования шаблона метки (placeholder: `${name} — ${status}`)
- Значение хранится в `selectedItem.parsedAttrs.diagramStyle.labelTemplate`
- При изменении — помечать элемент как `_isDirty` и вызывать `onItemChanged`
- Показывать превью результата подстановки под textarea (readonly, вычисляется из текущего `name` и `customProperties`)

## Проверка

1. `npm run build` — проверить отсутствие ошибок типов
2. `npm run test` — запустить тесты
3. `npm run dev` — открыть редактор нотации, выбрать компонент, задать шаблон метки, убедиться что текст на диаграмме обновляется
