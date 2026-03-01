# Интерактивные кастомные свойства компонентов на диаграмме

Добавление возможности помечать кастомные свойства компонентов как «интерактивные» (внешняя ссылка, переход на диаграмму, документ и т.д.) с выбором иконки; на диаграмме у узлов с заполненными такими полями в левом верхнем углу рисуются кликабельные иконки, по клику выполняется действие (открытие URL, переход на диаграмму и т.д.).

## Текущее состояние

- **Компоненты нотаций** хранят в `attrs` (JSON) список `customProperties` ([notationAttrs.ts](src/features/notations/notationAttrs.ts)) — тип `CustomProperty` (id, name, type, required, defaultValue и т.д.). Нет флага «интерактивное» или типа действия.
- **Узлы модели** хранят значения этих свойств в `parsedAttrs.componentProperties[notationId][componentId]`; при отрисовке узла на диаграмме используются `getNodeComponentCustomProperties(modelNodeId)` и `getNodeScopedPropertyValues(modelNodeId)` ([ModelDiagramCanvas.vue](src/features/models/components/ModelDiagramCanvas.vue)).
- **Papirus**: узлы (`Node`) рисуют label, icon (один), порты; клик обрабатывается в `SelectionManager.handleClick` — `getElementAtPoint` возвращает узел/ребро/группу, затем выполняется select. Нет концепции «бейджей» или подэлементов с отдельным кликом.

## Архитектура решения

```mermaid
flowchart LR
  subgraph notation [Редактор нотации]
    CP[CustomProperty]
    CP --> interactive[interactive, interactiveKind, interactiveIcon]
  end
  subgraph model [Модель / диаграмма]
    Node[Узел модели]
    Node --> values[componentProperties]
    values --> filled[заполненные интерактивные поля]
  end
  subgraph papirus [Papirus]
    DiagramNode[Node]
    DiagramNode --> badges[badges]
    badges --> draw[рисунок в top-left]
    badges --> hitTest[hitTest badge]
  end
  subgraph warchi_canvas [ModelDiagramCanvas]
    createInstanceNode --> badges
    nodeBadgeClick --> action[URL / diagram / document]
  end
  filled --> createInstanceNode[createInstanceNode]
  hitTest --> nodeBadgeClick[renderer nodeBadgeClick]
```

1. **Схема (нотация)**: расширить `CustomProperty` полями «интерактивное», тип действия, иконка.
2. **UI редактора компонентов**: в [CustomPropertiesPanel.vue](src/features/notations/components/CustomPropertiesPanel.vue) для каждого свойства — чекбокс «Показывать на диаграмме как кнопку», выбор типа действия (URL, диаграмма, документ и т.д.), выбор иконки (список/селект из Material или `/icons/`).
3. **Papirus**: в базовый `Node` добавить опциональные `badges: Array<{ id: string; iconUrl: string }>`, отрисовка в левом верхнем углу (несколько иконок в ряд), метод `getBadgeAtPoint(point): { id: string; index: number } | null`, в `hitTest` не учитывать бейджи (клик по бейджу обрабатывается отдельно). В `SelectionManager.handleClick`: если под точкой узел и `node.getBadgeAtPoint(point)` не null — вызвать `renderer.emit('nodeBadgeClick', node.id, badge.id)` и выйти без смены выделения. Добавить событие `nodeBadgeClick` в `DiagramEvents`.
4. **warchi**: в `createInstanceNode` для каждого интерактивного свойства компонента, у которого у данного узла заполнено значение, добавить в `badges` элемент с `id: property.id`, `iconUrl` из свойства или дефолт; при синхронизации узла обновлять `node.badges`. Подписаться на `renderer.on('nodeBadgeClick', (nodeId, badgeId) => ...)`: по `nodeId` взять instanceId/modelNodeId, по badgeId — property id, взять значение из `componentProperties`, выполнить действие в зависимости от `interactiveKind` (открыть URL в новой вкладке, переход на диаграмму по id, открыть документ и т.д.).

## Детали реализации

### 1. Расширение типа CustomProperty (warchi)

**Файл:** [src/features/notations/notationAttrs.ts](src/features/notations/notationAttrs.ts)

- В тип `CustomProperty` добавить опциональные поля:
  - `interactive?: boolean`
  - `interactiveKind?: 'url' | 'diagram' | 'document'` (или строковый union для расширяемости)
  - `interactiveIcon?: string` (имя иконки из `/icons/`, например `link`, `open_in_new`, `description`)
- В `normalizeCustomProperties` и в `serializeEntityAttrs` (через `stripInternalFlags` не трогать эти поля) читать/писать эти поля.

### 2. UI в редакторе компонентов (warchi)

**Файл:** [src/features/notations/components/CustomPropertiesPanel.vue](src/features/notations/components/CustomPropertiesPanel.vue) (и при необходимости [PropertyRow.vue](src/features/types/components/PropertyRow.vue))

- В строке свойства (или в раскрывающихся опциях свойства) добавить:
  - Чекбокс «Интерактивное на диаграмме» → `interactive: true/false`.
  - При `interactive === true`: выбор типа действия (select: url / diagram / document) → `interactiveKind`, выбор иконки (select по списку имён из `/public/icons/` или фиксированный набор) → `interactiveIcon`.
- i18n: ключи для «Интерактивное», «Тип действия», «Иконка», варианты URL / Диаграмма / Документ.

### 3. Papirus: бейджи на узле

