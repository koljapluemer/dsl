# Frontend architecture

`frontend/src` is feature-sliced. Each layer imports only from the layers below
it, and slices of one layer don't import each other. `just check` enforces this
(oxlint with `eslint-plugin-boundaries`, rules in `frontend/oxlint.config.ts`).

| Layer      | Holds                                                                 | May import from               |
|------------|-----------------------------------------------------------------------|-------------------------------|
| `pages`    | one folder per route; code only one page uses lives there             | meta, features, entities, dumb, api |
| `meta`     | flows that coordinate multiple features                               | features, entities, dumb, api |
| `features` | ways of acting on entities, named entity-action (`item-delete`)        | entities, dumb, api           |
| `entities` | one folder per entity (`item`, `graph`, …): queries, mutations, views | dumb, api                     |
| `dumb`     | generic pieces without app logic (modal, markdown, store, undo toast) | itself                        |
| `api`      | the fetch wrapper and the API's types                                 | itself                        |

`main.tsx`, `router.tsx` and `App.tsx` (tabs, error banner, undo toast) sit at
the root. No other top-level folders.

Conventions:

- Something two features need goes down a layer, usually into `dumb` when it
  has no app logic. That's why the undo toast's store is `dumb/undo.ts` and not
  part of `item-delete`.
- Use `meta` only for real feature composition. For example, `note-panel`
  shows a note and composes `item-edit`, `item-media`, `item-delete` and
  `item-relate` into its editor and actions; each feature remains usable
  on its own.
- Don't make a feature that only one page uses. Put it in the page's folder,
  split into files rather than one big page file.
- No `index.ts` re-exports. Import from the defining file.
