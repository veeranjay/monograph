export type ResultType = 'solved' | 'partial' | 'failed' | 'skipped';

export type RecognitionType =
  | 'recognized_immediately'
  | 'recognized_after_thinking'
  | 'didnt_recognize'
  | 'not_sure';

export type HelpType = 'none' | 'hint' | 'solution' | 'someone_helped';

export type ObservationType = 'note' | 'mistake' | 'insight' | 'technique' | 'pattern' | 'question';

export type NoteType = 'note' | 'journal' | 'summary' | 'reference';

// Block types for the dedicated Note editor
export type NoteBlockType =
  | 'paragraph'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'math'
  | 'code'
  | 'bullet'
  | 'numbered'
  | 'divider';

export interface NoteBlock {
  id: string;
  type: NoteBlockType;
  content: string; // empty string for 'divider'
}

// User-defined tag category (replaces hardcoded Heuristic/Meta/Topic)
export interface TagCategory {
  id: string;
  name: string;
  description?: string | null;
  role?: string | null;    // free-text role for analytics derivation (e.g. 'heuristic', 'topic')
  color?: string | null;
  icon?: string | null;
  created_at: string;
  metadata?: string | null;
  usage_count?: number;
}

export interface Subject {
  id: string;
  name: string;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
  created_at: string;
  metadata?: string | null;
  // Normalized count fields (both names kept for backward compat during transition)
  sheet_count?: number;
  sources_count?: number;
  problem_count?: number;
  problems_count?: number;
  attempt_count?: number;
  solved_count?: number;
  solve_rate?: number;
  latest_activity?: string | null;
  note_count?: number;
}

export interface Source {
  id: string;
  name: string;
  type: string;
  reference?: string | null;
  created_at: string;
  metadata?: string | null;
  subject_id?: string | null;
  subject_name?: string | null;
  problem_count?: number;
  attempt_count?: number;
  solved_count?: number;
  solve_rate?: number;
  latest_activity?: string | null;
}

export interface Problem {
  id: string;
  source_id: string;
  number: string;
  title?: string | null;
  reference?: string | null;
  created_at: string;
  metadata?: string | null;
  source_name?: string;
  source_type?: string;
  subject_id?: string | null;
  subject_name?: string | null;
  for_review?: boolean;
  tags?: { id: string; name: string }[];
  problem_tags?: { id: string; name: string }[];
  attempts?: Attempt[];
  observations?: Observation[];
  attempt_count?: number;
  latest_result?: ResultType | null;
  latest_recognition?: RecognitionType | null;
  latest_notes?: string | null;
}

export interface Attempt {
  id: string;
  problem_id: string;
  created_at: string;
  finished_at?: string | null;
  result: ResultType;
  recognition?: RecognitionType | null;
  help?: HelpType | null;
  confidence?: number | null;
  time_seconds?: number | null;
  notes?: string | null;
  problem_number?: string;
  problem_title?: string;
  source_id?: string;
  source_name?: string;
  subject_id?: string | null;
  subject_name?: string | null;
  // Legacy tag fields (kept for backward compat)
  tags?: { id: string; name: string }[];
  problem_tags?: { id: string; name: string }[];
  heuristic_tags?: { id: string; name: string }[];
  meta_tags?: string[];
  // New: categorized tags (attempt_tags rows with category_id)
  categorized_tags?: { tag: { id: string; name: string }; category: TagCategory }[];
  for_review?: boolean;
  log_id?: string | null;
}

export interface PracticeLog {
  id: string;
  source_id: string;
  status: 'in_progress' | 'paused' | 'completed';
  current_problem_id?: string | null;
  time_seconds: number;
  notes_draft?: string | null;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
  metadata?: string | null;
  source_name?: string;
  subject_id?: string | null;
  subject_name?: string | null;
  subject_color?: string | null;
  problem_count?: number;
  attempts_count?: number;
  solved_count?: number;
  current_problem_number?: string | null;
  current_problem_title?: string | null;
  attempts?: Attempt[];
}

export interface Observation {
  id: string;
  problem_id: string;
  attempt_id?: string | null;
  type: ObservationType;
  content: string;
  created_at: string;
  problem_number?: string;
  source_id?: string;
  source_name?: string;
  subject_id?: string | null;
  subject_name?: string | null;
}

export interface Tag {
  id: string;
  name: string;
  created_at: string;
  usage_count?: number;
}

export interface Collection {
  id: string;
  name: string;
  description?: string | null;
  created_at: string;
  problem_count?: number;
  problems?: Problem[];
}

