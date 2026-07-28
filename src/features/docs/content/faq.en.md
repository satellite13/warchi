# Frequently Asked Questions

## General

### What is wArchi?

wArchi is a web application for managing architectural models. It allows you to create visual diagrams, describe system components and their relationships, and version all artifacts.

### Which browsers are supported?

wArchi supports all modern browsers: Chrome, Firefox, Safari, Edge. Using the latest browser version is recommended for best performance.

## Models

### How do I create a new model version?

Open the model in the editor, then use the create new version function. The new version will contain a copy of all data from the current version.

### How do I rename a model?

Click the model name in the editor header — the field becomes editable. Renaming is also available through the model card in the catalog.

### Can I delete a model?

Yes, a model can be deleted from the model list. Note that deletion is irreversible and affects all model versions.

### How do I attach a notation to a model?

The notation is selected when creating the model. The notation defines available element types and their visual representation on diagrams.

### How do I work with multiple diagrams?

A model can contain multiple diagrams. Create a new diagram via the context menu in the model tree. Switch between diagrams by clicking them in the tree. When switching with unsaved changes, the system will prompt to save or discard them.

### What should I do on a save conflict?

If another user already saved the same nodes, links, or diagram, a **Save conflict** dialog appears. Choose **Reload from server** (reload the model and save again) or **Overwrite server with my data**. Details: [Models → Save conflict](/docs/models).

### How are changes synced between users?

The open model editor uses live sync (WebSocket + polling). Your local unsaved draft stays in the tab; conflicts with the server go through the save conflict dialog. Concurrent canvas editing on one diagram is limited by an edit lock — see [Diagrams](/docs/diagrams).

### Where are the relation matrix and Open Exchange import?

In the model editor header: **Relation matrix** and **Import Open Exchange (XML)**. See [Models](/docs/models).

## Notations

### Why do I need notations?

Notations define the "language" of a diagram — which element types are available, how they look, and how they can be connected. For example, you can create a notation for C4 diagrams or UML.

### Can I use one notation for multiple models?

Yes, one notation can be used in multiple models.

### How do I import/export a notation?

A notation can be exported to JSON via the button on the notation editor toolbar. Import is done through the same panel — select a JSON file with the notation description.

## Diagrams

### How do I export a diagram?

Two export formats are available on the toolbar:

- **PNG** — raster image, suitable for presentations and documents
- **SVG** — vector image, scales without quality loss

### Why can't I connect elements?

Ensure that the model's notation has relation rules configured that allow connecting the selected element types. If rules are not set, links between elements will not be available.

### Why is the diagram read-only?

Another user holds the canvas **edit lock**. Wait for release, or ask an admin to force-release it under [Administration → Diagram locks](/docs/admin).

### How do I use the grid and snap?

Enable the grid and snap via the toolbar buttons. With snap enabled, elements will align to the nearest grid lines when moving.

## Types

### What's the difference between types and notation components?

Types are global entities: the name and **node type properties** (one value per node across the model; in labels — `#{name}`). Notation components add visuals and **component properties** (diagram-scoped values; in labels — `${name}`). See [Models → Properties panel](/docs/models) and [Notations → Label templates](/docs/notations).

### How do I add a custom property to a type?

Open the type in the types editor and add a property with the name, data type, and default value. The property will be available in all models using this type.

## Versioning

### What versioning system is used?

wArchi uses semantic versioning (SemVer) in the format `MAJOR.MINOR.PATCH`. This allows tracking changes and maintaining multiple versions of an entity.

### Can I revert to a previous version?

Each entity version is stored separately, so you can view and work with any of the created versions.
