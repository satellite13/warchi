# План: отдельный редактор форм и выбор формы в редакторе нотации

## Цель

Сейчас форма узла выбирается только из встроенного списка (rectangle, diamond, circle, beveled-rectangle, trapezoid, slanted-rectangle). Нужно:

1. **Редактор форм — отдельный раздел приложения** (как редактор типов `/types`): свой маршрут, свой экран со списком форм и редактированием одной формы. Пользователь создаёт и редактирует кастомные формы (прямоугольник + точки перелома, участки Bezier); формы сохраняются на бэкенде.
2. **Созданные формы доступны всем**: кастомные формы — глобальный каталог (не привязаны к конкретной нотации); любой пользователь может выбрать любую форму при настройке компонента в редакторе нотации или при отрисовке диаграммы модели.
3. **В редакторе нотации** (и в модельном редакторе) при настройке компонента форма выбирается из списка: встроенные формы + все кастомные формы из каталога.

Компонент хранит только ссылку на форму по id (`customShapeId`); контур не хранится в компоненте.

## Модель данных

### Контур формы (OutlineSegment)

Замкнутый контур в **нормализованных координатах** (0 ≤ x,y ≤ 1), масштабируется по ширине/высоте узла.

```ts
type OutlineSegment =
  | { type: 'line'; points: [[number, number], [number, number]] }
  | { type: 'bezier'; points: [[number, number], [number, number], [number, number], [number, number]] }

const DEFAULT_RECTANGLE_OUTLINE: OutlineSegment[] = [
  { type: 'line', points: [[0, 0], [1, 0]] },
  { type: 'line', points: [[1, 0], [1, 1]] },
  { type: 'line', points: [[1, 1], [0, 1]] },
  { type: 'line', points: [[0, 1], [0, 0]] }
]
```

### Кастомная форма (в глобальном каталоге)

```ts
interface CustomShapeDef {
  id: string
  name: string
  outline: OutlineSegment[]
  ownerId?: string  // кто создал; на бэкенде есть owner
}
```

### Где хранятся формы

Формы хранятся **на бэкенде** (arepos-server) как **глобальный каталог**: сущность node shape **без привязки к нотации** (нет FK на notation). У формы есть владелец (owner) — кто создал; список форм отдаётся **всем** (все созданные формы доступны для выбора любому пользователю). Редактировать и удалять может только владелец (или админ). Подробности — в разделе «Поддержка в бэкенде» ниже.

### Копирование контура в компонент при выборе формы

Чтобы удаление или изменение формы в каталоге не ломало уже созданные компоненты и диаграммы, при выборе кастомной формы **копируем контур в компонент** (в его diagramStyle), а не только ссылку.

В `DiagramStyle` (в attrs компонента):

- `nodeShape: string` — для встроенных форм значения `'rectangle' | 'diamond' | ...`; для кастомной — `'custom'`.
- **`customOutline?: OutlineSegment[]`** — **копия** контура на момент выбора формы. Используется при рендере; хранится в attrs компонента (вместе с остальным diagramStyle). Так компонент и диаграмма не зависят от того, удалили или изменили форму в каталоге.
- **`customShapeId?: string`** — опционально: id формы в каталоге (для отображения в UI «на основе формы X» и для возможной кнопки «Обновить форму из каталога» в будущем).

**Логика при выборе формы:** пользователь выбирает форму из каталога → в diagramStyle записываем `nodeShape = 'custom'`, **копируем** `shape.outline` в `customOutline`, при желании сохраняем `customShapeId = shape.id`.

**При рендере:** если `nodeShape === 'custom'` и задан **customOutline**, контур берётся из него (path/svgPath строятся из `customOutline`). Каталог для отрисовки не нужен. Если по какой-то причине customOutline нет (старые данные, миграция), можно fallback: разрешить по customShapeId из каталога или нарисовать прямоугольник.

## Поддержка в бэкенде (arepos-server)

