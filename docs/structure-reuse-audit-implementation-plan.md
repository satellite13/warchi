# Structure, Duplication & Reuse Audit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` or `superpowers:executing-plans`.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Снизить структурный долг frontend wArchi: убрать god-файлы и кросс-импорты
между фичами, унифицировать list-detail CRUD (shapes ↔ validation-scripts) и
переиспользуемые UI-блоки (модалки, share, API keys, custom properties), не меняя
продуктовое поведение.

**Architecture:** Два семейства редакторов сохраняются:

- **A (deep editor):** models / notations — Catalog → canvas; shared UI/utils
  уходят из `features/notations` в нейтральные слои (`components/`, `domain/`,
  `features/diagram*`).
- **B (list-detail):** types / shapes / validation-scripts — общий shell уже есть;
  доводим до одного CRUD-паттерна (composable + Sidebar + Form + Aside).

Sandbox валидационных/diagram-скриптов получает нейтральный контракт состояния и
перестаёт быть циклом `models ↔ validation-scripts`.

**Tech Stack:** Vue 3 / TypeScript / Vitest (только warchi). arepos-server и papirus
не меняем.

**Источник аудита:** ревью на `master` @ `04018089` (Release v0.25.7), фокус —
структура, дублирование, переиспользуемость компонентов.

---

## Правила выполнения

- Ветка только в **warchi**. Имя волны: `feat/structure-reuse-<wave-id>`
  (например `feat/structure-reuse-wave-0-boundaries`).
- Каждый task: failing/updating test → implement → указанные тесты → commit.
- **Поведение UI и API не менять**, кроме явно отмеченных cleanup (удаление
  мёртвого API, тонких обёрток).
- Не смешивать волны в одном PR: каждая волна — отдельный PR с зелёными тестами.
- Не трогать сгенерированные файлы (`materialSymbolsOutlinedNames.generated.ts`).
- Не делать «большой bang» распил `ModelEditor.vue` в одном PR — только
  инкрементально по подзадачам волны 3.
- После каждой волны: `npm run lint` на затронутых путях + focused Vitest +
  при необходимости `npm run build` (vue-tsc).

## Зафиксированные решения (не открывать заново)

1. **Два семейства редакторов остаются.** Не пытаться втянуть models/notations в
   `ListDetailEditorLayout`.
2. **Types — эталон семейства B.** Shapes и validation-scripts подтягиваем к
   паттерну types (`Page` тонкий, логика в `composables/`, Form вынесена).
3. **Shared attrs остаются в `domain/attrs`.** Новые shared schema/parse helpers
   (outline и т.п.) — туда же или в `domain/`, не в feature.
4. **`diagram` / `diagram-style` — shared runtime** под `features/`; их могут
   импортировать models и notations. Обратные импорты из `diagram-style` в
   `notations/*` запрещены после волны 0.
5. **`IconToolbar` — shared UI** → `src/components/layout/` (или `components/toolbar/`).
6. **Sandbox scripts** — нейтральный snapshot/editor-state contract; models
   зависят от sandbox, sandbox не зависит от `ModelEditor.vue` / конкретных
   editor types models (только от узкого контракта).
7. **`DocumentEditorModal` переводится на `BaseModal`** (или общий ModalShell),
   а не наоборот.
8. **Тонкие обёртки удаляем:** `AdminAlert`, `CollapseSection` (если только rename
   props), `useCustomProperties` (инлайн validate в call site).
9. **Empty states и FormSection** — унификация medium-приоритета; не блокирует
   волны 0–2.
10. **CompactEntityRow** остаётся home-only; не тащить в editor kit.

## Карта долга (сводка аудита)

### God-файлы

| Строк | Файл | Волна |
|------:|------|-------|
| ~4805 | `features/models/ModelEditor.vue` | 3 |
| ~4235 | `features/models/components/ModelDiagramCanvas.vue` | 3 |
| ~2963 | `features/diagram-style/components/NodeStylePanel.vue` | 4 (опц.) |
| ~1489 | `features/models/components/ModelTreePalettePanel.vue` | 3/4 |
| ~1480 | `features/models/components/ModelImportWizard.vue` | 4 (опц.) |
| ~1298 | `features/notations/NotationEditorPage.vue` | 4 (опц.) |

