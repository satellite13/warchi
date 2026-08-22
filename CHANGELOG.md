# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

## [0.22.0] - 2026-08-22

### Added
- Large-model editing now loads the tree and diagrams lazily: branches,
  traceability neighbors, and the active diagram are fetched on demand. Live
  sync and polling update only materialized scopes instead of walking every
  node and link.
- Model tree search finds nodes and diagrams, shows a breadcrumb path from the
  root, and navigates to the hit in the hierarchy without opening the diagram.
- Notation node label position can sit outside the shape (top/bottom/left/right + gap). Applies to both simple shapes and composite nodes (the inner `__name__` text is hidden so the name is not duplicated).
- Notation style flag **Lock size** (`lockTransform`): when on, the model-canvas transformer cannot resize instances of that component.
- The notation **palette icon** can override the figure icon: when set, palettes and lists use it even if the component already has an icon.
- Saved notation style presets now include content insets (T/R/B/L), label position, lock-size, and width/height, and apply them to the next component.
- Notation system flags `boundary` / `boundaryAllow`: a guest snaps to a host outline (BPMN boundary events), keeps a hidden Traceability link, and can be slid, reattached, or pulled off.

### Changed
- Saving or running a large-model validation script prepares a cancellable,
  detached snapshot with local changes; it does not load a full snapshot into
  the open editor state.
- Opening a large model no longer walks `/nodes`, `/links`, and `/diagrams` twice: live sync waits for the editor snapshot and skips the first connect/resync pull. For the current 1 CPU / 1 GiB backend profile, model pages load 5000 rows at a time through one global request slot; the HTTP/2 benchmark found that wider pools exhaust or contend for backend resources.
- Large-model loading now shows real page/phase progress. High-volume nodes and links no longer become deep Vue proxies: the benchmark max long task dropped from 2.54 s to 303 ms and used JS heap from roughly 811 to 339 MiB.
- The bundled nginx enables HTTP/2 on its TLS listener, including the local Kubernetes service URL.

### Fixed
- Large-model loading ignores stale route sessions, drains or cancels queued pages after failures, and preserves foreign live-sync changes that arrive during an active snapshot pull.
- Changing the target model in the diagram-copy wizard no longer keeps «Match» targets from the previous model (that produced `invalid match target` on commit).
- Diagram copy now defaults unmatched nodes and links to **Create** when there is no match candidate, instead of leaving every row empty and blocking the wizard.
- Custom property rows no longer collapse the name field into a square next to the type select and Required/System toggles.
- Re-attaching a boundary guest no longer asks to reuse a link and then draws that structural `boundary` arrow on the diagram. The link stays in Traceability only. Save after moving a boundary to another host no longer stays dirty until a second click.
- A diagram-only arrow from a nested child (E inside B inside A) can land on a visible C–D relation that crosses the group fill; the container no longer shows a lock or becomes the target. Snap uses the closest path within 40px, including when the stroke crosses a sibling node.
- The junction end of a diagram-only arrow can be dragged onto another relation (or along the same stroke), not only onto nodes.
- A normal relation can be reconnected to another component even when a diagram-only arrow is or was attached to it; edge-anchor synchronization no longer overwrites the new endpoint with the old one.
- A normal relation can be reconnected to another component even when a diagram-only arrow is or was attached to it; edge-anchor synchronization no longer overwrites the new endpoint with the old one.
- Choosing an imported library icon in figure styles no longer resets the select to None after the canvas applies the SVG markup.
- Model and notation tree action icons no longer reserve width on every row, so unselected names are not truncated.

## [0.21.4] - 2026-08-18

### Changed
- In contour-connect mode the floating port appears only close to the real shape outline, including non-rectangular figures, and no longer blocks corner resize.

## [0.21.3] - 2026-08-18

### Fixed
- Copying a diagram into a model that already had a deleted diagram with the same name and version now suggests the next free version instead of failing with a generic conflict.

## [0.21.2] - 2026-08-17

### Fixed
- Hidden Diagram-only nodes are removed when their last diagram is deleted.
- Moving an imported diagram into a folder no longer wipes the canvas on save.
- The diagram-copy wizard can match an entity that already has an automatic match.

## [0.21.1] - 2026-08-15

### Changed
- Model and notation trees no longer show the type name next to each item.

## [0.21.0] - 2026-08-15

### Changed
- Editors now share the same form, search, chip, and alert chrome instead of each keeping a local copy.
- Sidebar and model-tree icon buttons match the notation header: ghost 24px controls that show a border only on hover.
- Chrome icons are remapped to clearer Material Symbols (models, diagrams, links, toolbar, and common actions).

### Removed
- Duplicate notation and type document panels that the shared editor shells already cover.

## [0.20.0] - 2026-08-14

### Added
- Instance-wide SVG icon library: only an administrator can upload (`/admin/icons`); everyone can pick those icons. Notation export includes `icons[]` for the admin to import; notation import does not create icons — missing names require a replacement or cancel.

## [0.19.2] - 2026-08-14

### Added
- ArchiMate junction icons `and` and `or` in the icon picker.

## [0.19.1] - 2026-08-14

### Changed
- Icon catalog uses Material Symbols Outlined (`@material-symbols/svg-400`) instead of the frozen Material Icons set, so newer icons such as `database` are available. Custom ArchiMate SVGs in `public/icons/` are preserved.

## [0.19.0] - 2026-08-14

### Changed
- Home dashboard greeting uses the first name, recent diagrams show version, and the layout is quick actions plus diagrams on the left and models plus notations on the right.
- Quick actions add model-package import, shapes, and validation scripts; tiles wrap to the next row when the column is narrow.
- Refreshed in-app help to match current catalog, editor, admin trash, and guest-docs behavior.

