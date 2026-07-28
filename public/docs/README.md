# Screenshots for in-app documentation

Place PNG/WebP screenshots here and reference them from `src/features/docs/content/*.md` as:

```md
![Node properties: type vs component](/docs/node-properties-type-vs-component.png)
```

`DocsContent` already styles `img` / links. Prefer a light UI theme and crop to the relevant panel.

## Priority checklist

| File (suggested) | Doc section | What to capture |
|------------------|-------------|-----------------|
| `node-properties-type-vs-component.png` | Models → Properties | Two property blocks + `#{` / `${` hints |
| `save-conflict-dialog.png` | Models → Save conflict | Conflict dialog with field diff |
| `label-template-preview.png` | Notations → Label templates | Template field + preview |
| `diagram-edit-lock.png` | Diagrams → Lock | Read-only banner / lock holder |
| `relation-matrix.png` | Models → Relation matrix | Matrix grid + filters |
| `oef-import-wizard.png` | Models → OEF import | Mapping step of the wizard |
| `admin-diagram-locks.png` | Admin → Diagram locks | Locks list + force-release |
