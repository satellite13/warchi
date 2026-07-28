# DualDiagramCompareView Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Вынести общий dual-canvas compare shell из `ModelVisualCompareView` и `DiagramVersionsCompareView` в один компонент без изменения поведения.

**Architecture:** Presentational+diff shell `DualDiagramCompareView` владеет layout, dual `ModelDiagramCanvas`, swap base side, props panel и `useComparisonDiff`. Views оставляют data loading и уникальные селекторы через slots `before-swap` / `after-swap` / `topbar-extra`.

**Tech Stack:** Vue 3 `<script setup>`, Vitest + `@vue/test-utils`, существующий `useComparisonDiff`.

---

### Task 1: Branch + failing mount test

**Files:**
- Create: `src/features/models/components/DualDiagramCompareView.test.ts`
- Create branch: `refactor/dual-diagram-compare-view`

- [x] **Step 1:** `git checkout -b refactor/dual-diagram-compare-view`
- [x] **Step 2:** Write mount test: back emit, selectors slots, swap disabled, props panel when selection label present (stub canvas/i18n/layout)
- [x] **Step 3:** Run test — expect fail (component missing)

### Task 2: Implement DualDiagramCompareView

**Files:**
- Create: `src/features/models/components/DualDiagramCompareView.vue`

- [x] **Step 1:** Implement component with props (`error`, `propsPanelStorageKey`, `swapDisabled`, side data/diagrams, `sharedData`), slots, CSS prefix `ddc__`
- [x] **Step 2:** Wire `useComparisonDiff` + `useResizablePropsPanel` + fitToView watch
- [x] **Step 3:** Run test — green

### Task 3: Migrate both views

**Files:**
- Modify: `src/views/ModelVisualCompareView.vue`
- Modify: `src/views/DiagramVersionsCompareView.vue`

- [x] **Step 1:** Replace shared template/CSS with `<DualDiagramCompareView>` + selector slots
- [x] **Step 2:** Keep view-specific loaders unchanged
- [x] **Step 3:** Run unit tests for DualDiagramCompareView + typecheck affected

### Task 4: Verify

- [x] **Step 1:** `npx vitest run src/features/models/components/DualDiagramCompareView.test.ts`
- [x] **Step 2:** `npx vue-tsc --noEmit` (or project typecheck) if feasible