## [0.18.5] - 2026-08-14

### Fixed
- Helm chart version is valid YAML again (`0.18.5` instead of a trailing comma).

## [0.18.4] - 2026-08-14

### Added
- Guests can open in-app documentation; the header shows Sign in instead of a fake user.

### Changed
- Diagram copy wizard shows localized blocker and warning texts when the preview returns a known issue code.

## [0.18.3] - 2026-08-13

### Fixed
- Stacked dashboard cards no longer go blank when moving the cursor across the catalog.

## [0.18.2] - 2026-08-13

### Added
- Contour-link mode shows a `+` handle on the outline near the cursor so a connection can be started without Shift.

## [0.18.1] - 2026-08-13

### Fixed
- Production arepos-server memory limit is 2Gi so opening diagrams no longer OOM-kills the API (nginx 502 / «Backend unavailable»).

## [0.18.0] - 2026-08-13

### Added
- Diagram undo/redo covers right-panel properties and instance style, node resize, polyline edits, and edge path type from the context menu. Rapid edits of the same field batch into one step.

## [0.17.2] - 2026-08-06

### Changed
- Dashboard entity cards move action buttons into the gradient header; the updated timestamp stays on its own line so card heights stay consistent.

## [0.17.1] - 2026-08-06

### Fixed
- Diagram copy wizard defaults the target notation to the source diagram’s notation when it is still available.

## [0.17.0] - 2026-08-06

### Added
- Label templates for notation relations (edges): `${name}`, `#{link-type props}`, `${relation props}`; model links store `typeProperties` like nodes.
- Notation Properties/Style UI for relation composite labels; model properties panel for link-type values; templates resolve on notation preview and model diagram canvas.

### Fixed
- Edge labels no longer fall back to the relation name when the diagram label is empty (no more unwanted «Association» captions).
- Whitespace-only relation label templates are ignored and not persisted.
- Style panel Label field no longer sticks on unresolved template fragments such as `${name`.
- Palette drag-and-drop places new elements under the cursor (uses dragover coordinates and centers by element size).

## [0.16.1] - 2026-08-06

### Added
- Edge marker type «Stealth» / «Острая»: filled barbed arrowhead with a shallow concave heel.

## [0.16.0] - 2026-08-06

### Added
- API keys support per-model grants: one MCP key can grant read-only on some models and read/write on others.
- Admin users page: list and revoke a user’s API keys.

### Changed
- API key create form: choose all models or selected models with per-model scopes; write always includes read.

## [0.15.0] - 2026-08-04

### Added
- OEF import can reuse matching existing model nodes and links (preview settings: create vs reuse, link match criterion including diagram edge label, reuse id only vs update from OEF).
- User profile: manage personal API keys for MCP access.

### Changed
- Profile page layout redesigned around API keys and account sections.

## [0.14.2] - 2026-08-04

### Changed
- Model tree virtualizes large expanded hierarchies so expand, scroll, and updates stay responsive.

## [0.14.1] - 2026-08-04

### Added
- Model tree search shows a filtered hierarchy with ancestor path, mutes non-matching ancestors, and reveals the selected node when clearing search.

## [0.14.0] - 2026-07-31

### Added
- Model package import reports async job stages and progress (no more hanging on a long synchronous upload).

### Fixed
- System-marked types (`attrs.system`) are view-only in the types editor: no edit, delete, or share actions.

## [0.13.1] - 2026-07-30

### Added
- Dashboard quick action to import a notation package.
- Catalog busy overlay while package import runs (hides empty-state “nothing found”).
- Diagram SVG share modal: open link in a new tab; keep modal open after copy.

### Fixed
- Public diagram SVG share URL is shown only after the file is reachable (avoids a broken link while the share dialog is still open).
- Nginx no longer applies SPA CSP to public diagram SVG share paths.

## [0.13.0] - 2026-07-30

### Added
- Opt-in OIDC SSO login (branded button, callback/link flows, profile and admin visibility when enabled).

### Fixed
- Model and notation package import no longer fails with nginx 504 after upload reaches 100% (longer proxy timeouts and clearer timeout messaging).

## [0.12.2] - 2026-07-30

### Added
- Diagram compare: toggle to sync pan and zoom between the left and right canvases (on by default, persisted in localStorage).

## [0.12.1] - 2026-07-29

### Fixed
- Helm chart version aligned with the application release for production deploy.

## [0.12.0] - 2026-07-29

### Added
- Shareable model validation scripts: catalog, CodeMirror editor, and run from the model editor (report-only JavaScript in a sandboxed iframe).
- In-app help for the validation script API and model snapshot structures.

## [0.11.1] - 2026-07-29

### Added
- Notation catalog: import a `warchi-notation-export` JSON (v2) from the catalog toolbar.

### Changed
- Catalog create/import actions moved into compact toolbar buttons (large create cards removed from the grid).
- App header is more compact (nav, logo); the product subtitle is shown as a logo tooltip.

### Fixed
- Type delete is no longer blocked by usages in soft-deleted notations.

## [0.11.0] - 2026-07-28

### Added
- Model package ZIP import/export from the models catalog and editor toolbar (with notations and wiki files).
- Notation package export from notation catalog cards.
- Admin trash: soft-deleted node types, link types, and shapes with permanent delete confirmation.

### Fixed
- Model live sync stops after the model is deleted or access is revoked (404/403), instead of polling forever.
- Admin permanent delete uses the shared confirmation modal instead of the browser `confirm` dialog.

## [0.10.15] - 2026-07-28

### Added
- Diagram auto-layout (ELK): layered and remove-overlaps modes with a settings preview before apply.