### Кросс-импорты feature → feature

| Откуда | Куда | Целевое место |
|--------|------|---------------|
| models, diagram-style | `notations/utils/validationIssues` | `diagram-style/utils` или `domain/` |
| models | `notations/utils/notationElementBuilders` | `features/diagram/utils` |
| models | `notations/utils/analyzeImportIconGaps` | `features/diagram/utils` или shared import utils |
| models headers/toolbar | `notations/layout/IconToolbar` | `components/layout` |
| NotationsCatalog | `models/composables/useModelPackage` | shared export util / notations-local |
| models ↔ validation-scripts sandbox | циклические типы | нейтральный contract |

### Зеркальные дубли семейства B

- `ShapeEditorPage` ≈ `ValidationScriptEditorPage`
- `ShapeSidebar` ≈ `ValidationScriptSidebar`
- `useNodeShapes` ≈ `useValidationScripts`
- Types custom props ≠ `useCustomPropertyEditor`

### UI-дубли

- ShareAccess ≈ BatchShare (form)
- ApiKeysSection list ≈ AdminUserApiKeys list
- DocumentEditorModal vs BaseModal
- Create/Rename footer vs Delete/Confirm `#footer`
- Inline create-diagram name/version vs `NameVersionForm`
- Model dirty-diagram switch vs `UnsavedChangesModal`

---

## Волны и зависимости

```
Wave 0  Boundaries & shared moves          (без UX-изменений)
   │
   ├─► Wave 1  List-detail CRUD unification (shapes/scripts → types pattern)
   │
   ├─► Wave 2  Shared UI extractions        (modals, share, api keys, props)
   │
   └─► Wave 3  ModelEditor decomposition    (зависит от 0; желательно после 2 для модалок)
          │
          └─► Wave 4  Optional polish       (NodeStylePanel, empty states, FormSection)
```

Волны 1 и 2 можно вести параллельно после завершения волны 0.
Волна 3 **требует** волну 0 (иначе переносы файлов ломают импорты mid-split).
Волна 4 — только если остаётся бюджет; не блокирует закрытие аудита.

---

## Метрики успеха (Definition of Done аудита)

После волн 0–3:

- [ ] Нет импортов `features/diagram-style` → `features/notations/*`
- [ ] Нет импортов `features/models` → `features/notations/layout/IconToolbar`
- [ ] Sandbox не импортирует `ModelEditor.vue` / широкие models editor types;
      только нейтральный contract
- [ ] `ShapeEditorPage` / `ValidationScriptEditorPage` ≤ ~200 строк оркестрации;
      логика в composables; Form вынесена у scripts
- [ ] `ModelEditor.vue` без inline create-node / create-diagram / dirty-switch /
      choice-list модалок (вынесены в компоненты)
- [ ] Один `ShareGrantForm` для ShareAccess + BatchShare
- [ ] Один `ApiKeyList` для profile + admin
- [ ] `DocumentEditorModal` на `BaseModal`
- [ ] Types используют `useCustomPropertyEditor`
- [ ] Удалены `AdminAlert` и тонкая `useCustomProperties`
- [ ] `npm run test` + `npm run build` зелёные
- [ ] Нет регрессии i18n (ru/en ключи сохранены или перенесены без потери)

Ориентир по размеру (не жёсткий gate): `ModelEditor.vue` < 3500 строк после волны 3
(дальнейший распил — follow-up).

---

## Wave 0 — Boundaries & shared moves

**Цель:** нейтрализовать shared-утилиты и UI, убрать вредные cross-feature edges
без изменения поведения.

**Ветка:** `feat/structure-reuse-wave-0-boundaries`

### Task 0.1: Ветка

**Files:** нет

- [ ] Создать ветку `feat/structure-reuse-wave-0-boundaries` от актуального `master`
- [ ] Убедиться, что papirus/arepos не переключаются

### Task 0.2: Перенести `IconToolbar`

**Files:**

- Move: `src/features/notations/layout/IconToolbar.vue`
  → `src/components/layout/IconToolbar.vue` (или `src/components/toolbar/IconToolbar.vue`)
