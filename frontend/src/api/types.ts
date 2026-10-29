export type ValueType = 'date' | 'month' | 'weekday' | 'path' | 'text' | 'tags' | 'route';
export type ArgDef = { name: string; type: ValueType[] };
export type Role = 'primary' | 'property' | 'modifier' | 'state';
export type KeywordDef = {
  role: Role;
  block: 'yaml' | 'text' | null;
  args: ArgDef[];
  line_start: boolean;
  repeat: boolean;
  options: Record<string, { type: ValueType[]; meaning: string }>;
  excludes: string[];
  meaning: string;
};
export type Schema = { version: number; keywords: Record<string, KeywordDef> };
export type Diagnostic = { code: string; line: number | null; detail: string | null };
/**
 * A note as the API sends it, wherever it's shown: `refs` maps its relationship and inline
 * reference targets to their headings (null for a missing one); `files` are the paths in the data
 * folder its `media` clauses name, `media` its cover (the first image or video);
 * `sourceKey` a source's BibTeX key, null for any other note; `route` where it's published
 * (its `publish` clause's route), null for none.
 */
export type Item = {
  file: string; text: string; media: string | null; files: string[]; errors: Diagnostic[]; warnings: Diagnostic[];
  refs: Record<string, string | null>; sourceKey: string | null; route: string | null;
};
export type ItemPage = { items: Item[]; total: number; page: number; page_size: number };

export type Pull = { status: string; completed: number; total: number; error: string | null };
export type SemanticStatus = { indexed: number; total: number; embedding: boolean; error: string | null; missing_model: string | null; pull?: Pull | null };
export type QuestionModel = { installed: boolean; pull: Pull | null };

export type Question = { id: string; question: string; label: string };
export type Suggestion = { file: string; heading: string };
export type QuestionPick = { questions: Question[]; missing_model?: string | null; reason?: string | null };
export type NextNote = { item: Item | null; total: number };
export type Answered = Item & { target: Suggestion };

/** the exports (exports.py), by their key */
export type ExportKey = 'bibtex' | 'portfolio';
/** `exports`: each export's target paths, each with its last export's error */
export type Settings = { path: string | null; exports: Record<ExportKey, { path: string; error: string | null }[]>; thea: TheaSettings };
/** how viz blocks are generated: the claude CLI command, its model ('' for its default), a cap per run in estimated USD (API prices, not what a subscription pays), a time limit */
export type TheaSettings = { cli: string; model: string; budget_usd: number | null; timeout_min: number };
/** whether Typst files can be built here (not on Termux), and why not */
export type TypstStatus = { available: boolean; reason: string | null };
/** whether notes can be exported as PDFs (Chromium), and why not */
export type PdfStatus = { available: boolean; reason: string | null };
/** a Typst file's build: Typst's errors, null when it built; whether its PDF exists */
export type TypstBuild = { errors: string | null; pdf: boolean };
export type TheaStatus = { available: boolean; reason: string | null; settings: TheaSettings };
/** a viz block's generation, by its block's name; `id` is the version made, once done */
export type TheaJob = {
  name: string; file: string; state: 'queued' | 'running' | 'done' | 'failed'; step: string; error: string | null;
  id: string | null; started: number; finished: number | null; cost_usd: number | null;
};
/** what a viz version was generated from (its thea.json) */
export type TheaMeta = { spec: string; model: string | null; created: string; cost_usd: number | null; turns: number | null };
/** what Settings → maintenance would delete */
export type Maintenance = { pastAppointments: Item[]; orphanedFiles: string[] };
/** the note tagged portfolio and its template's path */
/** `cards`: whether this install can render card collages (Chromium), and why not */
export type Portfolio = { note: Item; template: string; cards: { available: boolean; reason: string | null } };
export type LlmInfo ={ available: boolean; reason: string | null; url: string; default_url: string };

export type QueueDraw = { items: Item[]; total: number };
export type SuggestPick = { item: Item | null };
/** when an item falls: on one ISO date, or every weekday (1 = Mon .. 7 = Sun) up to `until` inclusive */
export type When = { appointment: string } | { recurring: number; until: string | null };
/** issues to think about (tagged `suggest-think-and-sketch`) come first */
export type Project = Item & { issues: Item[] };
/** `orphans`: issues without a `project` relationship to a project */
export type Projects = { projects: Project[]; orphans: Item[] };
/** a relationship line in note `file` pointing to some note; `label` as written, '' for none */
export type Backlink = { file: string; label: string; heading: string; inline: boolean };

/** a source's fields (names and lists as string[], integers as numbers) */
export type SourceFields = { key: string; entrytype: string; title: string; extra?: string; [field: string]: string | number | string[] | undefined };
/** a `source` item: `file` is the item's, the rest its fields */
export type Source = SourceFields & { file: string };
/** a source note with its fields; the API lists them the most recently edited first */
export type SourceItem = Item & { fields: Source };
/** how sure it is that an existing source is the one being added */
export type MatchLevel = 'same' | 'likely' | 'possible';
export type SourceCandidate = { file: string; key: string; title: string; level: MatchLevel; reasons: string[]; item: Item };
/** a source about to be added (as parsed, without `file`) and the existing ones it may be, best first */
export type SourceMatch = { source: SourceFields; candidates: SourceCandidate[] };
/** an existing source by file, or a new one */
export type SourceChoice = { file: string } | { source: SourceFields };
type FieldValue = string | number | string[];
/** a field both the source and the BibTeX have, differently */
export type SourceConflict = { field: string; current: FieldValue; incoming: FieldValue };
/** a source's text updated from BibTeX: the fields it lacked `filled`, those it had otherwise left as `conflicts` */
export type SourceMerge = { text: string; filled: string[]; conflicts: SourceConflict[] };
export type CalendarEntry = Item & { when: When };

/** a pinned note, rendered with the notes up to `depth` relationships away */
export type PinSpec = { filename: string; depth: number };
export type GraphNodePayload = {
  filename: string; item: Item;
  /** hops from the nearest pin that discovered this node */
  depth: number;
  degree: number;
  /** related notes not on the canvas: what pinning it at depth 1 would bring in */
  hiddenNeighbors: number;
};
export type GraphEdgePayload = { id: string; source: string; target: string; label: string; inline: boolean; depth: number; direction: 'incoming' | 'outgoing' };
export type NoteGraph = { nodes: GraphNodePayload[]; edges: GraphEdgePayload[]; truncated: boolean; warnings: string[] };
/** a span of text, as UTF-16 offsets into the string it refers to */
export type MatchRange = { start: number; length: number };
export type SearchExcerpt = { text: string; match: MatchRange };
/** A note a search found: `match` is the matched text when it shows in the first line; else `excerpt` holds it. */
export type SearchResult = Item & { match: string | null; excerpt: SearchExcerpt | null };
/** narrows search results by whether a note has any relationship, incoming or outgoing */
export type OrphanFilter = 'any' | 'orphan' | 'connected';
/** the notes a search looks at: `graph` the graph's, `attention` those with problems, `tasks` those with tasks */
export type SearchScope = 'all' | 'graph' | 'attention' | 'tasks';
/** `semantic`: the embedding's status, when the search was to rank semantically */
export type NoteSearchPage = { results: SearchResult[]; total: number; page: number; pageSize: number; semantic: SemanticStatus | null };
