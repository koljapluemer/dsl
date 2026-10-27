# Docs

Notes for developing dsl-crud: patterns and decisions that span several files.
They explain how pieces fit together and where to change things; the code
itself is the reference for the details. Setup, running and a per-view tour
are in the top-level [`README.md`](../README.md).

- [`frontend-architecture.md`](frontend-architecture.md) — the frontend's layers and what may import what
- [`backend-architecture.md`](backend-architecture.md) — backend feature slices, dependency rules, and composition
- [`note-component.md`](note-component.md) — the one component every note is shown with: its parameters, relationships widget, modes, and each page's configuration
- [`relationships.md`](relationships.md) — outgoing relationships and backlinks: endpoints and the `item-relate` widget
- [`canvas.md`](canvas.md) — the Canvas tab: how a canvas is stored in a note's data, written, and kept consistent
- [`hiding.md`](hiding.md) — which notes a view leaves out, the hide button, and its undo

Elsewhere:

- [`spec/language.md`](../spec/language.md), [`spec/keywords.yaml`](../spec/keywords.yaml) — the item language
- [`pick-questions.md`](../dsl_crud/features/questions/pick-questions.md) — the LLM prompt owned by the questions feature