Добавить сущность **кастомная форма узла** (node shape) и REST API по образцу **NodeTypes** (глобальный каталог, owner для прав записи, список доступен всем).

### Модель и БД

- **Сущность** (например `NodeShapes.kt` в `model/`):
  - `id: UUID` (PK)
  - `name: String`
  - `owner: Users` (ManyToOne, FK) — кто создал форму
  - `outline: String?` (JSONB, JSON-массив сегментов контура — формат `OutlineSegment[]`)
  - `createdAt`, `updatedAt`
  **Без связи с нотацией** — формы общие для всех. Без версионирования.

- **Миграция Liquibase** (например `015-add-node-shapes.sql`):
  - Таблица `node_shapes`: колонки `id` (uuid), `name`, `owner` (uuid, FK → users), `outline` (jsonb), `created_at`, `updated_at`.
  - Индекс по `owner` для фильтра «мои формы». Уникальность имени в рамках одного владельца (owner, name) — по желанию.
  - Аудит по аналогии с другими таблицами.

### Репозиторий и контроллер

- **Repository** (например `NodeShapesRepository.kt`): `JpaRepository<NodeShapes, UUID>`, методы `findByOwner(owner, pageable)`, `findAll(pageable)` (для списка «все формы»).
- **Controller** (например `NodeShapesController.kt`), путь `/api/v1/node-shapes` (по аналогии с [NodeTypesController](arepos-server/src/main/kotlin/ru/kavader/arepos/controller/NodeTypesController.kt)):
  - `GET /api/v1/node-shapes` — список всех форм (с пагинацией; опционально фильтр по ownerId, name). **Доступ на чтение — всем** авторизованным (чтобы любой мог выбрать форму в нотации).
  - `GET /api/v1/node-shapes/{id}` — одна форма по id (доступ всем на чтение).
  - `POST /api/v1/node-shapes` — создание (body: name, outline); owner = текущий пользователь. Только авторизованный пользователь.
  - `PUT /api/v1/node-shapes/{id}` — обновление (name, outline). Только владелец формы или админ.
  - `DELETE /api/v1/node-shapes/{id}` — удаление. Только владелец или админ.

### DTO и ответы

- Request: `NodeShapeRequest(name: String, outline: String?)` (без notationId).
- Response: `NodeShapeResponse(id, name, ownerId, outline, createdAt?, updatedAt?)` — фронт получает id, name, outline (и при необходимости ownerId для отображения «мои»).

## Архитектура по слоям (фронтенд)

### 1. Типы и загрузка каталога форм

- **notationAttrs.ts**: типы `OutlineSegment`, `CustomShapeDef`. В `DiagramStyle` добавить `customOutline?: OutlineSegment[]` (копия контура в компоненте) и `customShapeId?: string` (опциональная ссылка на форму в каталоге). В `normalizeDiagramStyle` при разборе attrs проверять и нормализовать `customOutline` (массив сегментов).
- **API (warchi)**: типы `NodeShapeResponse`, `NodeShapeRequest` в `types/api.ts` (без notationId); вызовы к `/api/v1/node-shapes` (GET список всех, GET /:id, POST, PUT, DELETE).
- **Каталог форм**: нужен для **выбора формы** в панели стиля (NodeStylePanel) и для опциональной кнопки «Обновить форму из каталога». Для **рендера** каталог не используется — контур берётся из копии в компоненте (customOutline). Composable `useNodeShapes()` или разовая загрузка списка при открытии панели стиля.

### 2. Построение Path2D и SVG из контура

- **Новый модуль** `src/utils/customOutlinePath.ts`:
  - `customOutlineToPath2D(segments: OutlineSegment[], width: number, height: number): Path2D`
  - `customOutlineToSvgPath(segments: OutlineSegment[], width: number, height: number): string`
  Масштабирование: (x, y) → (x * width, y * height). Обход сегментов: moveTo первого пункта, затем lineTo/bezierCurveTo, в конце closePath.

