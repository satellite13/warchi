# OEF import — reuse existing nodes/links — Design Spec

Date: 2026-08-04  
Status: approved  
Repos: warchi  
Related: OEF import wizard (`ModelImportWizard`), `useOefImport`, `buildOefBatchSaveRequest`, `chunkOefBatchSave`, `ensureDiagramAttrsLoaded`

## Goal

При импорте OEF в **существующую** модель дать пользователю выбор: всегда создавать новые ноды/связи или **переиспользовать подходящие уже существующие**, с настраиваемым критерием для связей и политикой «только id / обновить из OEF» отдельно для нод и связей.

## Decisions

| Topic | Choice |
|-------|--------|
| Где резолв | Pure helper `resolveOefEntityMatches` на клиенте. Wizard вызывает его для preview; `buildOefBatchSaveRequest` вызывает **тот же** helper сам (не принимает готовые resolutions) — один источник правды на submit |
| Backend | Без изменений normalize/batch-save API |
| Матч ноды | `normalizeOefNodeName(oef) === trim(candidate.name)` + `nodeTypeId`; если у кандидата есть binding на выбранную нотацию — `componentId` должен совпасть |
| Матч связи | Настраиваемый: `endpointsAndType` **или** `endpointsTypeAndLabel` |
| Метка связи | У model `Link` нет `name`. Для `endpointsTypeAndLabel` сравниваем `trim(oefLink.name ?? '')` с эффективной меткой из `diagram.instances.edges[].attrs.label` где `modelLinkId === link.id` |
| Тип связи при матче | `linkTypeId`; если у кандидата есть `notationRelations[notationId].relationId` — должен равняться mapped `relationId` |
| Несколько кандидатов | Первый по `id` ASC + warning (`nodeMatchAmbiguous` / `linkMatchAmbiguous`) |
| Конфликт меток на одной связи | Разные non-empty labels на разных edges → кандидат **не** проходит label-критерий + warning `linkLabelConflict` |
| При совпадении ноды | `reuseId` \| `updateFromOef` (default `reuseId`) |
| При совпадении связи | `reuseId` \| `updateFromOef` (default `reuseId`); update — properties в link attrs; entity name нет; существующие edge labels **не** трогаем |
| Режим нод / связей | Раздельные: `alwaysCreate` \| `reuseMatching` (default `alwaysCreate`) |
| Диаграммы / org-папки | Всегда create (v1). Повторный импорт с reuse нод/связей всё равно добавит новые диаграммы и Directory-папки |
| Parent / tree | При reuse/update `parentNodeId` не меняем |
| `_isDeleted` | Кандидаты с `_isDeleted` не участвуют в матче |
| Relation rules | Проверка `ruleDecisions` применяется **только** к links с action `create`. Reuse/update не фильтруются rules |
| Hydration меток | Если `linksMode === reuseMatching` и `linkMatchCriterion === endpointsTypeAndLabel`, перед resolve (preview и submit) **обязательно** догрузить attrs всех не-deleted диаграмм через `ensureDiagramAttrsLoaded`. Без этого label-матч недостоверен (`_attrsPending`) |
| Preview | Счётчики create / reuse / update / ambiguous (+ warning groups) |
| Post-import report | Те же счётчики reuse/update + новые warning codes |
| Кэш настроек | localStorage `warchi:model-import:oef-reuse:${notationId}` (versioned) |
| Batch conflict (409) | Как у остальных OEF chunk failures: остановить apply, показать ошибку; уже применённые чанки не откатывать. Отдельного force-UI для OEF update в v1 нет |
| Remap ids | `sourceElementId → realOrTempId` и `sourceRelationshipId → realOrTempId`. Для reuse/update в payload links/diagrams сразу ставятся **real id** (chunk remap: `map[id] ?? id`) |

## Problem summary

OEF-импорт всегда делает `nodes.create` / `links.create`. Повторный импорт даёт дубликаты даже при корректном маппинге типов на каталог нотации.

## Architecture

