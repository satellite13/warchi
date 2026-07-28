# OEF import: properties → custom properties

Date: 2026-07-27  
Status: implemented (feat/oef-import-properties)

## Goal

При импорте ArchiMate Open Exchange Format (OEF) переносить значения `<properties>` элементов и relationships в кастомные свойства wArchi, совпадающие **по имени**. Значения в OEF текстовые; целевые custom properties имеют типы `string | number | boolean | enum` — нужна явная конвертация.

## Decisions

| Тема | Решение |
|------|---------|
| Куда писать | Во все совпавшие схемы сущности: node → `typeProperties` и `componentProperties`; link → `relationProperties` |
| Совпадение имени | `trim`, регистр важен (`Owner` ≠ `owner`) |
| Ошибка конвертации | Пропустить свойство (оставить default/пусто) + warning |
| Имя не найдено в схемах | Warning, агрегированный по имени свойства (со счётчиком) |
| Приоритет | Успешно сконвертированное OEF-значение перебивает default |
| Schema validation (`required`, min/max, regex) | При импорте не ужесточаем; существующая post-import проверка required остаётся |
| Парсинг | И клиентский `oefParser`, и серверный `OefParseService` (путь `/oef/normalize`) |
| Конвертация | Только на клиенте при сборке batch-save |

## Data flow

```
OEF XML
  → parse propertyDefinitions (id → name)
  → parse element/relationship properties (definitionRef → text value)
  → draft.nodes[].properties / draft.links[].properties  // Record<string, string>
  → buildOefBatchSaveRequest
       defaults from type/component/relation schemas
       + convert & merge OEF values by name into matching buckets
       + collect warnings
  → batch-save
```

### OEF shape (ArchiMate 3.x)

```xml
<propertyDefinitions>
  <propertyDefinition identifier="prop-1" type="string">
    <name>Owner</name>
  </propertyDefinition>
</propertyDefinitions>

<element ...>
  <properties>
    <property propertyDefinitionRef="prop-1">
      <value>Team A</value>
    </property>
  </properties>
</element>
```

В нормализованной модели храним уже разрешённые имена: `properties: { "Owner": "Team A" }`.  
Attribute `type` у `propertyDefinition` в OEF игнорируем для целевой типизации — тип берём из custom property в wArchi.

Правила парсинга:

- Пустой/отсутствующий `propertyDefinitionRef` или неизвестный ref → пропуск (без warning).
- Пустое имя definition после trim → пропуск.
- Несколько value для одного имени на одной сущности: последнее выигрывает.
- Properties у model / views не импортируем в этом scope (только elements и relationships).

## Conversion rules

Функция `convertOefPropertyValue(raw: string, property: CustomProperty)`:

| Тип | Правило |
|-----|---------|
| `string` | `trim`; пустая строка → skip (не conversion-warning; значение не пишем) |
| `number` | trim → `Number`; успех только если `Number.isFinite`; иначе fail |
| `boolean` | trim + lower: `true` / `1` / `yes` → `true`; `false` / `0` / `no` → `false`; иначе fail |
| `enum` | trim; точное совпадение с одним из `enumValues`; иначе fail |

## Merge algorithm (per entity)

1. Взять defaults (`collectDefaultCustomPropertyValues`) для type / component / relation схем, как сейчас.
2. Для каждой пары `(name, text)` из OEF properties сущности:
   - Найти custom properties с `property.name === name.trim()` в применимых схемах (для node — type и component; для link — relation).
   - Если нигде нет → учесть в агрегате unmatched.
   - Если есть: для каждой схемы с матчем вызвать конвертер; при успехе записать typed value в соответствующий bucket; при fail — warning + не трогать default.
3. Собрать attrs через существующие `makeNodeAttrs` / `makeLinkAttrs`.

## Warnings

Коды (ориентир для i18n / UI отчёта импорта):

- `propertyConversionFailed` — сущность, имя свойства, целевой тип, исходный текст.
- `propertyUnmatched` — агрегат: имя свойства + число вхождений (элементы/связи, где имя не попало ни в одну схему этой сущности).

Warnings не блокируют импорт.

## Out of scope

- UI маппинга OEF property → custom property (только match by name).
- Создание новых custom properties на лету.
- Properties модели/views.
- Изменение серверной бизнес-логики batch-save.

## Affected files

### warchi

- `src/features/models/utils/oef/types.ts` — `properties` на element/relationship/draft node/link; при необходимости типы warnings.
- `src/features/models/utils/oef/oefParser.ts` — parse definitions + properties.
- `src/features/models/utils/oef/oefDraftBuilder.ts` — проброс properties в draft.
- `src/features/models/utils/oef/oefNormalizeApi.ts` — типы ответа normalize (если зеркалят DTO).
- `src/features/models/utils/oef/oefToBatchSave.ts` — merge + проброс схем для matching.
- `src/features/models/utils/oef/oefPropertyConversion.ts` (новый) + unit tests.
- `src/features/models/composables/useOefImport.ts` — передача схем свойств, показ warnings.
- i18n (`src/i18n/locales/models.ts`) — тексты warnings.
- Тесты парсера / draft / batch-save / fixtures с properties.

### arepos-server

- `dto/oef/OefNormalizeDtos.kt` — `properties: Map<String, String>` (или эквивалент) у element/relationship.
- `service/OefParseService.kt` — парсинг `propertyDefinitions` и `properties`.
- Соответствующие тесты.

## Test plan (high level)

1. Parser: definition + property на element/relationship → `properties` по имени.
2. Conversion unit: string/number/boolean/enum success и fail cases.
3. Batch: OEF value перебивает default; пишется и в type, и в component при совпадении имени в обеих схемах.
4. Unmatched имя → один агрегированный warning.
5. Server normalize: JSON содержит properties; клиентский путь через API не теряет их.
6. Регрессия: импорт без properties ведёт себя как сейчас (только defaults).