- Update imports in:
  - `features/models/components/ModelEditorHeader.vue`
  - `features/models/composables/useModelToolbarState.ts` (тип `ToolbarButton`, если оттуда)
  - `features/models/components/DiagramCanvasSettings.vue` (если импортирует)
  - `features/notations/**` consumers
- Update / move tests рядом с новым путём

- [ ] Перенести файл + тест
- [ ] Обновить все импорты (grep `IconToolbar` / `notations/layout`)
- [ ] `npx vitest run` по затронутым тестам header/toolbar
- [ ] Commit: `refactor: move IconToolbar to shared components`

### Task 0.3: Перенести `validationIssues` / composite style validation

**Files:**

- Move: `src/features/notations/utils/validationIssues.ts` (+ test)
  → `src/features/diagram-style/utils/validationIssues.ts` (предпочтительно)
  или `src/domain/diagramStyleValidation.ts`, если нет зависимости от Vue
- Update: `NodeStylePanel.vue`, `CompositeStylePanel.vue`, notations consumers

- [ ] Перенести + обновить импорты
- [ ] Прогнать `validationIssues` tests + style panel tests при наличии
- [ ] Commit: `refactor: move diagram style validation out of notations`

### Task 0.4: Перенести `notationElementBuilders` и icon-gap utils

**Files:**

- Move builders: `notations/utils/notationElementBuilders.ts` (+ test)
  → `features/diagram/utils/diagramElementBuilders.ts` (имя согласовать с содержимым)
- Move: `notations/utils/analyzeImportIconGaps.ts` (+ test)
  → `features/diagram/utils/` или `features/import-utils/` (если появится папка;
  иначе `diagram/utils`)
- Update: `models/utils/diagramCanvasBuilders.ts`, `models/utils/missingPackageIcons.ts`,
  notations import/export paths

- [ ] Перенести, оставить re-export-shim в старом пути **только на время волны**,
      если слишком много call sites — удалить shim в конце волны 0
- [ ] Grep старых путей = 0 в конце волны
- [ ] Commit: `refactor: move diagram builders and icon-gap utils to shared diagram`

### Task 0.5: Отвязать NotationsCatalog от `useModelPackage`

**Files:**

- Modify: `src/features/notations/NotationsCatalog.vue`
- Extract: `downloadNotationExport` (или аналог) в
  `src/features/notations/utils/notationExportDownload.ts`
  либо общий `src/utils/packageDownload.ts`, если код реально общий с models

- [ ] Вынести функцию без импорта из `features/models`
- [ ] Models продолжают использовать свой путь; DRY только если тела идентичны
- [ ] Commit: `refactor: stop notations catalog importing models package helpers`

### Task 0.6: Нейтральный contract для script sandbox

**Files:**

- Create: `src/features/validation-scripts/sandbox/editorStateContract.ts`
  (минимальные типы: то, что сейчас тянется из models types —
  `EditorDiagram`-like snapshot fields, команды, apply targets)
- Modify sandbox files, currently importing models types / `modelScopedApi` /
  `useDiagramHistoryBatcher` / `modelAttrs`
- Modify: `ModelEditor.vue` / models adapters — адаптер models → contract

**Правило:** sandbox импортирует только contract + собственные snapshot builders.
Models импортируют sandbox и передают адаптер. Цикл типов рвётся.

- [ ] Зафиксировать список текущих импортов sandbox → models (grep)
- [ ] Вынести минимальный contract
- [ ] Перевести sandbox на contract; models — thin adapter
- [ ] Прогнать:
  ```bash
  npx vitest run src/features/validation-scripts
  ```
  плюс связанные models tests при падении типов
- [ ] Commit: `refactor: introduce neutral editor state contract for script sandbox`

### Task 0.7: Закрытие волны 0

- [ ] Grep-гейты:
  ```bash
  rg "features/notations" src/features/diagram-style -g '*.ts' -g '*.vue'
  rg "notations/layout/IconToolbar" src
  rg "from '@/features/models" src/features/validation-scripts/sandbox
  rg "useModelPackage" src/features/notations
  ```
  Ожидание: пусто (или только документированные allowlist, если остались).
- [ ] `npm run lint` / focused tests / `npm run build`
- [ ] PR: `refactor(wave-0): neutralize cross-feature shared boundaries`

---

## Wave 1 — List-detail CRUD unification

