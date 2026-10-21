# Docs

Notes for developing dsl-crud: patterns and decisions that span several files.
They explain how pieces fit together and where to change things; the code
itself is the reference for the details. Setup, running and a per-view tour
are in the top-level [`README.md`](../README.md).

- [`frontend-architecture.md`](frontend-architecture.md) — the frontend's layers and what may import what
- [`note-component.md`](note-component.md) — the one component every note is shown with: its parameters, relationships widget, modes, and each page's configuration
- [`relationships.md`](relationships.md) — outgoing relationships and backlinks: endpoints and the `item-relate` widget
- [`hiding.md`](hiding.md) — which notes a view leaves out, the hide button, and its undo

Elsewhere:

- [`spec/language.md`](../spec/language.md), [`spec/keywords.yaml`](../spec/keywords.yaml) — the item language
- [`prompts/pick-questions.md`](../prompts/pick-questions.md) — the LLM prompt the questions view uses (read by `questions.py`)
