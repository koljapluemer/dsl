# dsl

The spec for a plain-text item language: one item per file, written by hand
and read by several frontends (e.g. the calendar app in `../calendar`).

- [`spec/language.md`](spec/language.md): the file structure, syntax, value
  types, and error and warning codes. It knows no individual keywords.
- [`spec/keywords.yaml`](spec/keywords.yaml): every keyword, with its role,
  arguments, options, exclusions and meaning.

```
HCI lecture 4pm-7pm
(bring laptop)
recurring mo until 27-03
```

## Using it in a frontend

Pull this repo in as a git submodule, or reference it by path. A frontend's
parser implements `language.md` once. It should read `keywords.yaml` (at
build time, or at runtime) instead of hardcoding keyword names, roles and
argument types. Then a new keyword's syntax reaches every frontend without
code changes. Only the keyword's *meaning* needs code in each frontend that
cares about it.

## Extending

1. Add the keyword to `keywords.yaml`.
2. Increase `version`.
3. Add a `changes` entry.

A new **modifier** never affects existing files.

A new **primary** reinterprets every description line that starts with it at
column 0. Search existing data before adding one:

```bash
grep -rln '^newkeyword\b' <data-folder>
```

Changing a value type or the file structure means editing `language.md`.
That is a breaking change for every frontend.
