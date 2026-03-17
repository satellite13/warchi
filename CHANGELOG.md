# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

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

