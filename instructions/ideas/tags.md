Integrate a concept for tagging notes, making sure none of the @docs/dependent-apps.md repos breaks (adapt them accordingly).
`tags` should be a keyword that must come at start of line, and must be followed with one or more tags that are alphanumeric+dash

E.g.:
```
tags break 10k do-this 
```

Based on this, add a concept for blacklisting items in specific apps.
Let the user edit this in the settings screen.

The user should able to:
- blacklist primary types (such as `appointment`), from the list of actually existing types
- blacklist tags, with a standard tag input modality.

Notes then should be simply ignored by this app completely in all respects when they include one of these tags.
Add this feature for `dsl-graph` and `queue`. 