### Fixed
- After auto-layout, links use orthogonal polyline routing instead of slanted ELK bend segments.
- Edge labels and relation styles are kept when layout or the style panel / context menu only change `edgeType`.
- Stale layout preview no longer inserts a banner that shifts the sketch; refresh is signaled on the Update button.

## [0.10.14] - 2026-07-28

### Fixed
- With outline attach off, reconnecting an edge end to a side port no longer snaps back to the top/bottom facing side (papirus 0.8.3).

## [0.10.13] - 2026-07-28

### Fixed
- Orthogonal links inside containers and stacks no longer cut through siblings or lick the source side on same-side elbows; intentional wraps (`top→top`, `bottom→bottom`, `left→left`, …) stay on the chosen anchors (papirus 0.8.2).

## [0.10.12] - 2026-07-28

### Fixed
- Orthogonal polylines no longer crawl along wide target edges when reconnecting or dragging attachments (papirus 0.8.1).
- Edge label color/size/background are kept when changing link type or syncing the diagram (no longer dropped on label recreate).

## [0.10.11] - 2026-07-27

### Added
- OEF import maps element and relationship properties into custom property attrs, with mismatch warnings in the wizard.
- Model compare: searchable diagram select.

### Fixed
- Model/diagram compare loads all paginated nodes and links (with id dedupe) so large models render and diff completely.
- Compare no longer marks copied links or remapped diagram attrs as modified when content is the same (stableId / canonicalize).

## [0.10.10] - 2026-07-26

### Fixed
- Helm chart `version` / `appVersion` / image tag aligned with the package release (were still 0.10.7 on 0.10.8–0.10.9 tags).

## [0.10.9] - 2026-07-26

### Changed
- Notation and Shapes help now describe custom-shape fixed edges (9-slice) and link to the shape editor workflow.

## [0.10.8] - 2026-07-26

### Added
- Custom shapes: optional fixed-edge (9-slice) scaling so corners stay stable when resizing.
- Beveled rectangle: editable chamfer size (`cornerCut`) in px, like corner radius.
- Content inset: per-side proportional (∝) scaling relative to the style default size (papirus 0.7.3).
- In-app docs for content / label / icon insets and proportional content inset.

### Changed
- Trapezoid and parallelogram keep a fixed side slant in px when width changes.
- Sticky-note fold cut is fixed at 16px.

### Fixed
- Applying style-panel inset changes no longer resets a canvas-resized node back to style default size.

## [0.10.7] - 2026-07-25

### Fixed
- OEF import keeps Aggregation/Composition self-loops visible on diagrams (group relations no longer hide loops).
- OEF relationship names are applied to diagram edge labels (requires arepos-server 0.6.4 for server normalize).
- Diagram Container default label placement is top-left.
- OEF import wizard no longer freezes before progress appears; footer buttons no longer overlap on step transitions.
- "Existing links found" dialog options are styled as clear interactive choices.

## [0.10.6] - 2026-07-25

### Changed
- Model relation matrix with a selected notation groups by node types and that notation’s link types, highlights pairs allowed by relation rules, and offers “Allowed by rules only” instead of binding-based “Unmapped”.

## [0.10.5] - 2026-07-25

### Fixed
- Relation matrix now shows component and relation custom properties from diagram instance snapshots (same values as on the diagram), not stale model-node defaults.

## [0.10.4] - 2026-07-24

### Fixed
- Interactive custom-property icons now appear on composite notation components (requires papirus 0.7.2).

## [0.10.3] - 2026-07-24

### Fixed
- Diagram palette Container inline label is persisted on save (was lost after reload).

## [0.10.2] - 2026-07-24

### Added
- Notation editor relation-rules matrix: edit allowed relations by component pair (filters, heatmap, copy/paste, keyboard navigation).

## [0.10.1] - 2026-07-23

### Fixed
- Creating a diagram with a notation not yet used in the model no longer leaves an empty palette until reload.

## [0.10.0] - 2026-07-23

### Added
- Notation export/import packages used custom shapes into the catalog on the target instance (select works after transfer; requires arepos-server 0.6.1 for API import).
- Notation visuals on model diagrams are bound per diagram instance instead of per model node.

### Fixed
- Creating a notation component/relation no longer collides on name+version; tree rename supported.
- nginx re-resolves the arepos upstream via kube-dns so `/api` and `/ws` keep working after backend pod IP changes.

## [0.9.1] - 2026-07-21

### Added
- `showLabel` flag in figure style: hide the canvas label while keeping the entity name in trees/panels.
- OEF import mapping loads the selected notation catalog (components/relations/types) even when the model has no diagrams for that notation yet; mapping dropdowns list all available targets.

### Fixed
- Toolbar toggles for outline attach / lock anchors / grid extras apply reliably (no skipped side-effect when local state was already synced).
- After drag, node positions no longer snap back when edge-to-edge links update midpoints.
- With «Lock link anchors» off, edge ends float to the nearest port toward the other node; turning the toggle off clears stored ports (requires papirus 0.7.1).
- After turning off «Attach to outline», reconnecting an end to a port no longer snaps back to the old outline point.
- Save toast appears immediately; validation / canvas flush no longer freeze the UI before «Saving…».

## [0.9.0] - 2026-07-21

### Added
- Large OEF (Open Exchange) imports: server-side XML normalize (`POST /models/{id}/oef/normalize`) and chunked batch-save apply with progress in the import wizard (requires arepos-server 0.6.0).
- OEF Organizations imported as Directory folders in the model tree.
- Migrate a diagram to a newer notation version from the version banner (in-place remap by component/relation name; save required).
- Connect a Note to a relation edge on the diagram (diagram-only edge anchor; requires papirus 0.7.0).