### 3. Редактор форм — отдельный раздел приложения (как редактор типов)

- **Маршрут и экран**: отдельный маршрут `/shapes` (аналогично `/types`), view [ShapesView.vue](warchi/src/views/ShapesView.vue) (по образцу [TypesView.vue](warchi/src/views/TypesView.vue)): шапка (AppHeader), основная часть с контентом, подвал (AppFooter). В основной части — страница редактора форм (аналог [TypeEditorPage.vue](warchi/src/features/types/TypeEditorPage.vue)): сайдбар со списком всех форм (загрузка через GET /api/v1/node-shapes), кнопка «Добавить форму», при выборе формы — форма редактирования (название + редактор контура). Сохранение и удаление через API (POST/PUT/DELETE) сразу, без привязки к сохранению нотации.
- **Навигация**: пункт «Формы» в главном меню (рядом с «Типы», «Нотации» и т.д.), переход по клику на `/shapes`.
- **Список форм**: сайдбар — список форм (название, опционально превью); фильтр «все» / «мои» по ownerId при желании. Кнопки: создать, редактировать выбранную, удалить выбранную (с проверкой прав на бэкенде).
- **Редактор одной формы**: правая часть (или модал) — поле «Название», компонент **редактора контура** (CustomOutlineEditor). Кнопки «Сохранить», «Удалить». Сохранение — сразу вызов PUT или POST к API; состояние списка обновляется после успешного ответа.

### 4. Выбор формы в редакторе нотации (и в модельном редакторе)

- **NodeStylePanel.vue**: в блоке выбора формы — объединённый список (встроенные + кастомные из каталога). **При выборе кастомной формы из каталога:** записывать `nodeShape = 'custom'`, **копировать** `shape.outline` в `diagramStyle.customOutline`, при желании `customShapeId = shape.id`. При выборе встроенной формы: `customShapeId` и `customOutline` удалить.
  При загрузке стиля узла: для кастомной формы показывать выбранную запись по наличию `customOutline` или `customShapeId` (если есть customShapeId, в списке можно подсветить «на основе формы X» по каталогу).
- **Тип ComponentShape**: расширить на `'custom'` (форма определяется по сохранённому контуру `customOutline`).

### 5. Рендер и экспорт

- **useNotationDiagram.ts** и **ModelDiagramCanvas.vue**: при создании узла по форме компонента:
  - если `nodeShape === 'custom'` и в diagramStyle есть **customOutline**, контур берётся **из него** (без обращения к каталогу): `customOutlineToPath2D(ds.customOutline, w, h)` и `customOutlineToSvgPath(ds.customOutline, w, h)`. Так удаление или изменение формы в каталоге не влияет на уже созданные компоненты и диаграммы.
  - если `nodeShape === 'custom'` но customOutline нет (старые данные): опционально разрешить по customShapeId из каталога; иначе fallback на прямоугольник.
  Каталог форм при рендере не обязателен — он нужен только для выбора формы в панели стиля и для опциональной кнопки «Обновить из каталога».

### 6. Редактор контура (используется внутри редактора форм)

Один компонент (например `CustomOutlineEditor.vue`): приём/возврат `OutlineSegment[]` (modelValue / update:modelValue). Холст в нормализованных координатах; фаза 1 — полигон (вставка/перемещение/удаление точек на прямоугольнике); фаза 2 — переключение сегмента в Bezier и редактирование контрольных точек. Используется только в экране редактирования одной формы, не в NodeStylePanel.

## Use case: владелец формы удалил или изменил её (при копировании контура в компонент)

**Сценарий:** Пользователь 1 создал кастомную форму. Пользователь 2 создал нотацию, добавил компонент и выбрал эту форму — в компонент при выборе **скопировался контур** (customOutline в diagramStyle). Затем пользователь 1 удаляет или изменяет форму в каталоге.

