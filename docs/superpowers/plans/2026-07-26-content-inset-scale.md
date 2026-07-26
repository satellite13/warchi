# Proportional contentInset sides Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Opt-in per-side proportional `contentInset` (`contentInsetScale`) so silhouette labels (e.g. C4 Actor) stay in the torso when the node is resized.

**Architecture:** Store reference px in `contentInset` and optional `contentInsetScale` flags on `diagramStyle`. Resolve to absolute px in papirus `Node.getLabelContainerBounds` using style default W/H as base. UI adds ∝ checkboxes only on content inset.

**Tech Stack:** TypeScript (papirus + warchi), Vue 3, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-26-content-inset-scale-design.md`

---

## File map

| File | Role |
|------|------|
| `papirus/src/types.ts` | `ContentInsetScaleSides`, NodeOptions fields |
| `papirus/src/utils/resolveContentInset.ts` | Pure resolve helper |
| `papirus/src/utils/resolveContentInset.test.ts` | Unit tests |
| `papirus/src/elements/Node.ts` | Store scale/base; resolve in `getLabelContainerBounds` |
| `papirus/src/elements/composite/CompositeNode.ts` | Use `super.getLabelContainerBounds` for rect path |
| `papirus/src/index.ts` | Export types/helper if public |
| `warchi/src/domain/attrs/notationAttrs.ts` | `contentInsetScale` + normalize |
| `warchi/src/domain/attrs/notationAttrs.test.ts` | Normalize tests |
| `warchi/src/components/forms/InsetSidesInput.vue` | Optional scale model + ∝ UI |
| `warchi/src/features/diagram-style/**` | State, panels, apply to runtime |
| `warchi/src/features/diagram/diagramNodeFactory.ts` | Pass scale + base size |
| `warchi/src/features/models/**`, `notations/**` | Canvas/notation apply paths |
| `warchi/src/i18n/locales/diagram.ts` | ∝ labels |
| `warchi/src/features/docs/content/notations*.md` | Document ∝ |

**Branches:** `feat/shape-scale-slice` in warchi; same name in papirus. Local papirus via `"file:../papirus"`.

**Commits:** only when the user asks.

---

### Task 1: Papirus resolve helper + Node wiring

**Files:**
- Create: `papirus/src/utils/resolveContentInset.ts`
- Create: `papirus/src/utils/resolveContentInset.test.ts`
- Modify: `papirus/src/types.ts`, `Node.ts`, `CompositeNode.ts`, `index.ts`

- [ ] **Step 1:** Failing tests for only-top, top+left, all fixed, missing base → 1, non-uniform W/H
- [ ] **Step 2:** Implement `resolveContentInset(inset, scale, nodeSize, baseSize)`
- [ ] **Step 3:** NodeOptions: `contentInsetScale?`, `contentInsetBaseSize?: { width, height }`
- [ ] **Step 4:** Resolve inside `getLabelContainerBounds`; Composite rect path → `super`
- [ ] **Step 5:** Export types; run `npm test` in papirus

### Task 2: Warchi attrs normalize

**Files:**
- Modify: `notationAttrs.ts`, `notationAttrs.test.ts`

- [ ] **Step 1:** Add `contentInsetScale` type + normalize (keep only `true` keys)
- [ ] **Step 2:** Unit tests for drop false/empty and round-trip

### Task 3: Wire factory / canvas / style state

**Files:**
- Modify: `diagramNodeFactory.ts`, `ModelDiagramCanvas.vue`, `useNotationDiagram.ts`, `useNodeStyleState.ts`, `applyDiagramStyleToNodeInstance.ts`, `papirusExtended.ts`

- [ ] Pass `contentInsetScale` + base from `diagramStyle.width/height` whenever setting `contentInset`
- [ ] Load/emit scale in style state

### Task 4: UI + i18n + docs

**Files:**
- Modify: `InsetSidesInput.vue`, `NodeStylePanel.vue`, `CompositeStylePanel.vue`, `diagram.ts` i18n, `notations.md` / `.en.md`

- [ ] Optional `scaleValue` / `update:scaleValue` on InsetSidesInput; ∝ only when bound
- [ ] Wire content inset only
- [ ] Docs: mention ∝ + reference px @ default size

### Task 5: Verify

- [ ] `cd papirus && npm test -- resolveContentInset`
- [ ] `cd warchi && npx vitest run notationAttrs InsetSides` (relevant tests)
- [ ] Switch warchi to `file:../papirus` + update lock if not already

---