### Fixed
- nginx no longer rate-limits general `/api/` traffic (notation import and other SPA bursts hit 429); login/register/refresh limits remain.
- Transient `/auth/refresh` failures (429/5xx) no longer clear the session; refresh rate limit is relaxed.
- Re-saving/importing a notation after a partial failure no longer fails with 409: existing components/relations with the same name+version are reused.
- Notation palette icon picker search works again (spurious lazy-preview `@error` no longer wipes the option list).
- OEF import no longer fails with nginx 413 on huge batch-save bodies: payload is applied in chunks; normalize upload allows up to 100 MB via a dedicated nginx location.
- Large models load all node/link/diagram pages into the editor; live sync pull pages full snapshots.
- Duplicate OEF diagram names are uniquified on import; `parentNodeId` remaps correctly across node batch-save chunks.

## [0.8.18] - 2026-07-20

### Fixed
- Public diagram SVG share links render inline in the browser (`image/svg+xml`) instead of forcing a download (requires arepos-server 0.5.5).

## [0.8.17] - 2026-07-20

### Added
- OEF import support for diagram Containers and association/connection attachments to other connections via live edge-midpoint anchors (diagram-only, no model links for rel→rel).
- Diagram palette item for Containers (transparent fill, dashed stroke).
- Client-side guard against saving model nodes with blank names, with a clear batch-save error.

### Fixed
- Composite node selection/transformer frame no longer disappears after resize on the canvas.
- Tree/canvas renames are no longer overwritten by stale canvas labels during history sync (including names like `$`).
- Notation import save no longer fails with opaque type-name conflicts when the same type name already exists for another owner; clearer conflict messaging when the name is already taken for the current user.

## [0.8.16] - 2026-07-17

### Fixed
- Login via marketing-site `returnUrl` no longer bounces back when only a stale localStorage profile remains; the session is revalidated with `/auth/me` first.
- File uploads through the app nginx proxy no longer fail with HTTP 413 for bodies larger than 1 MB (limit raised to match the backend).

## [0.8.15] - 2026-07-16

### Changed
- Docker Compose quick-start no longer needs a local papirus clone: `@ngroznykh/papirus` comes from npm, and the named Docker context is an empty in-repo directory.

## [0.8.14] - 2026-07-16

### Added
- Docker Compose quick-start for a local wArchi stack with arepos-server, PostgreSQL, MinIO, and Cerbos.

## [0.8.13] - 2026-07-16

### Fixed
- VPS verification validates the active WebSocket proxy route without emulating STOMP through wget.

## [0.8.12] - 2026-07-16

### Fixed
- VPS verification checks the SPA shell instead of searching lazy-loaded landing text in index HTML.

## [0.8.11] - 2026-07-16

### Fixed
- Kept the VPS deployment workflow version contract synchronized with the published release tag.

## [0.8.10] - 2026-07-16

### Fixed
- App TLS certificate ownership survives removal of the temporary ingress during VPS cutover.

## [0.8.9] - 2026-07-16

### Fixed
- VPS cutover retries only transient ingress-health failures before triggering guarded rollback.

## [0.8.8] - 2026-07-16

### Fixed
- Recovery recognizes equivalent OCI index and image-config digests across Docker and containerd.

## [0.8.7] - 2026-07-16

### Fixed
- Recovery digest checks support the containerd/OCI format used by the production k3d cluster.

## [0.8.6] - 2026-07-16

### Fixed
- VPS deployment retains the verified 1 GiB backend memory limit instead of insufficient chart defaults.
- Recovery mode reuses digest-verified images and builds only missing immutable release images.

## [0.8.5] - 2026-07-16

### Fixed
- VPS backup validates PostgreSQL dumps through bounded file-based checks with guaranteed cleanup.

## [0.8.4] - 2026-07-16

### Fixed
- VPS backup archives MinIO through a serialized, read-only helper pod and always restores application replicas.

## [0.8.3] - 2026-07-16

### Fixed
- VPS deployment preflight uses the projects' pinned release branches instead of a potentially stale remote default.

## [0.8.2] - 2026-07-16

### Added
- Backup-first, verified deployment workflow for the `warchi.ru` VPS/k3d production environment.

### Changed
- Exported notation, diagram, and relation-matrix filenames are transliterated to readable ASCII.

## [0.8.1] - 2026-07-16

### Added
- Local HTTPS for the wArchi SPA in Kubernetes (self-signed cert for cluster hostname access).

### Changed
- Refreshed in-app help for models, notations, admin, auth, and related topics.

### Fixed
- Admin permanent-delete shows a clear conflict message when active models still use a notation.
- SSO return URLs accept both `http` and `https` for the marketing site.

## [0.8.0] - 2026-07-14

### Added
- Content-Security-Policy and related security headers on nginx SPA/static responses, with `verify:csp` check script.

### Changed
- Diagram styling UI and notation attrs live in shared `diagram-style` / `domain/attrs` modules used by models and notations.
- Markdown preview and wiki/docs HTML go through DOMPurify sanitization.
- `@ngroznykh/papirus` updated to 0.6.5.

### Fixed
- Landing page iframe embed under CSP (`frame-ancestors 'self'` / `X-Frame-Options: SAMEORIGIN`).
- Landing fonts self-hosted (Manrope, JetBrains Mono) so Google Fonts no longer violate `style-src`.

## [0.7.1] - 2026-07-09

### Fixed
- Shared resource dialogs correctly load access shares from the arepos `ListResponse` `{ items }` envelope.

## [0.7.0] - 2026-07-06

