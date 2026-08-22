# Traceability Node Drag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow compatible model nodes from traceability to be dragged onto the active diagram.

**Architecture:** Traceability will emit the same model-node drag payload that the model tree uses. A compatibility callback supplied by `ModelEditor` will use the same active-diagram, notation, read-only, and component catalog state as the canvas; the existing canvas drop path remains the only creator of diagram instances.

**Tech Stack:** Vue 3 Composition API, TypeScript, Vitest, Vue Test Utils, Playwright.

---

## File structure

- Modify `src/features/models/ModelEditor.vue`: derive and pass the trace-node drag eligibility callback.
- Modify `src/features/models/components/ModelTraceabilityPanel.vue`: render and start drag for the root node.
- Modify `src/features/models/components/ModelTraceBranch.vue`: render and start drag for branch nodes.
- Modify `src/features/models/components/ModelTraceabilityPanel.test.ts`: assert root and branch payload/eligibility behavior.
- Modify `src/i18n/messages.ts`: add bilingual disabled-state tooltip text.
- Modify `tests/model-editor-lazy-load.spec.ts`: cover adding a traceability node to an open diagram.

### Task 1: Define the shared eligibility contract

**Files:**
- Modify: `src/features/models/ModelEditor.vue:3715-3735`
- Modify: `src/features/models/components/ModelTraceabilityPanel.vue:32-65`
- Modify: `src/features/models/components/ModelTraceabilityPanel.test.ts:117-148`
- Modify: `src/i18n/messages.ts`

- [ ] **Step 1: Write failing panel tests for eligibility input**

Extend `mountPanel()` with the explicit callback and assert that the root receives an enabled
handle for `true` and a disabled handle with the callback's reason for `false`.

```ts
const canDragNodeToDiagram = vi.fn(() => ({
  allowed: false,
  reason: 'models.traceabilityDragDisabledMissingComponent',
}))

expect(wrapper.get('[data-testid="trace-node-drag-root"]').attributes('draggable')).toBe('false')
expect(wrapper.get('[data-testid="trace-node-drag-root"]').attributes('title')).toBe(
  'models.traceabilityDragDisabledMissingComponent'
)
expect(canDragNodeToDiagram).toHaveBeenCalledWith('root')
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
npx vitest run src/features/models/components/ModelTraceabilityPanel.test.ts
```

Expected: FAIL because the callback prop and root drag handle do not exist.

- [ ] **Step 3: Add the prop and derive eligibility in ModelEditor**

Add a local typed callback in `ModelEditor.vue`, using the active diagram, `isDiagramReadOnly`,
the `Directory` predicate, `activeNotationId`, and `state.components`. It must return an
`{ allowed: boolean; reason: string }` result and must only return `allowed: true` when:

```ts
const canDragTraceabilityNodeToDiagram = (nodeId: string) => {
  const node = state.nodes.find(item => item.id === nodeId && !item._isDeleted)
  if (!activeDiagram.value) return { allowed: false, reason: 'models.traceabilityDragDisabledNoActiveDiagram' }
  if (isDiagramReadOnly.value) return { allowed: false, reason: 'models.traceabilityDragDisabledReadOnly' }
  if (!node) return { allowed: false, reason: 'models.traceabilityDragDisabledMissingComponent' }
  if (isDirectoryNode(node.id)) return { allowed: true, reason: 'models.traceabilityDragHint' }
  const notationId = activeNotationId.value
  const hasComponent = notationId
    ? state.components.some(component => component.notationId === notationId && component.nodeTypeId === node.nodeTypeId)
    : false
  return hasComponent
    ? { allowed: true, reason: 'models.traceabilityDragHint' }
    : { allowed: false, reason: 'models.traceabilityDragDisabledMissingComponent' }
}
```

Pass it as `:can-drag-node-to-diagram="canDragTraceabilityNodeToDiagram"` to
`ModelTraceabilityPanel`. Add the required prop in that component and pass it through to
`ModelTraceBranch`. Add the following translation key to both locale objects in
`src/i18n/messages.ts`:

```ts
traceabilityDragDisabledMissingComponent:
  'The active notation has no component for this node type'
```

Use the corresponding Russian translation:

```ts
traceabilityDragDisabledMissingComponent:
  'В активной нотации нет компонента для этого типа узла'
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
npx vitest run src/features/models/components/ModelTraceabilityPanel.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the contract**

```bash
git add src/features/models/ModelEditor.vue src/features/models/components/ModelTraceabilityPanel.vue src/features/models/components/ModelTraceabilityPanel.test.ts src/i18n/messages.ts
git commit -m "Add traceability node drag eligibility"
```

### Task 2: Render root and branch node drag handles

**Files:**
- Modify: `src/features/models/components/ModelTraceabilityPanel.vue:191-195,493-514`
- Modify: `src/features/models/components/ModelTraceBranch.vue:12-31,111-122,177-191`
- Modify: `src/features/models/components/ModelTraceabilityPanel.test.ts:159-204`

- [ ] **Step 1: Write failing payload tests**

Add tests for both source locations. The root and branch target handle must emit the existing
tree payload, not a trace-specific payload.

```ts
await rootHandle.trigger('dragstart', {
  dataTransfer: { setData: setDataMock, effectAllowed: '' },
})
expect(setDataMock).toHaveBeenCalledWith('application/x-model-node-id', 'root')
expect(setDataMock).toHaveBeenCalledWith('text/plain', 'node:root')

expect(branchHandle.attributes('draggable')).toBe('true')
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
npx vitest run src/features/models/components/ModelTraceabilityPanel.test.ts
```

Expected: FAIL because node drag handles and the dragstart handler are absent.

- [ ] **Step 3: Implement a small reusable drag handler in each component**

In `ModelTraceabilityPanel.vue`, implement `onNodeDragStart(event, nodeId)`:

```ts
const onNodeDragStart = (event: DragEvent, nodeId: string): void => {
  const eligibility = props.canDragNodeToDiagram(nodeId)
  if (!eligibility.allowed) {
    event.preventDefault()
    return
  }
  event.dataTransfer?.setData('application/x-model-node-id', nodeId)
  event.dataTransfer?.setData('text/plain', `node:${nodeId}`)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'
}
```

Render a `span` with `data-testid="trace-node-drag-root"`, `draggable`, `title`, and a
`drag_indicator` icon next to `.tp-tree__root-name`. Use the existing `tb__drag-handle`
styling vocabulary for hover/disabled states.

In `ModelTraceBranch.vue`, add the same callback prop and handler. Render
`data-testid="trace-node-drag-<node-id>"` in the child `.tb__node` row; it must use
`resolveNextNodeId(row.link)` so direction is handled correctly. Stop propagation on
`dragstart` so dragging does not expand the branch or navigate the trace root.

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
npx vitest run src/features/models/components/ModelTraceabilityPanel.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the traceability UI**

```bash
git add src/features/models/components/ModelTraceabilityPanel.vue src/features/models/components/ModelTraceBranch.vue src/features/models/components/ModelTraceabilityPanel.test.ts
git commit -m "Enable node drag from traceability"
```

### Task 3: Verify canvas placement end to end

**Files:**
- Modify: `tests/model-editor-lazy-load.spec.ts:108-150`

- [ ] **Step 1: Write a failing Playwright scenario**

Use `createLazyModelFixture()` to open its diagram, select Leaf A from the lazy tree, open
Traceability, and drag the trace root handle to `.diagram-canvas__canvas`. Save the editor and
inspect the outgoing batch-save body: the updated diagram's serialized `attrs.instances.nodes`
must contain exactly one new instance with `modelNodeId` equal to Leaf A.

```ts
const dragHandle = page.getByTestId('trace-node-drag-root')
await expect(dragHandle).toHaveAttribute('draggable', 'true')
await dragHandle.dragTo(page.locator('.diagram-canvas__canvas'), {
  targetPosition: { x: 260, y: 180 },
})

const saveRequest = page.waitForRequest(request =>
  request.method() === 'POST' &&
  request.url().endsWith(`/api/v1/models/${fixture.modelId}/batch-save`)
)
await page.getByRole('button', { name: 'Save' }).click()
const body = JSON.parse((await saveRequest).postData() ?? '{}')
const diagramUpdate = body.diagrams.updated.find((diagram: { id: string }) => diagram.id === fixture.diagramId)
const instances = JSON.parse(diagramUpdate.attrs).instances.nodes
expect(instances.filter((instance: { modelNodeId: string }) => instance.modelNodeId === fixture.nodeIds[2]))
  .toHaveLength(1)
```

- [ ] **Step 2: Run the scenario and verify it fails**

Run:

```bash
npx playwright test tests/model-editor-lazy-load.spec.ts --project=chromium --workers=1
```

Expected: FAIL because no trace node drag handle exists.

- [ ] **Step 3: Make the scenario deterministic**

Do not alter `ModelDiagramCanvas`: its current `application/x-model-node-id` path already
validates the notation, calculates drop coordinates, emits `addExistingNode`, and uses
`addExistingNodeToDiagram`. The request assertion proves the new traceability source reaches
that existing path without introducing a second instance-creation flow.

- [ ] **Step 4: Run focused verification**

Run:

```bash
npx vitest run src/features/models/components/ModelTraceabilityPanel.test.ts
npx playwright test tests/model-editor-lazy-load.spec.ts --project=chromium --workers=1
npm run lint
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit E2E coverage**

```bash
git add tests/model-editor-lazy-load.spec.ts
git commit -m "Test traceability node placement"
```