```
Wizard step 3 (preview)
  reuse settings
  if label criterion active → hydrate all diagram attrs
  resolveOefEntityMatches(...) → summary + warnings (UI only)

Submit
  same hydrate if needed
  buildOefBatchSaveRequest(..., existingNodes/Links/Diagrams, reuseSettings)
       │
       ├─ resolveOefEntityMatches (inside build)
       ├─ create / update / skip-for-reuseId
       └─ warnings + createdCounts + reuseCounts
       │
       ▼
planOefBatchSaveChunks
  1) node creates
  2) node updates
  3) link creates
  4) link updates
  5) diagram creates
       │
       ▼
applyOefBatchSaveChunks → loadModel → report
```

## Name normalization (nodes)

Shared with create path semantics:

```ts
function normalizeOefNodeName(raw: string): string {
  const truncated = truncateOefEntityName(raw.trim())
  // create fallback for empty: sourceElementId — for matching, empty ⇒ no reuse
  return truncated
}
```

- Match: `normalizeOefNodeName(oefNode.name) === trim(candidate.name)`.
- Если после trim OEF-имя пустое → action `create` (не ищем reuse), даже если mode `reuseMatching`.
- Create по-прежнему может подставить `sourceElementId` как name при пустом имени — это не влияет на reuse.

Имена нод в модели **не уникальны**; при `updateFromOef` truncated name применяется всегда (без `nodeUpdateNameSkipped` из‑за «занятости» имени).

## Matching rules

Порядок: сначала резолв всех нод, затем связей (связи зависят от endpoint resolution).

### Nodes (`reuseMatching`)

Участвуют только mapped draft nodes (`nodeTypeId` + `componentId` в mapping). Unmapped — как сейчас skip + `nodeTypeNotMapped`, в resolutions не нужны.

Кандидат подходит, если:

1. Не `_isDeleted`.
2. `trim(candidate.name) === normalizeOefNodeName(oefNode.name)` и OEF-имя после trim непустое.
3. `candidate.nodeTypeId === mapped.nodeTypeId`.
4. Component: если `candidate.parsedAttrs.notationComponents[notationId]?.componentId` задан — равен `mapped.componentId`; если binding отсутствует — достаточно type+name.

Несколько кандидатов → `id` ASC, взять первого, warning `nodeMatchAmbiguous`.

Action:

- `onNodeMatch === reuseId` → `reuse`
- `onNodeMatch === updateFromOef` → `update`

### Links (`reuseMatching`)

1. Оба endpoint резолвятся в **существующие** real id (`reuse` или `update`). Если хотя бы один endpoint `create` / отсутствует — связь `create` (или skip как сейчас, если endpoint unavailable/unmapped).
2. `candidate` не `_isDeleted`.
3. `candidate.sourceId` / `targetId` строго равны резолвленным (направление важно; зеркальная пара — не матч).
4. `candidate.linkTypeId === mapped.linkTypeId`.
5. Если есть `notationRelations[notationId].relationId` — равен mapped `relationId`; если binding нет — достаточно type+endpoints (+label).
6. Критерий `endpointsTypeAndLabel`:
   - OEF: `trim(oefLink.name ?? '')`.
   - Existing: все edges на не-deleted диаграммах с загруженными attrs, `modelLinkId === candidate.id`.
   - Эффективная метка:
     - нет non-empty labels → `''`;
     - все non-empty labels одинаковы → это значение;
     - разные non-empty labels → кандидат отбрасывается по label-критерию + warning `linkLabelConflict` (с `linkId` / sample labels).
   - Match: `oefName === effectiveLabel`.
7. Несколько link-кандидатов после критериев → `id` ASC + `linkMatchAmbiguous`.

При `linksMode === alwaysCreate` шаги 1–7 не выполняются (всегда create, modulo existing skip reasons).

## On-match policies

### `reuseId`

Сущность не попадает в `create`/`update`. Real id регистрируется в remap-таблицах для links/diagrams.

### `updateFromOef`

- **Node** `nodes.update`: те же `parentNodeId`, `nodeTypeId`; `name = normalizeOefNodeName(oef) || existing.name`; properties merge той же функцией, что create (`mergeOefPropertiesIntoBuckets`), поверх текущих parsed attrs; `notationComponents` / `treeOrder` / `documentFileId` сохранить; `baseUpdatedAt = existing.updatedAt`.
- **Link** `links.update`: те же `sourceId`, `targetId`, `linkTypeId`; relation properties merge; `notationRelations` сохранить; `baseUpdatedAt = existing.updatedAt`.
- Существующие `edge.attrs.label` не меняем.
- Новые диаграммы из этого импорта — create, labels с OEF как сейчас.