**Цель:** shapes и validation-scripts как types: тонкий Page, composables, Form,
общий resource CRUD helper.

**Ветка:** `feat/structure-reuse-wave-1-list-detail`
**Зависит от:** Wave 0 (желательно; жёстко — только если sandbox/contract затронут
scripts page).

### Task 1.1: Generic `usePagedResourceCrud`

**Files:**

- Create: `src/composables/usePagedResourceCrud.ts`
- Create: `src/composables/usePagedResourceCrud.test.ts`
- Refactor: `src/composables/useNodeShapes.ts`
- Refactor: `src/composables/useValidationScripts.ts`

API-скелет (уточнить по фактическим сигнатурам):

```ts
export function usePagedResourceCrud<TListItem, TDetail, TCreate, TUpdate>(options: {
  listPath: string
  detailPath: (id: string) => string
  // create/update/remove paths + mappers
  afterMutation?: () => void // e.g. shapes invalidate scale catalog
})
```

- [ ] Тесты на list/detail/create/update/remove + afterMutation
- [ ] Тонкие обёртки `useNodeShapes` / `useValidationScripts` сохраняют публичный API
- [ ] Commit: `refactor: extract usePagedResourceCrud for shapes and scripts`

### Task 1.2: `useShapeEditor` по образцу `useTypeEditor`

**Files:**

- Create: `src/features/shapes/composables/useShapeEditor.ts`
- Create: `src/features/shapes/composables/useShapeEditor.test.ts`
- Modify: `src/features/shapes/ShapeEditorPage.vue` — оставить layout + wiring

Перенести из Page: fetch/select, local fields, `isDirty`, `canEditSelected`,
owner display names, create/save/delete, share hooks, outline parse orchestration
(parse сам — см. 1.4).

- [ ] Page становится оркестратором слотов `ListDetailEditorLayout`
- [ ] Существующие shape tests обновить / добавить composable tests
- [ ] Commit: `refactor(shapes): extract useShapeEditor from page`

### Task 1.3: Вынести ValidationScript Form + `useValidationScriptEditor`

**Files:**

- Create: `src/features/validation-scripts/composables/useValidationScriptEditor.ts`
  (+ test)
- Create: `src/features/validation-scripts/components/ValidationScriptForm.vue`
- Modify: `ValidationScriptEditorPage.vue`, sidebar без изменений контракта

- [ ] Form получает header через `EditorFormHeader`, как ShapeForm/TypeForm
- [ ] Aside (`ValidationScriptApiHelpPanel`) остаётся слотом layout
- [ ] Commit: `refactor(validation-scripts): extract editor composable and form`

### Task 1.4: Единый outline parse

**Files:**

- Extend: `src/domain/attrs/...` или create `src/domain/attrs/outline.ts`
- Remove local `parseOutlineJson` from `ShapeEditorPage` / `useShapeEditor`
- Align: `notations/utils/outlinesEquivalent.ts` — использовать domain parse
- Keep geometry editor logic in `shapes/outlineGeometry.ts`

- [ ] Одна реализация parse; equivalent/geometry остаются отдельно
- [ ] Tests outlinesEquivalent + shape editor
- [ ] Commit: `refactor: share outline parse in domain attrs`

### Task 1.5: Locale-aware entity sort helper

**Files:**

- Create: `src/utils/localeSort.ts` (+ test)
- Use in: TypeSidebar, ShapeSidebar, ValidationScriptSidebar, NotationComponentList

- [ ] Заменить копипасту `localeCompare` + `ru`/`en`
- [ ] Commit: `refactor: extract locale-aware entity sort helper`

### Task 1.6 (optional same wave): сблизить Sidebars shapes/scripts

**Files:**

- Optionally extract `ResourceSidebar.vue` props: `items`, `filterKeys`, `icon`, i18n
- Or оставить два тонких файла, если после composable они <100 строк и читаемы

- [ ] Решение: extract только если после 1.2–1.3 дубль шаблона всё ещё >~40 строк
- [ ] Commit при extract: `refactor: shared resource sidebar for list-detail editors`

### Task 1.7: Закрытие волны 1

- [ ] Сравнить структуру папок types/shapes/validation-scripts — симметрия
- [ ] `npx vitest run src/features/shapes src/features/validation-scripts src/features/types src/composables`
- [ ] PR: `refactor(wave-1): unify list-detail CRUD for shapes and scripts`

