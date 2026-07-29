# Compare viewports: sync pan/zoom toggle

Date: 2026-07-30  
Status: implemented (feat/compare-viewport-sync)

## Goal

На экранах визуального сравнения двух диаграмм добавить переключатель синхронизации pan/zoom между левым и правым canvas, чтобы удобно сравнивать одно и то же место на обеих версиях — или, наоборот, смотреть их независимо.

## Scope

**In:**
- `DualDiagramCompareView.vue` — toggle, sync-логика, localStorage
- `ModelDiagramCanvas.vue` — expose `getViewport` / `setViewport`, emit `viewport-change`
- i18n (`ru` / `en`) для подписи/title toggle
- Unit-тесты sync/persist/snap

**Out:**
- Изменения papirus / backend / API
- Отдельный composable `useSyncedDiagramViewports` (можно вынести позже)
- Синхронизация selection между панелями
- Persistence per-diagram viewport в compare (только флаг sync)

Затрагивает оба экрана автоматически: `ModelVisualCompareView`, `DiagramVersionsCompareView` (оба используют `DualDiagramCompareView`).

## Requirements (confirmed)

| Решение | Выбор |
|--------|--------|
| Default | Sync **ON** |
| Persist | `localStorage`, ключ `warchi:compare-sync-viewports` (`"1"` / `"0"`); нет ключа → ON |
| Placement | Toggle справа в topbar |
| Re-enable after diverge | Snap opposite → viewport **last active** side; если не было взаимодействия — left |
| After paired `fitToView` | При sync один раз snap right ← left |

## Design

### ModelDiagramCanvas

Papirus уже даёт `renderer.viewport` get/set (`{ zoom, offsetX, offsetY }`).

1. `getViewport()` / `setViewport(state)` — прокси к `renderer.viewport` (no-op, если renderer нет).
2. Emit `viewport-change` из существующих listeners `r.on('zoom'…)` / `r.on('pan'…)` (тот же момент, что `viewportRev`).
3. Добавить оба метода в `defineExpose`.

Тип viewport: совместим с papirus `ViewportState` (или локальный `{ zoom: number; offsetX: number; offsetY: number }`).

### DualDiagramCompareView

**State:**
- `syncViewports = ref(loadString(KEY, '1') !== '0')`
- `lastActiveSide = ref<'left' | 'right'>('left')`
- `applyingSync = false` (синхронный guard от петли emit→set→emit)

**Toggle UI:** последний элемент в `.ddc__topbar` (справа, после slot `#topbar-extra`), label + switch; `title` с пояснением. При смене — `saveString(KEY, value ? '1' : '0')`. При переходе `false → true` — `snapOtherTo(lastActiveSide)`.

**Sync on viewport-change:**
```
onViewportChange(side):
  lastActiveSide = side
  if !syncViewports || applyingSync: return
  src = canvas(side).getViewport()
  if !src: return
  applyingSync = true
  try: canvas(other).setViewport(src)
  finally: applyingSync = false
```

**Initial / diagram change:**
Существующий `centerBothCanvases()` (`fitToView` left+right) остаётся. После него, если `syncViewports`, в том же rAF/nextTick — `setViewport` right ← left (если оба canvas готовы).

**Missing canvas:** любой get/set без mounted renderer — no-op.

### i18n

Ключи вроде:
- `models.compareSyncViewports` — короткая подпись («Синхронизация» / «Sync»)
- `models.compareSyncViewportsHint` — title/tooltip

### Tests

`DualDiagramCompareView.test.ts` (+ при необходимости точечный тест expose canvas):
1. Default sync ON без localStorage; OFF если ключ `"0"`.
2. Toggle пишет в localStorage.
3. Viewport-change left при sync → `setViewport` на right с тем же state.
4. Sync OFF → `setViewport` не вызывается.
5. Включение sync → snap opposite к last active.
6. Guard: `setViewport` на target не приводит к повторному `setViewport` на source в том же цикле (stub emit).

## Verification (manual)

1. Открыть compare двух версий → pan/zoom слева двигает правую.
2. Выключить sync → стороны независимы.
3. Снова включить → вторая подтягивается к последней тронутой.
4. Перезагрузить страницу → состояние toggle сохранено.
5. Сменить диаграмму/версии → оба fit, затем при sync выровнены.
