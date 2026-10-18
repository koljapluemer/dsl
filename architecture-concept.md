Feature sliced architecture, where layers contain folder, and everything may only import from down, not from the side and definitely not from above.


- `db`: A thin shim onto the single shared Dexie Cloud database (`src/shared/db/db.ts`) - maps this app's local table names onto its own prefixed tables there (`db.table<Row, 'pk'>('<appSlug>_<tableName>')`). Holds DB row types. Necessary evil. Should be as small as possible. See `add-a-new-app.md` for the exact pattern.
- `dumb`: collection of simple, reusable stuff. no business logic. may not import from ANY other high-level folder. may cross-import within the folder. put assets here (if needed)
- `entities`: models/entities. One folder per user-space entity such as "flashcard". May import from `db`, but nothing else.
- `features`: ways of interacting with entities. one folder per feature, following an entity-action (e.g. flashcard-manage) pattern. may NOT import one another. may ONLY import from `dumb` or `entities`, NEVER from other features.
- `pages`: One folder per page (a page is something used by the `router.ts` file). If functionality is ONLY used on a given page, put it in the page *folder* (avoid having just a single giant page file, split it up!), do not create features or meta-features that are only used by one single page.

No other high-level folders are allowed.
Do not use `index.ts` file reexporting components, simply export directly.