---

## Wave 2 — Shared UI extractions

**Цель:** убрать UI-клоны модалок, share, API keys, custom properties; выровнять
footer/модалки.

**Ветка:** `feat/structure-reuse-wave-2-shared-ui`
**Зависит от:** Wave 0 не обязателен; можно параллельно с Wave 1.

### Task 2.1: `DocumentEditorModal` → `BaseModal`

**Files:**

- Modify: `src/components/modals/DocumentEditorModal.vue`
- Modify: `src/components/modals/DocumentEditorModal.test.ts` (создать/обновить)
- Verify: `BaseModal.vue` API (slots title/body/footer, escape, overlay click)

- [ ] Удалить собственный overlay/focus/escape
- [ ] Визуально сохранить размеры/классы контента через props/class на BaseModal
- [ ] Commit: `refactor: host DocumentEditorModal on BaseModal`

### Task 2.2: Унифицировать Entity Create/Rename на `#footer`

**Files:**

- Modify: `EntityCreateModal.vue`, `EntityRenameModal.vue` (+ tests)

- [ ] Кнопки в слот `#footer` как у Delete/Confirm
- [ ] Проверить keyboard navigation BaseModal
- [ ] Commit: `fix: put entity create/rename actions in BaseModal footer`

### Task 2.3: `ShareGrantForm`

**Files:**

- Create: `src/components/modals/ShareGrantForm.vue` (+ test)
- Modify: `ShareAccessModal.vue`, `BatchShareModal.vue`

Форма: toggle «все пользователи» / email + Find / VIEW|EDIT / results list.
Batch оставляет список ресурсов снаружи формы.

- [ ] Один BEM-блок или props `classPrefix` — предпочтительно один BEM
- [ ] Commit: `refactor: extract ShareGrantForm for access and batch share`

### Task 2.4: `ApiKeyList`

**Files:**

- Create: `src/components/profile/ApiKeyList.vue` (или `components/api-keys/`)
- Optional: `useApiKeysList.ts` для load/revoke/error
- Modify: `ApiKeysSection.vue`, `AdminUserApiKeys.vue`

- [ ] List/empty/loading/revoke общие; create/plaintext/rename остаются в profile;
      admin refresh/revoked badge — слоты/props
- [ ] Commit: `refactor: share ApiKeyList between profile and admin`

### Task 2.5: Types → `useCustomPropertyEditor`

**Files:**

- Modify: `src/features/types/composables/useTypeEditor.ts`
- Modify: `src/composables/useCustomPropertyEditor.ts` — удалить мёртвый
  `updateEnumValues` **или** делегировать в `PropertyRow` (выбрать одно;
  не оставлять dead export)
- Delete: `src/features/notations/composables/useCustomProperties.ts` thin wrapper —
  call sites импортируют `useCustomPropertyEditor` + локальный validate

- [ ] Types add/remove идут через shared composable
- [ ] Commit: `refactor: use shared custom property editor in types`

### Task 2.6: Удалить тонкие обёртки

**Files:**

- Delete/inline: `AdminAlert.vue` → все admin views на `AppAlert`
- Delete/inline: `CollapseSection` wrapper если есть
- Update tests

- [ ] Grep `AdminAlert` / `CollapseSection` = 0
- [ ] Commit: `refactor: remove thin AdminAlert and CollapseSection wrappers`

### Task 2.7: Create-diagram → `NameVersionForm`

**Files:**

- Modify: `ModelEditor.vue` (или вынесенный CreateDiagramModal из волны 3 —
  если волна 3 ещё не сделана, заменить inline fields здесь)
- Prefer: если CreateDiagramModal уже выделен — править его

- [ ] Name+version через `NameVersionForm`; notation через `SearchableSelect`
- [ ] Commit: `refactor: reuse NameVersionForm for create diagram`

### Task 2.8: Закрытие волны 2

- [ ] Модалки/share/api-keys/types props tests green
- [ ] PR: `refactor(wave-2): extract shared modals share form and api key list`

---

## Wave 3 — ModelEditor decomposition

**Цель:** уменьшить `ModelEditor.vue` выносом модалок и оркестрации без смены UX.
`ModelDiagramCanvas` — отдельными подзадачами, не одним PR.

