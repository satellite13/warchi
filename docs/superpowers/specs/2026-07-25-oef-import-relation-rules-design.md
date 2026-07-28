# OEF import — relation rules validation — Design Spec

Date: 2026-07-25  
Status: approved  
Repos: warchi  
Related: OEF import wizard (`ModelImportWizard`), `buildOefBatchSaveRequest`, `allowedRelationsForConnection`

## Goal

При импорте модели из OEF проверять допустимость связей по **правилам связей выбранной нотации** (`relationRules`). Недопустимые связи не должны исчезать молча: пользователь явно решает по каждой группе — пропустить или всё равно импортировать.

## Decisions

| Topic | Choice |
|-------|--------|
| Поведение при нарушении rules | Показать группы на шаге маппинга; выбор `skip` \| `import` |
| Гранулярность UI | Агрегация по группам (не per-link) |
| Дефолт выбора | Нет: импорт/переход дальше заблокирован, пока нет явного выбора по каждой группе |
| Где в wizard | Шаг 2 (маппинг), после таблиц element/relationship mapping |
| Критерий допустимости | Component-level: `fromComponentId` + `toComponentId` + `relationId` ∈ `relationRules` (как `allowedRelationsForConnection`) |
| Force-import | Создавать model link + diagram edge; warning в post-import report |
| Skip | Не создавать model link и связанные diagram edges; warning в report |
| Кэш | `ruleDecisions` **не** сохраняются в localStorage маппинга |
| Backend | Без изменений (normalize / batch-save не валидируют rules) |

## Problem summary

Сейчас `buildOefBatchSaveRequest` создаёт model link, если есть маппинг relationship type → `(linkTypeId, relationId)` и оба endpoint-нода импортированы. **Relation rules нотации не проверяются.** В диаграммном редакторе та же пара компонентов без подходящего rule блокируется (`canConnect` / `allowedRelationsForConnection`). Rules при выборе нотации уже грузятся в editor state через `ensureNotationImportCatalog`, но wizard их не получает и build их не использует — отсюда «тихие» потери/несоответствия ожиданиям пользователя.

## Architecture

```
Шаг 2 (маппинг)
  draft.links
  + elementTypeMap / relationshipTypeMap
  + components (из mapping)
  + relationRules (prop из ModelEditor state)
       │
       ▼
  collectDisallowedOefLinkGroups(...)
       │
       ▼
  UI: группы + обязательный выбор skip | import
       │
       ▼
  ruleDecisions: Record<groupKey, 'skip' | 'import'>

Submit
  buildOefBatchSaveRequest(..., relationRules, ruleDecisions)
       │
       ├─ skip  → нет link/edge + warning linkNotAllowedByRelationRules
       └─ import → link/edge как сейчас + warning linkImportedAgainstRelationRules
```

## Group key

Стабильный ключ группы:

```
sourceElementType
+ targetElementType
+ oefRelationshipType
+ mappedRelationId
+ fromComponentId
+ toComponentId
```

Одна строка UI = один ключ + `count` (+ список `sourceRelationshipId` внутри helper для build).

## Pure helper

Новый модуль: `src/features/models/utils/oef/oefRelationRuleValidation.ts`

```ts
isOefLinkAllowedByRelationRules({
  fromComponentId,
  toComponentId,
  relationId,
  relationRules,
}): boolean

collectDisallowedOefLinkGroups({
  draft,
  mapping,
  relationRules,
}): DisallowedOefLinkGroup[]
```

Правила отбора в `collectDisallowedOefLinkGroups`:

1. Пропускать rel→rel (как сейчас — diagram-only, без model link).
2. Пропускать links без полного маппинга source element / target element / relationship → их покрывают существующие warnings (`nodeTypeNotMapped`, `linkTypeNotMapped`, `linkMissingNode`).
3. Если полный маппинг есть, но нет matching `relationRule` — link попадает в disallowed-группу.

Не использовать type-level `isPairAllowedByNotationRules` (матрица): импорт биндит конкретные `componentId` из маппинга.

