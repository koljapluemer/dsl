# dsl

The spec for a plain-text item language: one item per file, written by hand
and read by several frontends (the calendar app in `../calendar`, the editor
in `../dsl-crud`, the note graph in `../graphirst`).

- [`spec/language.md`](spec/language.md): the file structure, syntax, value
  types, and error and warning codes. It knows no individual keywords.
- [`spec/keywords.yaml`](spec/keywords.yaml): every keyword, with its role,
  arguments, options, exclusions and meaning.
- [`spec/examples/`](spec/examples): conformance cases, each a `.txt` file and
  its expected parse as `.json`.

```
HCI lecture 4pm-7pm
(bring laptop)
recurring mo until 27-03
-> is part of @semester-plan-a1b2c3
extra
Room D139, slides on the wiki.
```

## Using it in a frontend

Pull this repo in as a git submodule, or reference it by path. A frontend's
parser implements `language.md` once. It should read `keywords.yaml` (at
build time, or at runtime) instead of hardcoding keyword names, roles and
argument types. Then a new keyword's syntax reaches every frontend without
code changes. Only the keyword's *meaning* needs code in each frontend that
cares about it.

Run every case in `spec/examples` in the frontend's test suite (see
[Conformance](spec/language.md#conformance)), so parsers don't drift apart.

## Extending

1. Add the keyword to `keywords.yaml`.
2. Increase `version`.
3. Add a `changes` entry.

A new **modifier** never affects existing files.

A new keyword that opens the keyword section (**primary**, **property**) or a
new **state** keyword reinterprets every body line that starts with it at
column 0. Search existing data before adding one:

```bash
grep -rln '^newkeyword\b' <data-folder>
grep -rln '^(newkeyword\b' <data-folder>
```

Changing a value type or the file structure means editing `language.md` and
`spec/examples`. That is a breaking change for every frontend.