export interface Note {
  id: string;
  subject_id?: string | null;
  title: string;
  content: string;       // JSON-encoded NoteBlock[]
  type: NoteType;
  created_at: string;
  updated_at: string;
  metadata?: string | null;
  tags?: { id: string; name: string }[];
  subject_name?: string | null;
}

export interface AnalyticsSummary {
  totalProblemsAttempted: number;
  totalAttempts: number;
  totalSolved: number;
  totalPartial: number;
  totalFailed: number;
  totalSkipped: number;
  solveRate: number;
  recognitionRate: number;
  independentSolveRate: number;
  averageTimeSeconds: number;
  resultBreakdown: {
    solved: number;
    partial: number;
    failed: number;
    skipped: number;
  };
  recognitionBreakdown: {
    immediately: number;
    after_thinking: number;
    didnt_recognize: number;
    not_sure: number;
  };
  helpBreakdown: {
    none: number;
    hint: number;
    solution: number;
    someone_helped: number;
  };
  tagFriction: {
    tagId: string;
    tagName: string;
    totalAttempts: number;
    failedAttempts: number;
    failureRate: number;
  }[];
  commonMistakes: {
    content: string;
    count: number;
    latestProblemNumber?: string;
    latestSourceName?: string;
  }[];
  commonTechniques: {
    content: string;
    count: number;
    latestProblemNumber?: string;
    latestSourceName?: string;
  }[];
  mostUsedTags: {
    id: string;
    name: string;
    count: number;
  }[];
}

export interface SearchResult {
  type: 'subject' | 'source' | 'problem' | 'note' | 'observation' | 'tag' | 'pdf';
  id: string;
  title: string;
  subtitle: string;
  context?: string;
  url: string;
  badge?: string;
}

// ── Generic Workspace Engine Types ──────────────────────────────────────────

export interface ObjectType {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
  is_system: number;
  created_at: string;
  updated_at: string;
  metadata?: string | null;
}

export interface FieldDefinition {
  id: string;
  object_type_id: string;
  name: string;
  slug: string;
  field_type: string;
  config: string;
  ordinal: number;
  is_required: number;
  created_at: string;
}

export interface WorkspaceObject {
  id: string;
  type_id: string;
  type_slug?: string;
  type_name?: string;
  type_color?: string;
  type_icon?: string;
  title: string;
  properties: Record<string, any>;
  content?: string | null;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, any> | null;
  relations?: {
    outgoing?: Relation[];
    incoming?: Relation[];
  };
}

export interface Relation {
  id: string;
  source_id: string;
  target_id: string;
  relation_type: string;
  metadata: Record<string, any>;
  created_at: string;
  source_title?: string;
  source_type_slug?: string;
  target_title?: string;
  target_type_slug?: string;
}

export interface WorkspaceDocument {
  id: string;
  object_id?: string | null;
  title: string;
  blocks: NoteBlock[];
  latex_source?: string | null;
  created_at: string;
  updated_at: string;
  metadata: Record<string, any>;
}

export interface ViewDefinition {
  id: string;
  object_type_id?: string | null;
  name: string;
  view_type: 'table' | 'kanban' | 'gallery' | 'list' | 'calendar' | 'graph';
  query: Record<string, any>;
  sort: any[];
  config: Record<string, any>;
  is_default: number;
  created_at: string;
  updated_at: string;
}

export interface InboxItem {
  id: string;
  content: string;
  capture_type: 'text' | 'equation' | 'url' | 'problem_draft';
  processed: number;
  converted_object_id?: string | null;
  created_at: string;
  metadata: Record<string, any>;
}

export interface ActivityEvent {
  id: string;
  object_id: string;
  event_type: string;
  payload: Record<string, any>;
  created_at: string;
  object_title?: string;
  object_type?: string;
}

export interface GraphData {
  nodes: { id: string; title: string; type: string; color?: string }[];
  edges: { id: string; source: string; target: string; type: string; label?: string }[];
}

export interface PdfDocument {
  id: string;
  subject_id: string | null;
  subject_name?: string | null;
  title: string;
  filename: string;
  file_path?: string;
  file_size: number;
  page_count: number;
  created_at: string;
  updated_at: string;
  metadata?: string | null;
  highlight_count?: number;
  highlights?: PdfHighlight[];
}

export interface PdfHighlight {
  id: string;
  pdf_id: string;
  page_number: number;
  color: string;
  text: string;
  note?: string | null;
  rects?: string | null;
  created_at: string;
}
