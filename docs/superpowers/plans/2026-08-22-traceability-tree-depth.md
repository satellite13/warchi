# Compact Traceability Tree Depth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep deep traceability paths readable in the narrow editor panel without routinely requiring horizontal scrolling.

**Architecture:** `ModelTraceBranch` already receives the complete node path, so it can derive its visual depth locally. CSS applies compact per-level indentation through level four and a capped indentation from level five; the existing panel becomes horizontally scrollable only as a fallback.

**Tech Stack:** Vue 3 Composition API, scoped CSS, Vitest, Vue Test Utils.

---

## File structure

- Modify `src/features/models/components/ModelTraceBranch.vue`: calculate visual depth, expose a capped-depth class, compact nested layout, and give truncated node/link labels titles.
- Modify `src/features/models/components/ModelTraceabilityPanel.vue`: enable horizontal overflow fallback for the tree scroll container.
- Modify `src/features/models/components/ModelTraceabilityPanel.test.ts`: render a five-level branch and verify capped-depth DOM state and complete-name titles.

### Task 1: Cap visual indentation of deep trace branches

**Files:**
- Modify: `src/features/models/components/ModelTraceBranch.vue:35-42,240-456`
- Modify: `src/features/models/components/ModelTraceabilityPanel.vue:780-800`
- Modify: `src/features/models/components/ModelTraceabilityPanel.test.ts:246-333`

- [ ] **Step 1: Write failing component tests**

Add a five-hop fixture (`root → a → b → c → d → leaf`) to
`ModelTraceabilityPanel.test.ts`. Expand every link and assert that the fifth branch is marked
as capped while earlier branches are not. Assert that visible abbreviated labels retain the
complete string through `title`.

```ts
const deepestBranch = wrapper.findAll('.tb').at(-1)!
expect(deepestBranch.classes()).toContain('tb--depth-capped')
expect(wrapper.findAll('.tb--depth-capped')).toHaveLength(1)

const nodeLabel = wrapper.get('.tb__node-name')
expect(nodeLabel.attributes('title')).toBe(nodeLabel.text())
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
npx vitest run src/features/models/components/ModelTraceabilityPanel.test.ts
```

Expected: FAIL because visual-depth classes and label titles do not exist.

- [ ] **Step 3: Add depth-aware markup and compact CSS**

In `ModelTraceBranch.vue`, derive the current visual depth from the existing `path` prop:

```ts
const visualDepth = computed(() => Math.max(0, props.path.length - 1))
const isDepthCapped = computed(() => visualDepth.value >= 4)
```

Bind these values on the root branch element:

```vue
<div class="tb" :class="{ 'tb--depth-capped': isDepthCapped }" :data-trace-depth="visualDepth">
```

Use compact base nesting and prevent further width consumption after the cap:

```css
.tb {
  margin-left: 8px;
  padding-left: 9px;
}

.tb--depth-capped {
  margin-left: 0;
}
```

Add `:title="linkLabel(row)"` to `.tb__link-text` and
`:title="nodeName(resolveNextNodeId(row.link), row)"` to `.tb__node-name`. Do not remove
existing ellipsis or max-width rules.

In `ModelTraceabilityPanel.vue`, change the trace tree body overflow to:

```css
.tp-section__body--tree {
  overflow-y: auto;
  overflow-x: auto;
}
```

- [ ] **Step 4: Run focused verification**

Run:

```bash
npx vitest run src/features/models/components/ModelTraceabilityPanel.test.ts
npm run lint
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/features/models/components/ModelTraceBranch.vue src/features/models/components/ModelTraceabilityPanel.vue src/features/models/components/ModelTraceabilityPanel.test.ts
git commit -m "Compact deep traceability branches"
```