## Wizard UX

Шаг **Предпросмотр**: секция «Переиспользование существующих».

| Control | Values | Default | Enabled when |
|---------|--------|---------|--------------|
| Ноды | alwaysCreate / reuseMatching | alwaysCreate | always |
| Связи | alwaysCreate / reuseMatching | alwaysCreate | always |
| Критерий связи | endpointsAndType / endpointsTypeAndLabel | endpointsAndType | linksMode = reuseMatching |
| При совпадении ноды | reuseId / updateFromOef | reuseId | nodesMode = reuseMatching |
| При совпадении связи | reuseId / updateFromOef | reuseId | linksMode = reuseMatching |

Сводка: `create / reuse / update / ambiguous` для nodes и links.

При включении label-критерия показать hint, что будут догружены attrs диаграмм (может занять время на больших моделях). Ошибка hydration → блокировать submit / показать ошибку, не считать labels пустыми молча.

Кэш: load при смене notationId; save при submit (и при изменении settings — опционально debounce; минимум на submit).

## Chunk apply

`planOefBatchSaveChunks` расширить порядком выше. Progress: учитывать updates (`nodesUpdated` / `linksUpdated`) либо включить в существующие counters явно в UI copy («создано/обновлено») — минимально: добавить поля в `OefChunkProgress` и i18n.

Partial failure: без авто-rollback (как сейчас).

## Warnings / report codes

| Code | Когда |
|------|--------|
| `nodeMatchAmbiguous` | >1 кандидат ноды |
| `linkMatchAmbiguous` | >1 кандидат связи |
| `linkLabelConflict` | у кандидата разные non-empty edge labels; отброшен при label-критерии |
| (existing) | `nodeTypeNotMapped`, property warnings, relation-rule warnings — без изменений |

`OefImportReport` / build result:

```ts
reuseCounts: {
  nodesReused: number
  nodesUpdated: number
  linksReused: number
  linksUpdated: number
}
```

## Out of scope (v1)

- Переиспользование диаграмм и Directory/org folders
- UI выбора конкретного кандидата при ambiguous
- Серверный матчинг
- Смена `parentNodeId` при update
- Case-insensitive / fuzzy name
- Поле `name` на model link
- Обновление `edge.attrs.label` на существующих диаграммах
- Force-overwrite UI специально для OEF update 409

## Files (expected)

| Area | Path |
|------|------|
| Settings + cache | `utils/oef/reuseSettings.ts` |
| Resolver | `utils/oef/oefEntityReuse.ts` |
| Batch build | `oefToBatchSave.ts` |
| Chunks | `chunkOefBatchSave.ts` |
| Hydration hook | wizard / `useOefImport` + `ensureDiagramAttrsLoaded` |
| Wizard / import | `ModelImportWizard.vue`, `useOefImport.ts`, `ModelEditor.vue` (props) |
| i18n / docs | `locales/models.ts`, `docs/content/models.md` (+en) |

## Test plan

- alwaysCreate игнорирует совпадения
- node: name+type; binding filter; empty name → create; ambiguous → min id
- link: reuse only if both endpoints existing; direction strict
- label: match via `attrs.label`; empty↔empty; conflict labels → no match + warning
- update: properties merge, parent preserved; link labels on old diagrams unchanged
- relation rules apply only to create links
- chunk plans include updates; remap mixed create+reuse real ids
- Manual: повторный импорт reuseMatching → без дублей нод/связей; новые диаграммы появляются; label-критерий после hydration находит прошлый OEF label

## Self-review changelog (2026-08-04)

Исправлены пробелы/противоречия черновика:

1. **`_attrsPending`** — без hydration label-критерий ломался бы на типичной загрузке модели; добавлено обязательное догружение.
2. **`nodeUpdateNameSkipped`** — убран: имена нод в модели не уникальны, правило конфликтовало с create.
3. **Двойной resolve** — зафиксировано: preview отдельно, build вызывает helper сам.
4. **`linkLabelConflict`** — не «можно позже», а обязательный warning.
5. **Relation rules vs reuse** — только для create.
6. **409 / deleted / report counts / remap** — явно зафиксированы.
7. **Org/diagrams always create** — как known limitation при повторном импорте.