### Added
- HttpOnly cookie authentication with CSRF protection on API writes (replaces access tokens in localStorage/WebSocket URLs).
- Password policy UI for registration and admin user forms.
- Helm infrastructure phase 2: optional network policies, pod disruption budget, `/health` endpoint, and local CI/version-sync scripts.

### Changed
- Catalog list responses show owner display names and emails from the list API (`ownerDisplayName` / `ownerEmail`).
- Shape editor shows form owner labels consistently with type editors.
- Icon pickers lazy-load SVG previews to avoid loading every icon on mount.
- nginx SPA routing: no cache for `index.html`/app routes, long-lived cache for hashed assets; register rate limit aligned with nginx limits.

### Fixed
- Catalog pages (models, notations, types) correctly read arepos `ListResponse` `{ items }` envelopes instead of only Spring `content`, so entities render again.
- Diagram lock verify-before-save no longer crashes on the same list envelope.

## [0.6.5] - 2026-07-06

### Fixed
- Model editor save no longer crashes when verifying diagram edit lock: `/diagram-locks` list responses use the `{ items }` envelope instead of a bare array.

## [0.6.4] - 2026-06-04

### Added
- OEF import now supports ArchiMate diagram notes (`Label`/`Note` view nodes) and annotation lines (`Line` connections without a relationship reference), mapping them to diagram-only note instances on import.

### Removed
- Residual French (FR) locale on the landing page, unused `fr` message blocks in i18n locale files, and release docs references to `CHANGELOG.fr.md`.

## [0.6.3] - 2026-05-19

### Added
- Open Exchange (OEF XML) import flow in the model editor: source analysis, type/relation mapping, import preview, and create-only batch-save payload generation for nodes, links, and diagrams.
- Import report now includes a dedicated summary of required properties that remain unfilled after import/default-value prefill.

### Changed
- OEF import now pre-fills node-type, notation component, and notation relation custom properties from configured `defaultValue` values during entity creation.
- Tree search in the model left panel now matches diagram names in addition to node names, including root-level diagrams and diagrams nested in folders.

### Fixed
- Tree search results no longer keep unrelated diagrams visible inside matched folders; when a search query is active, only matching diagrams are shown.
- Root diagram handling was aligned with hidden tree root semantics: creating/moving diagrams to the root resolves to `treeRootNodeId`, while legacy `nodeId = null` remains visible in the tree.

## [0.6.2] - 2026-04-28

### Changed
- Landing page quick start now reflects the actual local development workflow: run `arepos-server` with `./gradlew bootRun`, run `warchi` with `npm install && npm run dev`, and use API `curl` as an optional smoke check.

## [0.6.1] - 2026-04-28

### Changed
- Landing page deployment guidance was updated to match the current setup flows: Docker run for `arepos-server` via `bootBuildImage`, and Kubernetes deployment options via repository `deploy.sh` scripts or infra scripts for Yandex Cloud.
- Footer branding text now displays `wArchi` instead of the author name.

## [0.6.0] - 2026-04-17

### Added
- Model relation matrix view with filters by folders/nodes/relations, aggregated intersections grid, and a details panel for selected cells.
- CSV and PNG export actions for the relation matrix to share analysis results from the model editor.

## [0.5.9] - 2026-04-10

### Fixed
- Notation editor: opening a notation no longer shows unsaved changes immediately when server `attrs` differ from the canonical JSON the editor writes for the diagram layer (e.g. shared or older notations).

## [0.5.8] - 2026-04-10

### Fixed
- Model editor: dragging a tree node onto the diagram when multiple notation components match the node type now adds the canvas instance right after you pick a component in the dialog; the first drop no longer binds the type silently without placing the shape (closing the modal without a choice clears the pending drop).

## [0.5.7] - 2026-04-10

### Fixed
- Node shapes editor: if saving wiki content succeeds but `POST /documents` fails (e.g. insufficient rights), the user now sees an error toast instead of failing silently (RU/EN/FR).

## [0.5.6] - 2026-04-10

### Fixed
- Wiki documentation now follows share permissions: users with VIEW can open and read linked markdown in the document modal (read-only); creating or editing content requires EDIT or higher. Toolbar and panel entry points stay hidden for VIEW when no document file is linked yet (model, diagram, notation, types, and shapes).
- Notation editor: documentation block and modal for relations (same rules as components); notation header wiki button visibility matches the model editor pattern.

### Added
- Model editor: user-visible message when registering a document link via `POST /documents` fails (RU/EN/FR).

## [0.5.5] - 2026-04-10

### Changed
- Model editor loads notation-related data with model context: components and relations are requested per notation with `modelId` and `notationId`, and relation rules loading includes `modelId`, matching server-side access rules for shared models.
- Fallback notation meta fetch for the active diagram includes `modelId` when calling `/notations/{id}/meta`.

## [0.5.4] - 2026-04-07

### Fixed
- Diagram SVG export now preserves edge label direction (`labelFollowPath`) and line gap under labels (`labelLineGap`) in line with canvas rendering.

## [0.5.3] - 2026-03-31

### Added
- Square (`square`) as a start/end edge marker option in the notation style panel (RU/EN/FR), aligned with Papirus `ArrowMarkerType`.

## [0.5.2] - 2026-03-31

### Changed
- Composite notation/model flows use a shared `createDefaultCompositeContent` helper so default composite trees stay consistent when initializing or resetting content.
- Composite text bindings align with Papirus `bindToProperty` (including `__name__` for the displayed node name) instead of legacy role-based metadata.

## [0.5.1] - 2026-03-31

### Added
- Expanded in-app help and `docs/composite-components.md` for configuring composite components in model and notation editors (EN/RU/FR).

### Changed
- Notation `attrs`: stricter parsing and normalization of `compositeShapeType` against allowed composite diagram shapes.