## Wizard / UI

### Props / emit

- Добавить prop `relationRules: RelationRuleResponse[]` (из `state.relationRules` в `ModelEditor.vue`).
- Расширить `submit` payload:

```ts
{
  draft: ImportDraft
  notationId: string
  mapping: ImportMappingState
  ruleDecisions: Record<string, 'skip' | 'import'>
}
```

### Шаг 2

После таблиц маппинга — секция «Связи вне правил нотации»:

- Строка: OEF relationship type + source/target element types + имя mapped relation + count.
- Два mutually exclusive действия: «Пропустить» / «Импортировать всё равно».
- `canMoveToPreview` требует: полный маппинг типов **и** явный выбор по каждой текущей disallowed-группе.
- Пока `isLoadingCatalog` / rules ещё не готовы — переход на шаг 3 недоступен (существующий gate catalog loading).

### Пересчёт решений

| Событие | Поведение |
|---------|-----------|
| Смена нотации | Сброс `ruleDecisions`, пересчёт групп |
| Смена маппинга element/relationship | Пересчёт групп; сохранить решения только для живых `groupKey` |
| Пустые `relationRules` | Все полностью смэппленные typed model-links → disallowed-группы |

### Шаг 3 (preview)

Counts должны учитывать `ruleDecisions` (skip не входит в «будет создано»), чтобы превью не врало относительно submit.

## Build (`oefToBatchSave.ts`)

Параметры:

- `relationRules`
- `ruleDecisions`

В цикле по `draft.links` (после существующих проверок mapping / endpoints):

1. Вычислить `groupKey` / проверить allow.
2. Если disallowed и decision отсутствует — не должно доходить до build (wizard gate); defensive: treat as skip + warning.
3. Если `skip` — `continue` + `linkNotAllowedByRelationRules`.
4. Если `import` — создать link как сейчас + `linkImportedAgainstRelationRules`.
5. Если model link пропущен из‑за `ruleDecisions[key] === 'skip'`, связанные diagram edges тоже пропускаются **без** дополнительного `diagramConnectionMissingModelLink` (достаточно `linkNotAllowedByRelationRules`). Для прочих причин отсутствия model link поведение `diagramConnectionMissingModelLink` без изменений.

Новые warning codes:

- `linkNotAllowedByRelationRules`
- `linkImportedAgainstRelationRules`

Подписи в `useOefImport.ts` (`oefWarningLabel`) + i18n ru/en.

## Edge cases

| Ситуация | Поведение |
|----------|----------|
| Note / container endpoints | Не участвуют в OEF model links → вне валидации |
| Rel→rel Association | Diagram-only, без rule-check |
| Rules loading | Next заблокирован через catalog loading |
| Empty rules | Все typed mapped links — disallowed groups |
| Force-import | Связь попадёт в модель; редактор по-прежнему не даст *нарисовать новую* такую же пару без rule — это осознанный import override |

## Out of scope

- Серверная валидация relation rules в `batch-save` / normalize
- Per-link remap relation / правка mapping до уровня пары компонентов
- Изменение редактора нотации / матрицы правил
- Автоматическое создание недостающих relation rules

## Testing

1. `oefRelationRuleValidation.test.ts` — allowed / disallowed / skip unmapped / группировка / стабильный key.
2. `oefToBatchSave.test.ts` — skip: нет link+edge + warning; import: link создан + force warning; нет дубля diagram-warning при skip-by-rules.
3. Ручная проверка wizard: блок на Next без выбора; сброс решений при смене маппинга/нотации.

## i18n keys (ориентир)

- `models.oefImportRelationRulesTitle`
- `models.oefImportRelationRulesHint`
- `models.oefImportRelationRulesSkip`
- `models.oefImportRelationRulesImport`
- `models.oefImportRelationRulesNeedDecision`
- `models.oefImportWarning.linkNotAllowedByRelationRules`
- `models.oefImportWarning.linkImportedAgainstRelationRules`
