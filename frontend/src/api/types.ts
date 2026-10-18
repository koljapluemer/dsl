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

export type Settings = { path: string | null; suggested: string | null };
export type LlmInfo = { available: boolean; reason: string | null; url: string; default_url: string };