## [0.5.0] - 2026-03-31

### Added
- Full composite component editor in notation workflows: component kinds, per-type inspectors, full shape picker, and property-based style/binding UI instead of raw JSON patch editing.
- Composite bindings in notation and model editors: text components can bind to node name/custom properties, and icon bindings to notation icons are resolved in the model palette.
- Extended edge label controls in notation diagrams: label position along path, follow-path behavior, multiline labels via `\n`, and improved style binding support.

### Changed
- Notation composite panels and tree UX were redesigned for clearer visual hierarchy, human-readable component names, and improved consistency with node/style panels.
- Model editor now shows a composite style tab for composite elements and provides restore-from-notation actions where applicable.

### Fixed
- Edge style behavior in notation/model editors: label inset application for new edges, explicit `markDirty` after inset updates, and fallback notation style for diagram-only links.
- Composite preview/runtime fidelity: custom-shape outlines, container borders, scroll behavior, non-removable tree node actions, and tree structure constraints.

## [0.4.6] - 2026-03-27

### Added
- French (FR) UI locale across the app; landing page language switcher (RU/EN/FR) aligned with in-app locale.
- In-app user documentation in French (`*.fr.md`) and French changelog (`CHANGELOG.fr.md`) for docs and home release notes.
- `scripts/build-models-fr.mjs` and generated `models.fr.generated.ts` for model editor strings.

### Changed
- Documentation markdown loader and home changelog source follow `fr` alongside `ru` / `en`.
- Release skill documents maintaining `CHANGELOG.fr.md` with EN/RU each release.

### Fixed
- `CHANGELOG.ru.md`: restored missing `## [0.0.27]` section to match the English changelog history.

## [0.4.5] - 2026-03-26

### Fixed
- Production Docker image nginx now proxies `/ws` to the API so model live sync (STOMP) and spectator live diagram view with remote pointer work when the SPA is served from the same host as `/api`.

## [0.4.4] - 2026-03-25

### Fixed
- Diagram export to SVG: edges that use explicit start/end markers no longer draw an extra arrow on an end where the marker is `none` (aligned with on-canvas rendering).

## [0.4.3] - 2026-03-25

### Added
- Live diagram view for spectators: updates over the model sync channel, remote pointer on the canvas, and a compact viewers list in the editor header.
- Client-side granular model sync helpers: event deduplication/coalescing and optional sync telemetry for debugging.

### Changed
- Model live sync and merge path tuned for granular server events and high-frequency updates.

## [0.4.2] - 2026-03-25

### Added
- In-app notification when an administrator force-releases your diagram lock.
- Admin diagram lock table shows resolved diagram paths for each lock.

### Changed
- Redesigned admin area tabs and the diagram lock indicator in the editor.

### Fixed
- Diagram locks: verify you still hold the lock before saving; detect another user taking the lock or admin force-release via lock-list polling; after force-release, reload server-backed state and exit conflicting edit paths without incorrectly re-acquiring a released lock.

## [0.4.1] - 2026-03-25

### Fixed
- Custom searchable and multi-select dropdowns stay within the viewport: panels open upward when the control is below mid-screen, with height clamped to available space.

### Changed
- Multi-select panel is teleported to `document.body` and uses the same placement rules as searchable selects (avoids clipping inside scrollable side panels).

## [0.4.0] - 2026-03-25

### Added
- Model live sync on the frontend: configurable modes (`ws`, `poll`, `hybrid`), STOMP subscription, and polling fallback via environment variables.
- Diagram edit locks: acquire/release while editing the latest diagram version, lock holder display, and admin view for open locks.
- Batch save conflict handling in Model Editor with field-level compare, reload vs overwrite, and cross-deleted link warnings where relevant.
- Traceability panel: highlight whether a model link is already on the active diagram; drag an eligible link from traceability onto the canvas to place its edge.
- Availability guard and related login/docs flows for clearer behavior when the API is unreachable.

### Changed
- Model Editor refactored into smaller composables for load, save pipeline, notation relations/rules loading, and merge after reload.
- Authentication redirect: login preserves return to a protected route; successful registration still lands on home.
- In-app and technical documentation updated for live sync, diagram locks, save conflicts, and auth.

## [0.3.1] - 2026-03-22

### Added
- Added link type labels for each relation in the Model Editor traceability tree.
- Added a link type filter in the traceability panel to focus branch traversal by relation kind.

### Changed
- Updated traceability tree counters and branch expansion to respect the selected link type filter.

## [0.3.0] - 2026-03-22

### Added
- Added traceability exploration capabilities in Model Editor with focused trace branch inspection.
- Added traceability panel enhancements for clearer branch structure and navigation context.

### Changed
- Improved Model Editor traceability interactions and focus behavior for faster dependency analysis.
- Updated related localization strings for the new traceability UX.

## [0.2.1] - 2026-03-21

### Added
- Added node folder tabs in the diagram editor for faster navigation across model structure.
- Added clipboard support for note instances in Model Editor.

### Changed
- Improved model link handling flows in editor interactions.
- Added delete/rename actions in entity cards and catalogs to streamline item management.

## [0.2.0] - 2026-03-21

### Added
- Added support for `FILE` resources in the frontend permission contract for policy-based access checks.

### Changed
- Migrated critical editor actions to policy-driven permission checks and removed remaining role-based privileged branches.
- Extended permission resource coverage for node and link types to keep UI authorization behavior consistent.

## [0.1.4] - 2026-03-20

### Added
- Improved dashboard data grouping and owner-name resolution flows for clearer aggregated views.

### Changed
- Enhanced model/notation editing workflows including more robust batch save and relation-rules synchronization behavior.
- Improved batch sharing behavior and type/document editor integrations for smoother cross-entity updates.

