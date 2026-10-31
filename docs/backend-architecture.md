# Backend architecture

The backend is the `dsl_crud` package. Run it with `python -m dsl_crud`; Flask
development uses `flask --app dsl_crud`. `dsl_crud.application.create_app` is
the composition root: it registers feature blueprints, error handlers, export
definitions, the export-after-write hook, and the frontend fallback.

## Structure and dependency direction

| Area | Responsibility | May import |
|---|---|---|
| `core` | DSL parsing, document interpretation, text edits, inline references, file kinds | standard library and third-party libraries |
| `infrastructure` | configuration, indexed item files, attachments, exports, Ollama, headless Chromium (`chromium.py`, for the portfolio's cards, viz blocks and PDF export) | `core` |
| `features/<name>` | one user-facing capability, with its HTTP adapter in `routes.py` | `core`, `infrastructure`, and its own package |
| `application.py`, `web.py`, `__main__.py` | composition, shared HTTP helpers, process startup | every layer as needed |

Feature packages do not import other feature packages. If two features need a
concept, put it in `core` only when it is part of the item language or document
model; put filesystem, process, or service access in `infrastructure`. Do not
create a generic `utils.py` or route calls through another feature's service.

`just check` runs Import Linter contracts for these rules. A new feature must
be added to the feature-independence contract in `pyproject.toml` as well as to
the blueprint list in `application.py`.

## Feature slices

Routes decode Flask input and encode responses. Behavior stays in the slice's
service or purpose-named modules. The current slices are items and attachments,
derived list views, search, graph, canvas, questions, flashcard learning, bibliographic sources, portfolio,
daily notes, viz blocks, Typst documents, PDF export, maintenance, and settings. Source matching and BibTeX conversion stay with
sources; semantic ranking stays with search; collage rendering stays with the
portfolio.

Exports are registered explicitly by the application factory. Merely importing
a renderer must not mutate the export registry. The factory also registers the
bibliography Typst documents cite (`typst.register_bibliography`), rendered by
the sources feature, so Typst needs no import of it. Configuration and user data
retain their existing locations and formats.

## Repository resources and tests

`spec/` remains at repository root because it is the language contract shared
by the Python and TypeScript parsers. A feature-owned resource, such as the
question-selection prompt, lives beside that feature.

Tests import the module that defines the behavior; there are no old top-level
Python aliases. Filesystem tests replace `infrastructure.config.CONFIG_PATH`
and use temporary data directories. Application tests create independent apps
with `create_app()` and assert the public routes rather than reaching through a
global Flask object.