**Файлы:** Papirus (репозиторий papirus)

- **src/elements/Node.ts** (и типы в `NodeOptions`):
  - В `NodeOptions` добавить опциональное `badges?: Array<{ id: string; iconUrl: string }>`.
  - В классе `Node`: поле `_badges: Array<{ id: string; iconUrl: string }>`, сеттер/геттер `badges`, при set — `markDirty()`.
  - Константы: размер бейджа (например 16×16), отступ от угла, шаг между бейджами. Рисовать в `renderContents` (или отдельный `renderBadges`) в левом верхнем углу узла (в локальных координатах контента/inset), используя те же приёмы, что и для NodeImage (загрузка SVG/картинки или drawImage). Порядок: слева направо.
  - Метод `getBadgeAtPoint(point: Point): { id: string; index: number } | null`: точка в мировых координатах; перевести в локальные относительно узла, проверить попадание в прямоугольники бейджей (по тем же размерам/позициям, что и при рисовании); вернуть первый попавший бейдж (индекс и id).
- **DiagramRenderer.ts**: в `DiagramEvents` добавить `nodeBadgeClick: [nodeId: string, badgeId: string]`.
- **SelectionManager.ts**: в `handleClick` после `getElementAtPoint(point)`:
  - если `element` — экземпляр `Node` и у узла есть метод `getBadgeAtPoint` и `(element as Node).getBadgeAtPoint(point)` возвращает `{ id, index }`, то вызвать `this.renderer.emit('nodeBadgeClick', element.id, id)` и `return` (без смены выделения).

Экспорт типа для опций бейджа (если нужен в warchi) — через `index.ts`.

### 4. ModelDiagramCanvas: передача бейджей и обработка клика (warchi)

**Файл:** [src/features/models/components/ModelDiagramCanvas.vue](src/features/models/components/ModelDiagramCanvas.vue)

- Ввести функцию `getInteractiveBadgesForInstance(instance: DiagramNodeInstance): Array<{ id: string; iconUrl: string }>`:
  - взять modelNodeId, component по привязке нотации;
  - из `parseEntityAttrs(component.attrs)` взять `customProperties`;
  - из `getNodeScopedPropertyValues(modelNodeId)` взять значения;
  - для каждого свойства, у которого `interactive === true` и значение не пустое (строка/число — в зависимости от типа), добавить в массив `{ id: property.id, iconUrl: buildIconUrl(property.interactiveIcon ?? 'link') }`.
- В `createInstanceNode(instance)` в `commonOptions` (или в опции, которые Papirus уже поддерживает для узла) передавать `badges: getInteractiveBadgesForInstance(instance)`.
- В `syncDiagram` при обновлении существующего узла (in-place) выставлять `existing.badges = getInteractiveBadgesForInstance(instance)` (если в Papirus у Node есть setter `badges`).
- При инициализации рендерера подписаться на `renderer.on('nodeBadgeClick', (nodeId, badgeId) => { ... })`:
  - по `nodeId` из `nodeIdToInstance` получить `modelNodeId` и `instanceId`;
  - по компоненту узла и `badgeId` найти свойство в `customProperties`, получить `interactiveKind` и значение из `componentProperties`;
  - выполнить действие:
    - `url`: `window.open(value, '_blank')` (значение — строка URL);
    - `diagram`: переход на диаграмму (например, эмит в родителя или `router.push` с id диаграммы/модели — уточнить формат хранения id диаграммы в значении);
    - `document`: открыть документ (аналогично существующей логике `documentFileId` / DocumentEditorModal).

### 5. Действия по типам (уточнение)

- **url**: значение свойства — строка URL; открыть в новой вкладке.
- **diagram**: значение — id диаграммы (или модели + id диаграммы). В приложении переход к редактированию этой диаграммы (текущий контекст — модель; нужен роут/эмит для перехода на диаграмму по id).
- **document**: значение — UUID файла документа; открыть модальное окно документа (как для узла/диаграммы с `documentFileId`).

Иконки: использовать существующие в `/public/icons/` (например `link`, `open_in_new`) или Material Symbols; в плане — единый механизм `buildIconUrl(iconName)` как для палитры.

## Порядок работ

1. **notationAttrs**: расширить `CustomProperty` и нормализацию/сериализацию.
2. **CustomPropertiesPanel**: UI для interactive, interactiveKind, interactiveIcon.
3. **Papirus**: Node.badges (опции, отрисовка, getBadgeAtPoint), DiagramEvents.nodeBadgeClick, SelectionManager.handleClick — эмит nodeBadgeClick при клике по бейджу.
4. **ModelDiagramCanvas**: getInteractiveBadgesForInstance, передача badges в createInstanceNode и при sync, подписка на nodeBadgeClick и выполнение действий (url / diagram / document).
5. **i18n**: ключи для новых подписей и опций.

## Риски и упрощения

- **Papirus**: если не хочется трогать ядро, альтернатива — рисовать «бейджи» в warchi поверх канваса (HTML-слой с позиционированием по worldToScreen и обновлением при pan/zoom). Это усложнит синхронизацию и скролл. Рекомендация: реализовать бейджи в Node в Papirus для единообразия и корректного hit-test.
- Переход на диаграмму: если в модели нет явного «id диаграммы» в одном поле, можно договориться, что значение интерактивного свойства типа diagram хранит id диаграммы (UUID или составной ключ); в первом варианте достаточно перейти на маршрут редактора модели с открытой этой диаграммой.
