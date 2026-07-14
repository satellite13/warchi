# Аудит кода wArchi — июль 2026

Статический анализ структуры и качества кода. Объём: ~272 исходных файла в `src/`, 88 unit-тестов, 22 E2E-спека. Зависимость `@ngroznykh/papirus`: npm-версия `0.6.4` (не `file:../papirus`).

Связанные отчёты: `docs/code-audit-2026-07.md` в papirus и arepos-server.

## Сильные стороны

- Архитектурные паттерны выдержаны: единый API-слой `ApiResult<T>`, composables вместо глобального стора, версионирование сущностей, editor-флаги `_isNew/_isDirty/_isDeleted`.
- Хорошая декомпозиция ядра models: `useModelEditor`, `useModelBatchSave`, `modelEditorSaveCoordinator`, `useModelLiveSync`.
- Граница `components/` → `features/` не нарушается; переиспользование там, где оправдано (`PropertyRow.vue`, `diagramCanvasBuilders.ts`, `EntityCatalog` + `useEntityList`).
- i18n разбит на `locales/*.ts`, есть тест полноты переводов (`i18nCompleteness.test.ts`).
- Сильные тесты `features/models/utils` (batch save, OEF-импорт, live sync, conflicts) и E2E (model-editor, diagram-lock, XSS smoke).
- Зависимости актуальны: Vue 3.5, Vite 8, TypeScript 6, Vitest 4. `@ts-ignore`/`@ts-expect-error` и TODO/FIXME в коде отсутствуют.

## Крупнейшие файлы — кандидаты на декомпозицию

| Строк | Файл | Комментарий |
|------:|------|-------------|
| 5652 | `src/features/models/ModelEditor.vue` | Критический god-компонент: ~100 inline-обработчиков; orchestration + conflict UI + tree ops + OEF import + notation migration |
| 3199 | `src/features/models/components/ModelDiagramCanvas.vue` | God-компонент canvas, параллелен `useNotationDiagram.ts` |
| 2736 | `src/features/notations/components/NodeStylePanel.vue` | 36+ `as any`, file-level `eslint-disable` |
| 1301 | `src/views/NotationEditorView.vue` | Толстая view, живёт не в `features/` |
| 1164 | `src/features/models/components/ModelTreePalettePanel.vue` | Крупная панель |
| 1027 | `src/features/notations/composables/useNotationDiagram.ts` | God-composable, дублирует canvas-логику models |
| 931 | `src/features/models/composables/useComparisonDiff.ts` | Крупная diff-логика без тестов |
| 824 | `src/features/models/utils/batchSaveConflictDisplay.ts` | Утилита-«монолит» |

## Ключевые проблемы

### Высокий приоритет

1. **God-компоненты.** `ModelEditor.vue` (5652) и `ModelDiagramCanvas.vue` (3199) сосредоточили orchestration, canvas-sync, импорт и conflict UI.
2. **Тесты save/load pipeline.** Без unit-тестов: `modelEditorLoadModel.ts`, `modelEditorSavePipeline.ts`, `useNotationEditor.ts` (785 строк), `useComparisonDiff.ts` (931 строка). Целиком без тестов: `features/types/**`, `views/**` (AdminUsersView — 1064 строки, LoginView — 874).
3. **Coverage thresholds отсутствуют** в конфиге Vitest (`vite.config.ts:49–62`) — регрессии легко пропустить.
4. **Границы модулей.** `notations` — фактически shared domain kernel: models, types, shapes импортируют `notationAttrs`, `NodeStylePanel`, `CompositeStylePanel` напрямую; есть перекрёстная зависимость notations ↔ types (`CustomPropertiesPanel` ← `PropertyRow`).

### Средний приоритет

5. **Типизация Papirus-зоны.** ~75 использований `as any` / `as unknown as` (`NodeStylePanel.vue:318–1332`, `useNodeStyleState.ts:88–193`, `useEdgeStyleState.ts:49–99`, `ModelDiagramCanvas.vue:1055–1869`), хотя `papirusExtended.ts` с типами уже написан.
6. **Дублирование.** Валидация custom properties продублирована (`useCustomProperties.ts:20–64` ↔ `validationIssues.ts:11–49`); canvas builders параллельно живут в `useNotationDiagram.ts` и `ModelDiagramCanvas.vue` (~2000+ строк).
7. **Консистентность.** `features/types` — outlier: dirty-tracking через JSON snapshot вместо `_isDirty/_isDeleted` (`useTypeEditor.ts:88–116`), без `useEntityList` и `useSaveState`.
8. **i18n.** Захардкоженные русские строки в `useComponentManagement.ts` (стр. 69, 75, 87), `useEntityCreateModal.ts:55`, `modelEditorSavePipeline.ts`.

### Низкий приоритет

9. Редакторы разбросаны: `ModelEditor` в `features/`, `NotationEditorView` в `views/`; смешение `@/` и относительных путей в одних и тех же файлах.

## Рекомендации

### Высокий приоритет

1. Декомпозировать `ModelEditor.vue`: вынести tree operations (`useModelTreeOperations`), OEF import (`useOefImport`), notation migration (`useNotationMigration`), conflict UI и selection в отдельные composables. Цель: <1500 строк в orchestrator-компоненте.
2. Унифицировать canvas-слой: общий `useDiagramRenderer` для `ModelDiagramCanvas.vue` и `useNotationDiagram.ts`.
3. Покрыть unit-тестами `modelEditorLoadModel`, `modelEditorSavePipeline`, `useNotationEditor`, `useComparisonDiff`.
4. Ввести coverage thresholds хотя бы для `composables/`, `api/`, `features/models/utils/`.
5. Снизить связность models → notations: вынести `NodeStylePanel`/`CompositeStylePanel` в shared-слой либо явно задокументировать notations как platform feature.

### Средний приоритет

6. Рефакторинг `NodeStylePanel.vue`: использовать `papirusExtended.ts` вместо `as any`, разбить на `NodeStyleSection`/`EdgeStyleSection`/`LabelStyleSection`.
7. Унифицировать dirty-tracking в types с паттерном models/notations.
8. Объединить дублирующуюся валидацию custom properties в один utils-модуль.
9. Перевести захардкоженные строки в i18n messages.
10. Unit-тесты для `useTypeEditor.ts` (save, dirty, delete, usage lookup).
11. Вынести `notationAttrs.ts` в shared domain (`src/domain/attrs/` или аналог) — отразить его роль kernel-модуля.

### Низкий приоритет

12. Перенести `NotationEditorView` в `features/notations/`, унифицировать import style на `@/`.
13. Разбить `batchSaveConflictDisplay.ts` (824 строки) на display / fetch / compare.
14. Тесты Vue-компонентов (`ModelTreePalettePanel`, `ModelPropertiesPanel`, `CustomPropertiesPanel`).

## Итоговая оценка

| Критерий | Оценка |
|----------|--------|
| Структура каталогов | 7/10 |
| Размеры файлов | 4/10 |
| DRY | 6/10 |
| Типизация | 6/10 |
| Тесты | 7/10 |
| Зависимости | 9/10 |

Наибольший ROI: декомпозиция `ModelEditor.vue` + `ModelDiagramCanvas.vue` и тесты save/load pipeline.
