export type ValueType = 'date' | 'month' | 'weekday' | 'path' | 'text' | 'tags';
export type ArgDef = { name: string; type: ValueType[] };
export type Role = 'primary' | 'property' | 'modifier' | 'state';
export type KeywordDef = {
  role: Role;
  block: 'yaml' | 'text' | null;
  args: ArgDef[];
  line_start: boolean;
  options: Record<string, { type: ValueType[]; meaning: string }>;
  excludes: string[];
  meaning: string;
};
export type Schema = { version: number; keywords: Record<string, KeywordDef> };
export type Diagnostic = { code: string; line: number | null; detail: string | null };
/** `refs` maps relationship targets to their headings; null for a missing target */
export type Item = { file: string; text: string; media: string | null; errors: Diagnostic[]; warnings: Diagnostic[]; refs?: Record<string, string | null> };
export type ItemPage = { items: Item[]; total: number; page: number; page_size: number };

export type Pull = { status: string; completed: number; total: number; error: string | null };
export type SemanticStatus = { indexed: number; total: number; embedding: boolean; error: string | null; missing_model: string | null; pull?: Pull | null };
export type QuestionModel = { installed: boolean; pull: Pull | null };

export type Question = { id: string; question: string; label: string };
export type Suggestion = { file: string; heading: string };
export type QuestionPick = { questions: Question[]; missing_model?: string | null; reason?: string | null };
export type NextNote = { item: Item | null; total: number };
export type Answered = Item & { target: Suggestion };

/** `bibtex`: the .bib export targets, each with its last export's error */
export type Settings = { path: string | null; bibtex: { path: string; error: string | null }[] };
/** what Settings → maintenance would delete */
export type Maintenance = { pastAppointments: { file: string; heading: string; date: string }[]; orphanedMedia: string[] };
export type LlmInfo ={ available: boolean; reason: string | null; url: string; default_url: string };

/** an item with what the queue, zero and suggest views show of it; `media` is a path in the data folder */
export type ItemView = Item & { heading: string; body: string; extra: string | null; media: string | null };
export type QueueDraw = { items: ItemView[]; total: number };
export type SuggestPick = { item: ItemView | null };
/** when an item falls: on one ISO date, or every weekday (1 = Mon .. 7 = Sun) up to `until` inclusive */
export type When = { appointment: string } | { recurring: number; until: string | null };
/** `think`: to think about (and sketch) rather than build, tagged `suggest-think-and-sketch` */
export type ProjectIssue = { file: string; heading: string; think: boolean };
export type Project = { file: string; heading: string; issues: ProjectIssue[] };
/** `orphans`: issues without a `project` relationship to a project */
export type Projects = { projects: Project[]; orphans: ProjectIssue[] };
/** names are `family, given`, `family, suffix, given` or, without a comma, one unsplit name */
export type FieldType = 'literal' | 'integer' | 'range' | 'name' | 'list' | 'date' | 'uri' | 'verbatim';
/** `entryTypes`: the fields each entry type shows by default */
/** a relationship line in note `file` pointing to some note; `label` as written, '' for none */
export type Backlink = { file: string; label: string; heading: string; inline: boolean };

export type SourceSchema = { fields: Record<string, { type: FieldType }>; entryTypes: Record<string, string[]> };
/** a source's fields (names and lists as string[], integers as numbers) */
export type SourceFields = { key: string; entrytype: string; title: string; extra?: string; [field: string]: string | number | string[] | undefined };
/** a `source` item: `file` is the item's, the rest its fields */
export type Source = SourceFields & { file: string };
/** `recent`: the files of the most recently modified sources, newest first; `backlinks`: how many relationships point to a source */
export type SourceList = { sources: (Source & { backlinks: number })[]; recent: string[] };
/** how sure it is that an existing source is the one being added */
export type MatchLevel = 'same' | 'likely' | 'possible';
export type SourceCandidate = { file: string; key: string; title: string; level: MatchLevel; reasons: string[] };
/** a source about to be added (as parsed, without `file`) and the existing ones it may be, best first */
export type SourceMatch = { source: SourceFields; candidates: SourceCandidate[] };
/** an existing source by file, or a new one */
export type SourceChoice = { file: string } | { source: SourceFields };
export type CalendarEntry = { file: string; heading: string; details: string[]; when: When };

/** a pinned note, rendered with the notes up to `depth` relationships away */
export type PinSpec = { filename: string; depth: number };
export type GraphNodePayload = {
  filename: string; body: string; image: string | null; extraContent: string; sectionLines: string[]; dataText: string | null;
  refs: Record<string, string | null>;
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
/**
 * A note a search found: `previewMatch` is where the match sits in `preview`; `excerpt` is set exactly
 * when it isn't visible there. `problem`: whether the note has errors or only warnings.
 */
export type SearchResult = {
  filename: string; heading: string; preview: string; previewMatch: MatchRange | null; excerpt: SearchExcerpt | null; problem: 'error' | 'warning' | null;
};
/** narrows search results by whether a note has any relationship, incoming or outgoing */
export type OrphanFilter = 'any' | 'orphan' | 'connected';
/** the notes a search looks at: `graph` the graph's, `attention` those with problems, `tasks` those with tasks */
export type SearchScope = 'all' | 'graph' | 'attention' | 'tasks';
/** `semantic`: the embedding's status, when the search was to rank semantically */
export type NoteSearchPage = { results: SearchResult[]; total: number; page: number; pageSize: number; semantic: SemanticStatus | null };