**Ветка:** `feat/structure-reuse-wave-3-model-editor`
**Зависит от:** Wave 0 (обязательно). Wave 2 желателен для NameVersion/Unsaved.

### Task 3.1: Инвентаризация секций ModelEditor

**Files:** docs only update in this plan checklist / short comment in PR

- [ ] Составить список template-блоков модалок и script-секций (script-run, conflict,
      import, toolbar wiring, diagram dirty switch) с номерами строк на момент старта
- [ ] Зафиксировать целевые файлы ниже; не начинать перенос без списка

### Task 3.2: Вынести create-node / create-diagram модалки

**Files:**

- Create: `src/features/models/components/modals/CreateModelNodeModal.vue`
- Create: `src/features/models/components/modals/CreateModelDiagramModal.vue`
- Modify: `ModelEditor.vue`
- Tests: component или существующие editor tests

- [ ] Props/emits явные; CreateDiagram использует `NameVersionForm` (см. 2.7)
- [ ] Commit: `refactor(models): extract create node and diagram modals`

### Task 3.3: Dirty diagram switch → `UnsavedChangesModal`

**Files:**

- Modify: `ModelEditor.vue`
- Verify: `UnsavedChangesModal.vue` variant `save-or-discard` (или расширить props
  третьей кнопкой **только если** текущий UX трёхкнопочный и Unsaved не покрывает)

- [ ] Удалить локальный BaseModal dirty-switch, если Unsaved покрывает сценарий
- [ ] Если нужен третий action — расширить UnsavedChangesModal один раз, не копировать
- [ ] Commit: `refactor(models): reuse UnsavedChangesModal for diagram switch`

### Task 3.4: Choice-list / note / migrate / trash-conflict модалки

**Files:**

- Create under `src/features/models/components/modals/`:
  - `ChoiceListModal.vue` (если ещё нет shared)
  - `DiagramNoteModal.vue` / migrate / trash-conflict — по инвентаризации
- Modify: `ModelEditor.vue`

- [ ] По одной модалке = один commit при большом объёме
- [ ] Commit(s): `refactor(models): extract … modal from ModelEditor`

### Task 3.5: Orchestration composables из Page script

**Files (ориентир):**

- Create: `src/features/models/composables/useModelEditorScriptRun.ts`
  (wiring sandbox run modal — использует contract из 0.6)
- Create: `src/features/models/composables/useModelEditorConflictUi.ts`
  (batch-save conflict reload/force UI state)
- Modify: `ModelEditor.vue` — только вызов composables

- [ ] Не переносить доменную логику, уже лежащую в save/live-sync composables
- [ ] Только UI-orchestration, которая сейчас раздувает Page
- [ ] Commit: `refactor(models): extract script-run and conflict UI orchestration`

### Task 3.6: Первый распил `ModelDiagramCanvas` (узкий)

**Files:**

- Identify 1–2 самодостаточных куска (context menu / overlay HUD / selection
  bridge) по инвентаризации
- Create components under `features/models/components/diagram/`
- Modify: `ModelDiagramCanvas.vue`

- [ ] Не рефакторить рендер-пайплайн papirus в этой волне
- [ ] Один вертикальный срез с тестами
- [ ] Commit: `refactor(models): extract … from ModelDiagramCanvas`

### Task 3.7: Закрытие волны 3

- [ ] `ModelEditor.vue` без перечисленных inline-модалок
- [ ] Строк меньше ориентира 3500 (зафиксировать число в PR)
- [ ] `npx vitest run src/features/models`
- [ ] PR: `refactor(wave-3): decompose ModelEditor modals and orchestration`

---

## Wave 4 — Optional polish (не блокирует DoD)

**Ветка:** `feat/structure-reuse-wave-4-polish`

### Task 4.1: `FormSection` / shared empty

- [ ] `FormSection.vue` или utility CSS для `.form-section*` из TypeForm/ShapeForm
- [ ] Заменить локальные `*-empty` на `EmptyState` там, где смысл совпадает
- [ ] Не насиловать уникальные empty (wiki, matrix) ради единообразия

### Task 4.2: Matrix filters shell

- [ ] Общий shell для `RelationMatrixFilters` / `RelationRulesMatrixFilters`

