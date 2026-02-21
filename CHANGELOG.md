# Changelog

All notable changes to this project are documented in this file.

## [0.0.8] - 2026-02-21

### Added
- Added composite label templates for diagram nodes with `${name}` and `${propertyName}` placeholder syntax.
- Added `\n` line break support in label templates for multiline node labels.
- Added label text alignment control (left / center / right) independent of label placement.
- Added label template editing UI in NodeStylePanel and CustomPropertiesPanel with live preview.
- Added `editableText` support in Papirus TextLabel for separate display and inline-edit text.
- Added auto-sync of default custom property values on model load for new required properties.

### Changed
- Updated Papirus to 0.3.6 with text align support and basic example enhancements.
- Updated inline label editing (double-click) to show only the component name, not the resolved template.

### Fixed
- Fixed model nodes not receiving label templates from notation when dragged from palette.
- Fixed diagram labels not updating in real-time when custom property values change.
- Fixed validation errors when notation gains new required properties after model nodes already exist.

### Release
- Bumped application version to `0.0.8` in package metadata.
- Tagged and pushed release tags `v0.0.6`, `v0.0.7`, `v0.0.8`.

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

### Release
- Bumped application version to `0.0.5` in package metadata, footer, Docker/Helm scripts, and chart values.
- Tagged and pushed release tag `v0.0.5`.

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

### Release
- Bumped application version to `0.0.4` in package metadata, footer, Docker/Helm scripts, and chart values.

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

### Release
- Bumped application version to `0.0.3` in package metadata, footer, Docker/Helm scripts, and chart values.

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

### Release
- Bumped application version to `0.0.2` in package metadata, footer, Docker/Helm scripts, and chart values.
- Tagged and pushed release tag `v0.0.2`.
