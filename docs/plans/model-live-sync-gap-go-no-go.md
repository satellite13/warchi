# Model Live Sync — Gap-to-Implementation и Go/No-Go

Связан с планом: [model-live-sync.md](model-live-sync.md)

## Цель документа

Зафиксировать:

- что уже реализовано;
- какой остаётся разрыв до целевого состояния;
- что делать сейчас (Go), а что отложить (No-Go);
- практический backlog по этапам.

---

## Текущее состояние (срез)

Реализован рабочий контур **signal + pull**:

- frontend: `useModelLiveSync` с режимами `ws` / `poll` / `hybrid`;
- backend: STOMP-уведомление `model_changed` в `/topic/models/{modelId}`;
- merge snapshot в редакторе с уважением локальных `_isNew / _isDirty / _isDeleted`;
- fallback polling при проблемах с WS.

Это покрывает базовую цель: изменения в модели видны другим пользователям без F5.

---

## Gap-to-Implementation

### P0 (не блокер MVP, но нужен для роста нагрузки)

- нет granular push-событий (`node_created`, `node_updated`, `link_deleted`, и т.д.);
- нет клиентского коалесцера `entity:id` с LWW и приоритетом delete;
- нет полного push-контракта с `revision` / `eventId` / `clientOpId`;
- нет набора push-тестов (coalesce, delete-vs-update, dedup, echo).

### P1 (надёжность production)

- нет outbox/after-commit публикации с ретраями;
- нет idempotency-паттерна на клиенте (`eventId` + LRU дедуп);
- нет наблюдаемости realtime-контура (lag/ошибки публикации/доля fallback).

### P2 (следующая продуктовая фаза)

- нет отдельного high-frequency канала `diagram:{diagramId}` для одновременного редактирования одного canvas;
- нет `seq/ops` (или альтернативного согласованного протокола) для realtime-операций диаграммы.

---

## Go / No-Go

## Go сейчас, если:

- есть заметная нагрузка на snapshot pull;
- появляются жалобы на лаги/дёргание/долгий догон;
- в одной модели регулярно работает много пользователей одновременно;
- нужен более строгий операционный SLA по доставке событий.

## No-Go сейчас, если:

- текущий UX устраивает;
- основная боль (обновление без F5) уже снята;
- нагрузка умеренная, и приоритеты команды в других фичах.

---

## Рекомендация

- **Go:** сделать этап hardening (Этап 1 ниже) в ближайшем спринте.
- **Conditional Go:** этап granular push только по метрикам/сигналам.
- **No-Go сейчас:** отдельный realtime-канал диаграммы (это другой эпик).

---

## Backlog (Jira-ready уровень)

Оценки — ориентировочные story points.

### Этап 1 — Hardening текущего режима (рекомендуется сейчас)

- `A1` Backend: унифицировать envelope `model_changed`, добавить `eventId` — **2 SP**
- `A2` Frontend: дедуп по `eventId` (LRU последних N) в `useModelLiveSync` — **3 SP**
- `A3` Frontend: telemetry (`ws_message_received`, `ws_message_deduped`, `pull_trigger_reason`) — **2 SP**
- `A4` Backend tests: интеграционные тесты публикации в topic на мутациях model/node/link/diagram/batch-save — **3 SP**
- `A5` Frontend tests: echo-ignore + dedup + reconnect pull — **3 SP**
- `A6` Docs: обновить `model-live-sync.md` статусом после hardening — **1 SP**

Итого: **14 SP**

### Этап 2 — Granular Push + Coalescing (по необходимости)

- `B1` Backend: granular события `node_*`, `link_*`, `diagram_*` с минимальным payload — **5 SP**
- `B2` Backend: `revision` (минимум монотонность на сущность) — **5 SP**
- `B3` Frontend: event-router + coalescer по `entity:id` (LWW, delete-priority) — **8 SP**
- `B4` Frontend: patch-apply в state + fallback pull при неизвестных кейсах — **5 SP**
- `B5` Tests: coalesce, delete-vs-update, reorder/revision, idempotency — **5 SP**
- `B6` Docs/API: зафиксировать JSON-контракт push-событий — **2 SP**

Итого: **30 SP**

### Этап 3 — Надёжная доставка (outbox)

- `C1` Backend: outbox-таблица + запись в одной транзакции — **5 SP**
- `C2` Backend: воркер публикации outbox->STOMP + retry/backoff — **8 SP**
- `C3` Backend: метрики `outbox_lag`, `publish_failures`, `retries` — **3 SP**
- `C4` Tests: сценарии сбоя/повторной публикации — **5 SP**
- `C5` Ops docs: runbook деградации outbox — **2 SP**

Итого: **23 SP**

### Этап 4 — Realtime channel диаграммы (отдельный эпик)

- `D1` Дизайн канала `diagram:{id}` и протокола `seq/ops` — **5 SP**
- `D2` Backend: room transport + auth + ordering — **8 SP**
- `D3` Frontend: apply ops + conflict policy — **13 SP**
- `D4` Persistence policy (debounce save / micro-batch) — **5 SP**
- `D5` E2E multi-user сценарии — **8 SP**

Итого: **39 SP**

---

## Предложение по спринтам

- **Спринт 1:** `A1-A6` (14 SP)
- **Спринт 2:** decision gate по метрикам; при необходимости старт `B1-B3`
- **Спринт 3:** `B4-B6` или перенос в backlog, если сигналов нагрузки нет

---

## Decision gate (после Этапа 1)

Переходить к Этапу 2, если выполняется хотя бы один критерий:

- стабильный рост количества pull-запросов на активную сессию;
- рост пользовательских жалоб на задержки синхронизации;
- частые ситуации “update storm” (много мутаций подряд в одной модели);
- деградация времени догона состояния после reconnect.

Если критерии не выполняются — остаёмся на hardened signal+pull и не усложняем архитектуру преждевременно.
