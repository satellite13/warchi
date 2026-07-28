# Show Label Flag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `DiagramStyle.showLabel` so figure labels can be hidden on the canvas without affecting tree names.

**Architecture:** Optional boolean on `DiagramStyle` (default show). When `false`, builders omit papirus `node.label`. UI toggle in Label section of NodeStylePanel. No papirus changes.

**Tech Stack:** Vue 3, TypeScript, Vitest, warchi diagram-style / notations / models

**Spec:** `docs/superpowers/specs/2026-07-21-show-label-flag-design.md`

---

### Task 1: Data model + normalize + buildNodeLabel

**Files:**
- Modify: `src/domain/attrs/notationAttrs.ts`
- Modify: `src/features/notations/utils/notationElementBuilders.ts`
- Test: existing normalize tests / `notationElementBuilders.test.ts`

- [x] Failing tests for normalize + `buildNodeLabel` when `showLabel: false`
- [x] Add `showLabel?: boolean` + normalize
- [x] Early-return `undefined` from `buildNodeLabel` when `showLabel === false`
- [x] Tests pass

### Task 2: Model canvas builder

**Files:**
- Modify: `src/features/models/components/ModelDiagramCanvas.vue` (`buildNodeLabel`)
- Ensure create/update paths clear label when false

- [x] Guard local `buildNodeLabel` the same way
- [x] On style update, `node.label = undefined` when hidden

### Task 3: Style panel UI + state

**Files:**
- Modify: `src/features/diagram-style/composables/useNodeStyleState.ts`
- Modify: `src/features/diagram-style/components/NodeStylePanel.vue`
- Modify: i18n locale files for `nodeStyle.showLabel`

- [x] State + serialize `showLabel`
- [x] Toggle in Label section (default on)
- [x] Apply to existing node clears label when off

### Task 4: Verify

- [x] Run targeted vitest
- [ ] Commit
