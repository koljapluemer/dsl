The way that the note viewer/editor component is implemented over this app is semi-consistent.
Let's make this coherent, consistent and documented.

## Core Concepts

- whenever a note is rendered, it should use one shared component for this, no matter the context. Adjustments should be done via parameters to this component not via "nevermind let's partially rebuild this".
- relationships (incoming/outgoing) are either rendered and manageable (in ONE widget), or they are not. We never want duplicated list of relationships and then a relationship manager, or just the manager, or some other bespoke crap. It is possible to specifiy via param whether relationships should be editable in view mode, or not. When relationships are shown, backlinks should also be shown (mark them by reversing the arrow, not by waffling microcopy); and they should also be editable if rels are editable in the context. Side note: of course, relationships are "duplicated" b/c they are also defined in plaintext. That's not the problem I mean; the problem I mean is that currently we have 2 *additional* widgets showing all relationships below the main edit box again.
- if not specified otherwise, assume that we do want full capabilities. No more "oh I randomly assumed that we don't want syntax highighlighting when adding notes via graph" etc.
- usually, editing/adding of notes happens via standard panels or via modals, but sometimes not. the shared component should not care about this.
- Tools such as the helper flow to attach media should be available as icon-only buttons in a row to the top left of the main textarea, following a consistent style. Via params we can set which to show and hide, per context. Move everything that's currently done to notes via random buttons into this unified tool bar.
- Usually it makes sense to persist choice per top-level view (in session), sometimes per view+per note. Other times it may be more bespoke. Make this sanely adjustable, and take a per-case best guess based on the intended UX.

## Settings/Params

- the note widget should have at the top right a 3-way toggle for the user to change how the note is displayed: edit, view or side-by-side. This toggle can also be hidden. Each of these modes can also be enabled or disbaled. The toggle should automatically be hidden if only one mode is valid in the context. We can also set which mode is standard.
- sometimes, the editing mode can be terminated by explicit save/discard buttons. rarely, we use a autosave-on-blur paradigm instead. In the former case, the aforementioned toggle is hidden and replaced by the save/discard buttons as soon as the content of the editing area is changed. In the save/discard button, all state is temporary, including relationships in the possible relationship manager, until saved and discarded.
- allow an 'inline renderered' mode. This should only render the first line of the body (=heading), and only a certain character amount, indicating with an ellipsis if main content was cut. Should still show attached media. Should still render the rendered line as markdown. Never shows relationships.

- it should be possible to define tag toggle buttons, with the tag to be toggled and the icon(s) to be used passed in as params. Possible for both normal render mode and inline rendered mode
- can be decided to render the note in "simple" mode, meaning only the main content (no tags, no extra, no relationships). In that case also no 3-way-toggle

## Pages

### New

Let's get rid of the `New` page.
Instead, add an icon-only FAB to the bottom right, visible always.
This should open a modal to add a new note.
explicit save paradigm. No toggle, can only stay in 'edit' mode.
On save, close the modal, pop a standard toast.

### Notes

Standard editor, all bells and whistles.
Use inline rendering for the sidebar.

### Explorations

Standard editor, all bells and whistles. Open in editing mode per default. Save on blur paradigm.

### Graph

As makes sense.
New like the new modal.
Existing notes can be toggled between edit and view (not side-by-side).

### Tasks

Standard. save-on-blur. Default editing mode.

### Projects

Projects: as inline mode, with the expandable wrapper around.
Issues: as inline mode, with the appropriate buttons (delete active, tag toggle button). Make edit an icon button following the standard, opening a very standard modal.

### Sources

Move the whole view to a sidebar+main area kind of deal, similar to explorations. 
Make the copy-bibtex key a standard tool, always to be shown when a given note is source and has such a key. get rid of the copy as md/as html buttons, currently not needed.

Get rid of the expandable-backlink logic, it's unused.
Use the standard editor, editing mode only (no reason to see a source "rendered".
Yes, I do mean "use the standard editor" as in "get rid of the current bespoke form". The aim of this is standardization, and I mean it.

### Questions

Full standard editor with relationship editor and all, standard Rendered mode.
bespoke UI is above and below that editor.

### Calendar

use inline renderer. Get rid of whatever bespoke garbage we're using to show stuff like `weekly` for no reason.

### Queue

Unlabeled Icon-only toggle in the same row as the "Next" button.
This toggle switches between simple mode and normal mode. Session-persist this. 

In simple mode, show all nodes simply.
Otherwise, show nodes with full standard editor, default Rendered

### Float

Render notes in simple mode.
Icon button to edit in modal. Icon button for the tag that hides them.

### Zero

Inline rendering mode. Edit button that opens modal. Get rid of the bespoke coloring.

### Suggest

Like Queue, toggle in the next row for simple mode vs full editor mode (standard Rendered). Simple is default.


## Misc

Remember that this is indeed personal software with a user base of one. 
I must work with this for hours or day; "onboarding" is not a concern here.

### Better Relationship Rendering

I find the current relationship display very ugly and hard to read.
let's swap to the following: 
Two lines, the label in the first row, small smallcaps font.
Before the label text, if relationship editable, two icon buttons, for detaching and deleting. label editable by clicking on it. the attached note itself is not editable, because that makes no sense.
second line+, the actual attached note.

### Media

Attached media, as a rule, should be rendered. 
Implement this intent in a sensible way (e.g. don't render media twice in side-by-side mode); perhaps we will need a param to say where it's rendered, e.g. above the content for Graph cards but perhaps left or right of the rest elsewhere.

### Weird Ways of rendering notes

The aim of this is standardization and I mean it. Search results in dropdowns are *definitely* notes. Probably call for an inline rendering, and for a param to allow the whole rendered note to be clickable.
If you identify other places, say so. I want note rendering to be god damn standardized.