### Task 4.3: `DropdownSelectPanel` styles

- [ ] Общая разметка/стили Teleport-panel для SearchableSelect + MultiSelect
  (логика уже в `useDropdownPanel`)

### Task 4.4: Слить MainPanelLayout wrappers

- [ ] Один конфигурируемый wrapper вместо Model/Notation MainPanelLayout

### Task 4.5: Дальнейший распил NodeStylePanel / ImportWizard / NotationEditorPage

- [ ] Только при отдельном продуктовом запросе; не смешивать с DoD аудита

---

## Тестовая стратегия по волнам

| Волна | Минимум |
|-------|---------|
| 0 | unit на перенесённые utils; validation-scripts sandbox; grep-гейты границ |
| 1 | usePagedResourceCrud; shape/script/type editor composables; outline parse |
| 2 | DocumentEditorModal; ShareGrantForm; ApiKeyList; EntityCreate/Rename footer; types props |
| 3 | models modals; Unsaved diagram switch; models suite regression |
| 4 | точечные UI tests |

Команды-якоря:

```bash
npm run lint
npx vitest run src/composables src/components src/features/shapes \
  src/features/validation-scripts src/features/types src/features/notations \
  src/features/diagram-style src/features/models
npm run build
```

На CI достаточно полного `npm run test` + `npm run build` на PR.

---

## Риски и митигация

| Риск | Митигация |
|------|-----------|
| Массовый move ломает relative imports / re-exports | Wave 0: сначала move + update, shim удалить в конце волны; один PR |
| Регрессия canvas/models при распиле | Wave 3: только модалки/orchestration сначала; canvas — узкий срез |
| Скрытое изменение UX share/api-keys | Визуально сохранить copy/i18n; snapshots не обязательны — ручной checklist в PR |
| Цикл типов sandbox↔models при неполном contract | Grep-гейт в 0.7; adapter только в models |
| Конфликт с параллельными feature-ветками models | Волны короткие; rebase на master перед стартом 3 |

---

## Вне скоупа

- arepos-server / papirus API и поведение
- Смена product UX (кроме удаления мёртвого/выравнивания footer focus)
- Переписывание papirus integration / live-sync / batch-save доменной логики
- i18n key rename ради «красоты» (только перенос при move файлов)
- Полный распил `NodeStylePanel` (~3k) и `ModelImportWizard` в обязательном DoD
- Введение Pinia/Vuex
- Объединение семейств A и B в один layout

---

## Порядок PR (чеклист релиза аудита)

- [ ] PR Wave 0 — boundaries
- [ ] PR Wave 1 — list-detail CRUD
- [ ] PR Wave 2 — shared UI
- [ ] PR Wave 3 — ModelEditor decomposition
- [ ] (opt) PR Wave 4 — polish
- [ ] Закрывающий комментарий/issue: ссылки на PR + факт выполнения DoD метрик

---

## Приложение A — Быстрые команды аудита (повторная проверка)

```bash
# God-files
find src -name '*.vue' -o -name '*.ts' | grep -v test | grep -v generated \
  | xargs wc -l | sort -rn | head -30

# Cross-feature edges
rg "from '@/features/notations" src/features/models src/features/diagram-style -g '!*.test.*'
rg "from '@/features/models" src/features/validation-scripts -g '!*.test.*'
rg "from '@/features/models" src/features/notations -g '!*.test.*'

# Thin wrappers
rg "AdminAlert|useCustomProperties|CollapseSection" src -g '!*.md'
```

## Приложение B — Эталон структуры семейства B (после волны 1)

```
features/<resource>/
  <Resource>EditorPage.vue          # layout wiring only
  components/
    <Resource>Sidebar.vue
    <Resource>Form.vue
    <Resource>Aside.vue?            # optional
  composables/
    use<Resource>Editor.ts
    use<Resource>Editor.test.ts
```

Shared снаружи:

- `components/layout/ListDetailEditorLayout.vue`
- `components/list/EditorSidebarShell.vue`, `SidebarListItem.vue`
- `components/forms/EditorFormHeader.vue`
- `composables/useDirtySelectionGuard.ts`, `useSaveErrorToast.ts`,
  `usePagedResourceCrud.ts`, `useCanShare.ts`
