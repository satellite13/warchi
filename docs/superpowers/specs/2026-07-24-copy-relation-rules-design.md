# Copy relation rules from component — Design Spec

Date: 2026-07-24  
Status: approved  
Repos: warchi  
Related:

- `src/features/notations/components/RelationRulesSection.vue`
- `src/features/notations/types.ts` (`EditorRelationRule`)
- `src/features/notations/composables/useNotationEditor.ts` (group/sync of rules)
- `src/components/forms/SearchableSelect.vue`

## Goal

In the notation editor, allow copying **outbound** relation rules from one component to another (e.g. Business Event → Business Event B), with optional merge or replace of the target’s existing outbound rules. Self-rules (`Event → Event`) remap to (`Event B → Event B`).

## Problem summary

Visual variants of the same ArchiMate concept (Event / Event B) need similar connection matrices. Today rules are edited only as individual `from → to + relations` rows. There is no way to seed a new component’s rules from an existing one. Copying a whole notation remaps all components, but does not help within one notation.

## Decisions

| Topic | Choice |
|-------|--------|
| Scope | UI feature in notation editor only; no backend API; no bulk ArchiMate data fix |
| Direction | Outbound only (`from = source` → `from = target`) |
| Self remap | If `to === sourceId`, then `to' = targetId` |
| Other targets | Unchanged (`Event → Actor` → `Event B → Actor`) |
| Cross source↔target | **Manual** after copy (not automatic) |
| Inbound rules (`X → source`) | **Not** copied |
| Conflict policy | Dialog: **Merge** (default) or **Replace** all outbound on target |
| Source picker | `SearchableSelect` (same as rule target select), exclude current component |
| Persistence | Mutate editor `relationRules` (`_isNew` / `_isDirty` / `_isDeleted`); user Saves notation as usual |
| Empty source | No-op + user-facing message |

## UX

1. User selects a component in the notation editor.
2. In **Правила связей** (`RelationRulesSection`), header has:
   - existing **+** (add rule)
   - new **copy from…** button
3. Modal **Скопировать правила связей**:
   - Source: `SearchableSelect` over active typed components, excluding current
   - Radio: «Объединить с текущими» (default) / «Заменить все исходящие»
   - Cancel / Copy
4. On confirm, rules update in the properties panel immediately; notation remains dirty until Save.

## Algorithm

Pure function (preferred location: `src/features/notations/utils/copyRelationRules.ts`):

```ts
type CopyMode = 'merge' | 'replace'

copyRelationRulesFromComponent(
  rules: EditorRelationRule[],
  sourceComponentId: string,
  targetComponentId: string,
  mode: CopyMode,
  createId: () => string,
): { changed: boolean }
// Mutates `rules` in place (same style as RelationRulesSection onMutateRelationRules).
// `changed === false` when source has no outbound rules.
```

Steps:

1. Collect source outbound: `fromComponentId === sourceComponentId && !_isDeleted`.
2. Map each to a candidate:
   - `fromComponentId = targetComponentId`
   - `toComponentId = to === sourceComponentId ? targetComponentId : to`
   - `allowedRelationIds` copied (unique)
3. Deduplicate candidates by `toComponentId` (union of relation ids).
4. **Replace:** mark all target outbound (`from === target && !_isDeleted`) as `_isDeleted` (or splice if `_isNew`); then push candidates as `_isNew`.
5. **Merge:** for each candidate `to'`:
   - if target already has outbound rule to `to'`: union `allowedRelationIds`, set `_isDirty` if not `_isNew`
   - else push `_isNew` rule
6. If step 1 yields zero rules: do not mutate; surface empty-source message.

Relation type ids are never remapped (same notation).

## Architecture

```
RelationRulesSection
  → opens CopyRelationRulesModal
  → on confirm: onMutateRelationRules(rules => copyRelationRulesFromComponent(...))
  → existing notation Save / relation-rules sync unchanged
```

No changes to arepos-server or papirus. Persistence path remains `PUT .../relation-rules/sync` via current editor save.

## Files

| File | Change |
|------|--------|
| `src/features/notations/utils/copyRelationRules.ts` | New pure helper |
| `src/features/notations/utils/copyRelationRules.test.ts` | Unit tests |
| `src/features/notations/components/CopyRelationRulesModal.vue` | New modal |
| `src/features/notations/components/RelationRulesSection.vue` | Copy button + wire modal |
| `src/i18n/messages.ts` (or locale modules) | ru + en strings |

## i18n (keys sketch)

- `diagram.copyLinkRules` — button title
- `diagram.copyLinkRulesTitle` — modal title
- `diagram.copyLinkRulesSource` — source label
- `diagram.copyLinkRulesMerge` / `diagram.copyLinkRulesReplace`
- `diagram.copyLinkRulesConfirm` / cancel via `common.*`
- `diagram.copyLinkRulesEmpty` — no rules on source

## Testing

Vitest for `copyRelationRulesFromComponent`:

- self-remap: `A→A` ⇒ `B→B` with same relations
- non-self target preserved: `A→C` ⇒ `B→C`
- merge unions relation ids on existing `B→C`
- replace deletes previous `B→*` outbound and inserts copies
- empty source → no mutation
- duplicate source rows to same `to` → single candidate with unioned relations

Optional shallow component test for modal wiring if cheap; not required for MVP.

## Out of scope

- Automatic `source ↔ target` cross rules
- Copying inbound rules (`X → source` → `X → target`)
- Backend endpoint / migration of ArchiMate 3.1 data
- Preview list of rules in the modal
- Copying rules when a relation (link type) is selected

## Manual follow-up (user)

After the feature ships, for ArchiMate Event B variants:

1. Open each Event B → Copy from corresponding Event (merge).
2. Manually add Event ↔ Event B (and any needed inbound mirrors) if required for diagrams.
