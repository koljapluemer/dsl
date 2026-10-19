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
export type Item = { file: string; text: string; errors: Diagnostic[]; warnings: Diagnostic[]; refs?: Record<string, string | null> };
export type ItemPage = { items: Item[]; total: number; page: number; page_size: number; focused?: boolean; semantic?: SemanticStatus | null };

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
export type LlmInfo = { available: boolean; reason: string | null; url: string; default_url: string };

/** an item with what the queue, zero and suggest views show of it; `media` is a path in the data folder */
export type ItemView = Item & { heading: string; body: string; extra: string | null; media: string | null };
export type QueueDraw = { items: ItemView[]; total: number };
export type SuggestPick = { item: ItemView | null };
/** when an item falls: on one ISO date, or every weekday (1 = Mon .. 7 = Sun) up to `until` inclusive */
export type When = { appointment: string } | { recurring: number; until: string | null };
export type ProjectIssue = { file: string; heading: string };
export type Project = { file: string; heading: string; issues: ProjectIssue[] };
/** `orphans`: issues without a `project` relationship to a project */
export type Projects = { projects: Project[]; orphans: ProjectIssue[] };
/** names are `family, given`, `family, suffix, given` or, without a comma, one unsplit name */
export type FieldType = 'literal' | 'integer' | 'range' | 'name' | 'list' | 'date' | 'uri' | 'verbatim';
/** `entryTypes`: the fields each entry type shows by default */
export type SourceSchema = { fields: Record<string, { type: FieldType }>; entryTypes: Record<string, string[]> };
/** a `source` item: `file` is the item's, the rest its fields (names and lists as string[], integers as numbers) */
export type Source = { file: string; key: string; entrytype: string; title: string; extra?: string; [field: string]: string | number | string[] | undefined };
/** `recent`: the files of the most recently modified sources, newest first */
export type SourceList = { sources: Source[]; recent: string[] };
export type CalendarEntry = { file: string; heading: string; details: string[]; when: When };

/** a pinned note, rendered with the notes up to `depth` relationships away */
export type PinSpec = { filename: string; depth: number };
export type GraphNodePayload = {
  filename: string; body: string; image: string | null; extraContent: string; sectionLines: string[]; dataText: string | null;
  /** hops from the nearest pin that discovered this node */
  depth: number;
  degree: number;
  /** related notes not on the canvas: what pinning it at depth 1 would bring in */
  hiddenNeighbors: number;
};
export type GraphEdgePayload = { id: string; source: string; target: string; label: string; depth: number; direction: 'incoming' | 'outgoing' };
export type NoteGraph = { nodes: GraphNodePayload[]; edges: GraphEdgePayload[]; truncated: boolean; warnings: string[] };
/** a span of text, as UTF-16 offsets into the string it refers to */
export type MatchRange = { start: number; length: number };
export type SearchExcerpt = { text: string; match: MatchRange };
/** `previewMatch` is where the match sits in `preview`; `excerpt` is set exactly when it isn't visible there */
export type SearchResult = { filename: string; preview: string; previewMatch: MatchRange | null; excerpt: SearchExcerpt | null };
export type RecentNote = { filename: string; preview: string };
/** narrows search results by whether a note has any relationship, incoming or outgoing */
export type OrphanFilter = 'any' | 'orphan' | 'connected';
export type SearchCriteria = { query: string; orphan: OrphanFilter };
export type NoteSearchPage = { results: SearchResult[]; total: number };
export type RecentPage = { results: RecentNote[]; total: number };