## [0.1.1] - 2026-03-17

### Changed
- Connection creation preview in model and notation editors now uses a straight line by default while dragging a new link.

## [0.1.0] - 2026-03-15

### Added
- Newer notation version notification in Model Editor when a diagram uses an outdated notation.
- Extended model version comparison workflow with clearer difference presentation.

### Changed
- Improved diagram version management and rename flows in Model Editor.
- Refined documentation/navigation experience and scoped property formatting in editor panels.

## [0.0.28] - 2026-03-04

### Added
- Navigation-only mode in Model Editor: diagram and palette can be explored without accidental drag-and-drop edits.

## [0.0.27] - 2026-03-03

### Added
- New switch-style toggles for boolean settings in style and properties panels.
- New edge style option to create a gap under edge labels for better readability on dense diagrams.

### Changed
- Improved consistency of boolean controls across model and notation editors.

## [0.0.26] - 2026-03-02

### Added
- Hover hints (`title`) for compact numeric fields in the style panel (`W/H/R`, `PT/PB/PL/PR`, `T/R/B/L`) so abbreviated labels are easier to understand.

### Changed
- Localized inset sync button captions (`Pair`/`All`).

## [0.0.25] - 2026-02-28

### Changed
- Improved model editor stability for link synchronization and validation.

### Fixed
- Fixed edge label text propagation when restoring links during diagram open/sync (newly created runtime edges no longer lose label text).
- Fixed edge style panel label input binding to correctly display label text for both string and object label forms.

## [0.0.24] - 2026-02-28

### Added
- Diagram versioning and baseline: create a new diagram version (baseline) from the current one via ModelEditor.
- Version switcher in diagram editor for viewing and switching between diagram versions (read-only for non-latest).

### Changed
- Model editor: baseline creation flow and version display.

## [0.0.23] - 2026-02-28

### Added
- Group drag in model diagram: drag a node inside a container to move both together.
- Auto-linking in groups: when dragging a node into a container with group relation, prompts to create or reuse a link (configurable via "Auto-links in groups" toggle in diagram settings).
- System property flag (`system`) on CustomProperty for notation-defined special behavior (e.g. `group` for grouping mode).

### Changed
- Model editor: existing link reuse and relation selection modals for auto-link flow.
- Modal keyboard navigation and focus management improvements.

### Fixed
- System properties are no longer shown in model editor properties panel (ModelPropertiesPanel).
- System properties excluded from required validation on save (user cannot edit them).

## [0.0.22] - 2026-02-27

### Added
- SVG icon selection for node types in the types editor.
- Icon field for node types (notationAttrs): tree display in model palette with custom icons from public/icons.
- availableIcons config with pre-defined icon options.

### Changed
- User profile: save button aligned with design system (btn--primary, save icon), active only when profile has unsaved changes.
- SearchableSelect enhancements for IconPicker integration.

## [0.0.21] - 2026-02-27

### Added
- Owner display name resolution in model editor: diagram notation info now shows owner name (fallback to email).

### Changed
- Model editor: clearer ownership information for diagrams.

## [0.0.20] - 2026-02-27

### Added
- Document management in model editor: open and save documents for models, nodes, and diagrams.
- Document version display and version-switching UI in DocumentEditorModal and TypeDocumentPanel.

### Changed
- DocumentEditorModal: improved version handling and editing state management.
- Improved document workflows in Model Editor.

## [0.0.19] - 2026-02-26

### Added
- DocumentEditorModal for editing markdown documents with version history.
- TypeDocumentPanel version history support.

### Changed
- i18n messages for document/version UI.

## [0.0.18] - 2026-02-26

### Added
- SearchableSelect component with search, custom slots, and `allowEmpty` support.
- TabPanel component with icon tabs and active tab underline.
- Tabbed right panel in notation editor (Properties + Figure Style tabs), replacing the bottom resizable properties panel.
- Tabbed right panel in model editor, replacing the collapsible stack layout.
- More consistent selection and tabbed editing experience across editors.

### Changed
- Unified editor UI behavior and visual consistency.

## [0.0.17] - 2026-02-25

### Added
- Outline ON setting in model editor toolbar: attach edges to shape contour instead of ports (enabled by default).

## [0.0.16] - 2026-02-25

### Fixed
- When switching edge type from polyline or editable-polyline to bezier or straight, control points are now removed to prevent distorted arrow rendering.

## [0.0.15] - 2026-02-25

### Added
- Auto-reload on blue-green deployment: app periodically checks `version.json` and on new version shows a toast, then reloads the page.

## [0.0.14] - 2026-02-25

### Added
- Full RU/EN localization of the interface with language switcher in the header.
- Localized documentation: all help sections (overview, models, notations, diagrams, types, hotkeys, FAQ) and changelog available in both Russian and English.

### Changed
- Documentation content loads based on current locale; switching language updates docs content.

## [0.0.13] - 2026-02-24

### Added
- Added component palette grouping in notation attrs (`paletteGroup`) with editing support in notation custom properties.
- Model editor palette now separates component groups with dividers and sorts components alphabetically within each group.

### Changed
- Note creation in model editor no longer opens the note text modal automatically.
- Edge context menu now shows explicit note-link labeling and note-link-specific delete action text for diagram-only links.
- "Palette Group" settings block now matches other collapsible sections in notation properties panel.

### Fixed
- Fixed palette grouping visual separation when the first component group is greater than `0` (components no longer appear in the same visual group as note).

## [0.0.12] - 2026-02-24

### Changed
- Notation diagram nodes now derive anchor/port counts from component style settings (`portsTop/Right/Bottom/Left`) with sane defaults.
- Disabled interactive connection/reconnection start in notation editor canvas runtime to keep notation editing flow component-focused.