**При хранении копии контура в компоненте:**

- **Форма удалена:** Рендер берёт контур из `diagramStyle.customOutline`; каталог не используется. Узел на диаграмме модели (и в редакторе нотации) продолжает отображаться **как раньше** — с тем контуром, который был скопирован при выборе. Удаление формы в каталоге на уже созданные компоненты **не влияет**.
- **Форма изменена:** Аналогично: у компонента своя копия контура (customOutline), рендер не обращается к каталогу. Диаграмма **не меняется** — User 2 по-прежнему видит ту форму, которую выбирал. Если в будущем добавить кнопку «Обновить форму из каталога» (по customShapeId), пользователь сможет сознательно подставить актуальный контур из каталога.

**Итог:** Копирование контура в компонент при выборе формы **развязывает** проблему удаления и модификации: диаграммы и компоненты стабильны, каталог влияет только на момент выбора (и опционально на действие «обновить из каталога»).

## Порядок реализации

1. **Бэкенд (arepos-server)**: сущность NodeShapes **без notation** (только owner, name, outline); миграция 015; репозиторий (findAll, findByOwner); контроллер (GET list — все, GET /:id, POST, PUT, DELETE с проверкой: запись только владелец/админ, чтение — все).
2. **Фронт — типы и API**: типы `OutlineSegment`, `CustomShapeDef`; в `DiagramStyle` — `customShapeId`; типы и вызовы API для node-shapes (без notationId). Composable `useNodeShapes()` (или аналог) для загрузки и кэширования списка всех форм.
3. Модуль `customOutlinePath.ts` (Path2D + svgPath по сегментам).
4. **Отдельный раздел «Редактор форм»**: маршрут `/shapes`, ShapesView, страница по образцу TypeEditorPage (сайдбар со списком форм из API, форма редактирования выбранной формы, CRUD сразу через API). Пункт «Формы» в главном меню.
5. UI выбора формы в NodeStylePanel: объединённый список (встроенные + формы из useNodeShapes / каталога), запись nodeShape и customShapeId.
6. Интеграция рендера: useNotationDiagram и ModelDiagramCanvas — ветка `nodeShape === 'custom'` + разрешение контура по customShapeId из загруженного каталога форм.
7. Компонент CustomOutlineEditor: полигон (точки перелома), затем при необходимости Bezier.

## Схема потока данных

```mermaid
flowchart TB
  subgraph shapes_section [Раздел Формы /shapes]
    ShapesView[ShapesView]
    ShapeList[Список форм]
    ShapeForm[Редактор формы]
    COE[CustomOutlineEditor]
    ShapesView --> ShapeList
    ShapesView --> ShapeForm
    ShapeForm --> COE
  end
  subgraph notation_editor [Редактор нотации]
    NodeStylePanel[NodeStylePanel]
    NodeStylePanel --> ShapeDropdown[Выбор: встроенные + каталог форм]
  end
  subgraph catalog [Глобальный каталог]
    API[node-shapes API]
    Cache[useNodeShapes cache]
    API <--> Cache
  end
  subgraph render [Рендер диаграмм]
    ND[useNotationDiagram]
    MC[ModelDiagramCanvas]
    COP[customOutlinePath]
    DiagramStyle[diagramStyle.customOutline]
    DiagramStyle --> COP
    COP --> ND
    COP --> MC
  end
  ShapeForm --> API
  ShapeDropdown --> Cache
  ShapeDropdown --> DiagramStyle
```

Итог: формы хранятся на бэкенде как **глобальный каталог**, **доступны всем** на чтение; создаются и правятся в **отдельном разделе** «Формы» (`/shapes`). При выборе формы для компонента в компонент **копируется контур** (customOutline); удаление или изменение формы в каталоге не влияет на уже созданные компоненты и диаграммы. Отрисовка и экспорт используют контур из копии в компоненте (customOutline).