## [0.0.11] - 2026-02-23

### Added
- Improved repeatability of the release process.

### Changed
- Unified model/notation editor toolbar visuals: compact share icon button, matching floating-canvas toolbar style, and hidden duplicate top toolbar in notation editor.
- Persisted model diagram toolbar toggles per user (grid, minimap, snap, lock anchors) and synchronized restored values with canvas runtime.

### Fixed
- Added confirmation dialogs before deleting nodes/diagrams from left tree and before deleting nodes from canvas in model editor.
- Fixed model editor undo/redo drift by routing add/connect/delete flows through consistent history/state synchronization.
- Fixed redo artifacts where connection markers/styles could reappear in multiple phases after reconnecting edges.

## [0.0.10] - 2026-02-23

### Fixed
- Notation export now includes only active notation entities and only node/link types that are actually used by exported components and relations.
- Restored notation rename flow in catalog cards with modal UI, duplicate validation, and backend update via `PUT /notations/{id}`.

## [0.0.9] - 2026-02-22

### Added
- ACL-based sharing UI for models, notations, and types with access management modal.
- Support for share permissions `VIEW` and `EDIT`, including effective access badges in catalogs.
- User profile and admin users pages with normalized role handling (`ADMIN` / `USER`).
- Diagram info action in model editor toolbar with notation metadata (name/version/owner) fallback loading.
- Notation metadata endpoint support in frontend (`/notations/{id}/meta`) for diagrams referencing inaccessible notations.

### Changed
- Removed legacy `EDITOR` role assumptions from auth, routing, and entity filtering flows.
- Updated model/notation/type editors to rely on backend ACL responses instead of owner-only client filtering.
- Refined API error messaging for revoked or missing shared access scenarios.

### Fixed
- Multiple shared-edit save regressions (403/409) in model and notation editing flows.
- Sharing UX issues in user search and share assignment defaults.
- Home dashboard hero text clipping and panel sizing issues.

## [0.0.8] - 2026-02-21

### Added
- Composite label templates for diagram nodes with `${name}` and `${propertyName}` placeholder syntax.
- Line break support (`\n`) in label templates for multiline node labels.
- Label text alignment control (left / center / right) independent of label placement.
- Label template editing UI in NodeStylePanel and CustomPropertiesPanel with live preview.
- `editableText` support in Papirus TextLabel for separate display and inline-edit text.
- Auto-sync of default custom property values on model load for new required properties.

### Changed
- Inline label editing (double-click) now shows only the component name, not the resolved template.

### Fixed
- Model nodes not receiving label templates from notation when dragged from palette.
- Diagram labels not updating in real-time when custom property values change.
- Validation errors when notation gains new required properties after model nodes already exist.


## [0.0.5] - 2026-02-20

### Added
- Added model rename actions in both model editor header and models catalog cards.
- Added duplicate name/version validation for model rename flows.
- Added node z-order persistence in diagram attrs (`attrs.zIndex`) to keep layering after reopen.

### Changed
- Updated node layering logic: smaller nodes are rendered above larger ones.
- Updated equal-size tie-break for node layering: selected node is lifted above others.

### Fixed
- Fixed model diagram build/lint issues in z-order helper logic.


## [0.0.4] - 2026-02-19

### Added
- Added workspace preference persistence for notation component list tags collapse state.
- Added release notes section on Home page that shows current version changes from `CHANGELOG`.

### Changed
- Moved notation title/version metadata from left panel to header and aligned header visuals with model editor style.
- Updated notation left panel controls: compact icon buttons, moved sorting near search, and moved elements counter next to title.
- Expanded header space in model/notation editors to keep long names visible without truncation.

### Fixed
- Fixed notation component list control row height so sorting select no longer stretches neighboring icon buttons.
- Fixed missing persistence of tags section collapse/expand state between sessions.


## [0.0.3] - 2026-02-19

### Added
- Added node and edge context-menu actions in model editor canvas: node deletion from current diagram, edge type switching, and edge deletion flow.
- Added edge type icons to context menu (`straight`, `polyline`, `bezier`) matching the style panel controls.
- Added node port count controls in style panel (`top`, `bottom`, `left`, `right`) with persistence in `attrs.diagramStyle`.

### Changed
- Moved style panel action buttons (restore from notation, collapse/expand) into the `Фигура/Связь` header row and removed redundant `Стиль` row to save space.
- Unified style-panel header action buttons appearance with left tree panel icon buttons.
- Added unsaved-changes confirmation when closing an active diagram (`Сохранить / Не сохранять / Отмена`).

### Fixed
- Fixed edge port rebind tracking so save button activates and undo/redo updates correctly after reconnecting to another port.
- Fixed edge deletion from current diagram to participate in undo/redo history.
- Fixed applying custom port counts and anchor points after diagram reopen.


## [0.0.2] - 2026-02-19

### Added
- Added edge deletion confirmation with actions to remove a connection from the current diagram or from the model entirely.
- Added a collapsible style block in model editor right panel with a quick action to restore styles from notation.
- Added required custom-property validation before save for model nodes and links.

### Changed
- Updated model editor side layout to support resizable and collapsible left/right panels.
- Improved link reuse dialog labels to show relation type and label value instead of link ID.
- Updated custom-property editors to render inputs according to property types (including enum select).

### Fixed
- Fixed edge style persistence and re-application after reopening diagrams.
- Fixed undo/redo history handling when switching or closing diagrams.
- Fixed default custom-property values initialization when adding nodes from palette and when binding components/relations.
- Fixed diagram switch flow with unsaved changes by allowing save/discard decision and proper state reload on discard.

