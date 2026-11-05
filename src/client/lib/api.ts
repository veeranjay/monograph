import {
  Subject,
  Source,
  Problem,
  Attempt,
  PracticeLog,
  Observation,
  Tag,
  Collection,
  AnalyticsSummary,
  SearchResult,
  Note,
  TagCategory,
  ObjectType,
  FieldDefinition,
  WorkspaceObject,
  Relation,
  WorkspaceDocument,
  ViewDefinition,
  InboxItem,
  ActivityEvent,
  GraphData,
  PdfDocument,
  PdfHighlight,
} from '../types/index.js';

const API_BASE = '/api';

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!res.ok) {
    let errorMsg = `Error ${res.status}: ${res.statusText}`;
    try {
      const body = await res.json();
      if (body.error) errorMsg = body.error;
    } catch {
      // ignore
    }
    throw new Error(errorMsg);
  }

  return res.json();
}

export const api = {
  // ── Subjects (Notebooks) ────────────────────────────────────────────────────
  getSubjects: () => request<Subject[]>('/subjects'),
  getSubject: (id: string) => request<Subject & { sources: Source[] }>(`/subjects/${id}`),
  getSubjectSheets: (id: string) => request<Source[]>(`/subjects/${id}/sheets`),
  createSubject: (data: { name: string; description?: string; color?: string; icon?: string; metadata?: any }) =>
    request<Subject>('/subjects', { method: 'POST', body: JSON.stringify(data) }),
  updateSubject: (id: string, data: { name?: string; description?: string; color?: string; icon?: string; metadata?: any }) =>
    request<{ success: boolean }>(`/subjects/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteSubject: (id: string, fallbackSubjectId?: string) =>
    request<{ success: boolean }>(`/subjects/${id}`, {
      method: 'DELETE',
      body: fallbackSubjectId ? JSON.stringify({ fallbackSubjectId }) : undefined,
    }),

  // ── Sources (Sheets) ────────────────────────────────────────────────────────
  getSources: (subjectId?: string) =>
    request<Source[]>(`/sources${subjectId ? `?subjectId=${encodeURIComponent(subjectId)}` : ''}`),
  getSource: (id: string) => request<Source & { problems: Problem[] }>(`/sources/${id}`),
  createSource: (data: { name: string; type?: string; reference?: string; subject_id?: string | null; metadata?: any }) =>
    request<Source>('/sources', { method: 'POST', body: JSON.stringify(data) }),
  updateSource: (id: string, data: { name?: string; type?: string; reference?: string; subject_id?: string | null; metadata?: any }) =>
    request<{ success: boolean }>(`/sources/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  updateSourceSubject: (sourceId: string, subjectId: string) =>
    request<{ success: boolean }>(`/sources/${sourceId}`, { method: 'PUT', body: JSON.stringify({ subject_id: subjectId }) }),
  deleteSource: (id: string) =>
    request<{ success: boolean }>(`/sources/${id}`, { method: 'DELETE' }),
  batchCreateProblems: (sourceId: string, data: { start: number; end: number; prefix?: string }) =>
    request<{ count: number }>(`/sources/${sourceId}/batch-problems`, { method: 'POST', body: JSON.stringify(data) }),

  // ── Problems ────────────────────────────────────────────────────────────────
  getProblem: (id: string) => request<Problem>(`/problems/${id}`),
  createProblem: (data: { source_id: string; number: string; title?: string; reference?: string; tags?: string[] }) =>
    request<Problem>('/problems', { method: 'POST', body: JSON.stringify(data) }),
  updateProblem: (id: string, data: { number?: string; title?: string; reference?: string; tags?: string[]; for_review?: boolean }) =>
    request<{ success: boolean }>(`/problems/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteProblem: (id: string) =>
    request<{ success: boolean }>(`/problems/${id}`, { method: 'DELETE' }),

  // ── Attempts ────────────────────────────────────────────────────────────────
  getRecentAttempts: (limit?: number) =>
    request<Attempt[]>(`/attempts/recent${limit ? `?limit=${limit}` : ''}`),
  createAttempt: (data: {
    problem_id: string;
    result: string;
    recognition?: string;
    help?: string;
    confidence?: number;
    time_seconds?: number;
    notes?: string;
    // Legacy fields (still accepted for backward compat)
    tags?: string[];
    problem_tags?: string[];
    heuristic_tags?: string[];
    meta_tags?: string[];
    // New: categorized tags — preferred going forward
    categorized_tags?: { tag: string; category_id: string }[];
    for_review?: boolean;
    log_id?: string;
    observation?: { type: string; content: string };
  }) => request<Attempt>('/attempts', { method: 'POST', body: JSON.stringify(data) }),
  deleteAttempt: (id: string) =>
    request<{ success: boolean }>(`/attempts/${id}`, { method: 'DELETE' }),

  // ── Practice Logs ────────────────────────────────────────────────────────────
  getLogs: (params?: { sourceId?: string; status?: string; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.sourceId) q.append('sourceId', params.sourceId);
    if (params?.status) q.append('status', params.status);
    if (params?.limit) q.append('limit', String(params.limit));
    const qs = q.toString();
    return request<PracticeLog[]>(`/logs${qs ? `?${qs}` : ''}`);
  },
  getActiveLog: (sourceId?: string) =>
    request<PracticeLog | null>(`/logs/active${sourceId ? `?sourceId=${encodeURIComponent(sourceId)}` : ''}`),
  getLog: (id: string) => request<PracticeLog>(`/logs/${id}`),
  createLog: (data: { source_id: string; current_problem_id?: string; time_seconds?: number; notes_draft?: string }) =>
    request<PracticeLog>('/logs', { method: 'POST', body: JSON.stringify(data) }),
  updateLog: (id: string, data: { status?: string; current_problem_id?: string; time_seconds?: number; notes_draft?: string }) =>
    request<{ success: boolean; log: PracticeLog }>(`/logs/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  completeLog: (id: string, time_seconds?: number) =>
    request<{ success: boolean; log: PracticeLog }>(`/logs/${id}/complete`, {
      method: 'POST',
      body: JSON.stringify({ time_seconds }),
    }),
  deleteLog: (id: string) => request<{ success: boolean }>(`/logs/${id}`, { method: 'DELETE' }),

  // ── Observations ─────────────────────────────────────────────────────────────
  getObservations: (params?: { type?: string; problem_id?: string; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.type) q.append('type', params.type);
    if (params?.problem_id) q.append('problem_id', params.problem_id);
    if (params?.limit) q.append('limit', String(params.limit));
    return request<Observation[]>(`/observations?${q.toString()}`);
  },
  createObservation: (data: { problem_id: string; attempt_id?: string; type: string; content: string }) =>
    request<Observation>('/observations', { method: 'POST', body: JSON.stringify(data) }),
  deleteObservation: (id: string) =>
    request<{ success: boolean }>(`/observations/${id}`, { method: 'DELETE' }),

  // ── Tags ─────────────────────────────────────────────────────────────────────
  getTags: () => request<Tag[]>('/tags'),

  // ── Tag Categories (user-defined) ────────────────────────────────────────────
  getTagCategories: () => request<TagCategory[]>('/tag-categories'),
  createTagCategory: (data: { name: string; description?: string; role?: string; color?: string; icon?: string; metadata?: any }) =>
    request<TagCategory>('/tag-categories', { method: 'POST', body: JSON.stringify(data) }),
  updateTagCategory: (id: string, data: { name?: string; description?: string; role?: string; color?: string; icon?: string; metadata?: any }) =>
    request<{ success: boolean }>(`/tag-categories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTagCategory: (id: string) =>
    request<{ success: boolean }>(`/tag-categories/${id}`, { method: 'DELETE' }),

  // ── Notes ────────────────────────────────────────────────────────────────────
  getNotes: (params?: { subject_id?: string; type?: string; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.subject_id) q.append('subject_id', params.subject_id);
    if (params?.type) q.append('type', params.type);
    if (params?.limit) q.append('limit', String(params.limit));
    const qs = q.toString();
    return request<Note[]>(`/notes${qs ? `?${qs}` : ''}`);
  },
  getRecentNotes: (limit: number = 8) => request<Note[]>(`/notes/recent?limit=${limit}`),
  getNote: (id: string) => request<Note>(`/notes/${id}`),
  createNote: (data: { subject_id?: string | null; title?: string; content?: string; type?: string; metadata?: any }) =>
    request<Note>('/notes', { method: 'POST', body: JSON.stringify(data) }),
  updateNote: (id: string, data: { subject_id?: string | null; title?: string; content?: string; type?: string; metadata?: any }) =>
    request<{ success: boolean; note: Note }>(`/notes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteNote: (id: string) =>
    request<{ success: boolean }>(`/notes/${id}`, { method: 'DELETE' }),

  // ── Collections ──────────────────────────────────────────────────────────────
  getCollections: () => request<Collection[]>('/collections'),
  getCollection: (id: string) => request<Collection>(`/collections/${id}`),
  createCollection: (data: { name: string; description?: string }) =>
    request<Collection>('/collections', { method: 'POST', body: JSON.stringify(data) }),
  addProblemToCollection: (collectionId: string, problemId: string) =>
    request<{ success: boolean }>(`/collections/${collectionId}/problems`, {
      method: 'POST',
      body: JSON.stringify({ problemId }),
    }),
  removeProblemFromCollection: (collectionId: string, problemId: string) =>
    request<{ success: boolean }>(`/collections/${collectionId}/problems/${problemId}`, { method: 'DELETE' }),

  // ── Analytics ────────────────────────────────────────────────────────────────
  getAnalytics: (sourceId?: string, subjectId?: string) => {
    const params = new URLSearchParams();
    if (sourceId) params.append('sourceId', sourceId);
    if (subjectId) params.append('subjectId', subjectId);
    const q = params.toString();
    return request<AnalyticsSummary>(`/analytics${q ? `?${q}` : ''}`);
  },

  // ── Search ───────────────────────────────────────────────────────────────────
  search: (query: string) =>
    request<SearchResult[]>(`/search?q=${encodeURIComponent(query)}`),

  // ── Generic Object Types ─────────────────────────────────────────────────────
  getObjectTypes: () => request<ObjectType[]>('/object-types'),
  getObjectType: (idOrSlug: string) => request<ObjectType>(`/object-types/${idOrSlug}`),
  createObjectType: (data: { name: string; slug?: string; description?: string; icon?: string; color?: string; metadata?: any }) =>
    request<ObjectType>('/object-types', { method: 'POST', body: JSON.stringify(data) }),
  getFieldDefinitions: (typeId: string) => request<FieldDefinition[]>(`/object-types/${typeId}/fields`),
  createFieldDefinition: (typeId: string, data: { name: string; slug?: string; field_type: string; config?: any; ordinal?: number; is_required?: boolean }) =>
    request<FieldDefinition>(`/object-types/${typeId}/fields`, { method: 'POST', body: JSON.stringify(data) }),

  // ── Generic Workspace Objects ────────────────────────────────────────────────
  getObjects: (params?: { type?: string; search?: string; filter_property?: string; filter_value?: any; limit?: number; offset?: number; sort_by?: string; sort_dir?: 'asc' | 'desc' }) => {
    const q = new URLSearchParams();
    if (params?.type) q.append('type', params.type);
    if (params?.search) q.append('search', params.search);
    if (params?.filter_property) q.append('filter_property', params.filter_property);
    if (params?.filter_value !== undefined) q.append('filter_value', String(params.filter_value));
    if (params?.limit) q.append('limit', String(params.limit));
    if (params?.offset) q.append('offset', String(params.offset));
    if (params?.sort_by) q.append('sort_by', params.sort_by);
    if (params?.sort_dir) q.append('sort_dir', params.sort_dir);
    const qs = q.toString();
    return request<{ items: WorkspaceObject[]; total: number }>(`/objects${qs ? `?${qs}` : ''}`);
  },
  getObject: (id: string) => request<WorkspaceObject>(`/objects/${id}`),
  createObject: (data: { type: string; title: string; properties?: Record<string, any>; content?: string | null; metadata?: Record<string, any> }) =>
    request<WorkspaceObject>('/objects', { method: 'POST', body: JSON.stringify(data) }),
  updateObject: (id: string, data: { title?: string; properties?: Record<string, any>; content?: string | null; metadata?: Record<string, any> }) =>
    request<WorkspaceObject>(`/objects/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteObject: (id: string) =>
    request<{ success: boolean }>(`/objects/${id}`, { method: 'DELETE' }),

  // ── Directed Relations & Graph ───────────────────────────────────────────────
  getRelations: (objectId: string, direction?: 'both' | 'outgoing' | 'incoming') =>
    request<Relation[]>(`/relations?object_id=${encodeURIComponent(objectId)}${direction ? `&direction=${direction}` : ''}`),
  createRelation: (data: { source_id: string; target_id: string; relation_type: string; metadata?: Record<string, any> }) =>
    request<Relation>('/relations', { method: 'POST', body: JSON.stringify(data) }),
  deleteRelation: (id: string) =>
    request<{ success: boolean }>(`/relations/${id}`, { method: 'DELETE' }),
  deleteRelationBetween: (sourceId: string, targetId: string, relationType?: string) =>
    request<{ success: boolean }>('/relations', { method: 'DELETE', body: JSON.stringify({ source_id: sourceId, target_id: targetId, relation_type: relationType }) }),
  getGraph: (centerId?: string, limit?: number) =>
    request<GraphData>(`/relations/graph${centerId ? `?center_id=${encodeURIComponent(centerId)}` : ''}${limit ? `&limit=${limit}` : ''}`),

  // ── Documents ────────────────────────────────────────────────────────────────
  getDocument: (id: string) => request<WorkspaceDocument>(`/documents/${id}`),
  getDocumentByObject: (objectId: string) => request<WorkspaceDocument>(`/documents/by-object/${objectId}`),
  createDocument: (data: { object_id?: string | null; title: string; blocks?: any[]; latex_source?: string | null; metadata?: any }) =>
    request<WorkspaceDocument>('/documents', { method: 'POST', body: JSON.stringify(data) }),
  updateDocument: (id: string, data: { title?: string; blocks?: any[]; latex_source?: string | null; metadata?: any }) =>
    request<WorkspaceDocument>(`/documents/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  exportLatex: (id: string) => request<{ latex: string }>(`/documents/${id}/export/latex`),

  // ── Views ────────────────────────────────────────────────────────────────────
  getViews: (objectTypeId?: string) =>
    request<ViewDefinition[]>(`/views${objectTypeId ? `?object_type_id=${encodeURIComponent(objectTypeId)}` : ''}`),
  getView: (id: string) => request<ViewDefinition>(`/views/${id}`),
  createView: (data: Partial<ViewDefinition>) =>
    request<ViewDefinition>('/views', { method: 'POST', body: JSON.stringify(data) }),
  updateView: (id: string, data: Partial<ViewDefinition>) =>
    request<ViewDefinition>(`/views/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteView: (id: string) => request<{ success: boolean }>(`/views/${id}`, { method: 'DELETE' }),
  executeView: (id: string) => request<{ view: ViewDefinition; items: any[]; total: number }>(`/views/${id}/execute`),

  // ── Universal Inbox ──────────────────────────────────────────────────────────
  getInbox: (unprocessed: boolean = true) =>
    request<InboxItem[]>(`/inbox?unprocessed=${unprocessed}`),
  createInboxItem: (data: { content: string; capture_type?: 'text' | 'equation' | 'url' | 'problem_draft'; metadata?: any }) =>
    request<InboxItem>('/inbox', { method: 'POST', body: JSON.stringify(data) }),
  convertInboxItem: (id: string, data: { target_type: string; title: string; properties?: Record<string, any> }) =>
    request<{ inboxItem: InboxItem; object: WorkspaceObject }>(`/inbox/${id}/convert`, { method: 'POST', body: JSON.stringify(data) }),
  deleteInboxItem: (id: string) =>
    request<{ success: boolean }>(`/inbox/${id}`, { method: 'DELETE' }),

  // ── Events ───────────────────────────────────────────────────────────────────
  getRecentEvents: (limit?: number) =>
    request<ActivityEvent[]>(`/events/recent${limit ? `?limit=${limit}` : ''}`),
  getObjectEvents: (objectId: string, limit?: number) =>
    request<ActivityEvent[]>(`/events/object/${objectId}${limit ? `?limit=${limit}` : ''}`),

  // ── PDFs & Annotations ───────────────────────────────────────────────────────
  getPdfs: (subjectId?: string) =>
    request<PdfDocument[]>(`/pdfs${subjectId ? `?subject_id=${encodeURIComponent(subjectId)}` : ''}`),
  getPdf: (id: string) =>
    request<PdfDocument & { highlights: PdfHighlight[] }>(`/pdfs/${id}`),
  getPdfFileUrl: (id: string) => `${API_BASE}/pdfs/${id}/file`,
  uploadPdf: (data: { title: string; filename: string; file_data_base64: string; subject_id?: string | null; page_count?: number }) =>
    request<PdfDocument>('/pdfs', { method: 'POST', body: JSON.stringify(data) }),
  updatePdf: (id: string, data: { title?: string; page_count?: number; subject_id?: string | null }) =>
    request<{ success: boolean }>(`/pdfs/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePdf: (id: string) =>
    request<{ success: boolean }>(`/pdfs/${id}`, { method: 'DELETE' }),
  addPdfHighlight: (pdfId: string, data: { page_number: number; color?: string; text: string; note?: string; rects?: any }) =>
    request<PdfHighlight>(`/pdfs/${pdfId}/highlights`, { method: 'POST', body: JSON.stringify(data) }),
  deletePdfHighlight: (highlightId: string) =>
    request<{ success: boolean }>(`/pdfs/highlights/${highlightId}`, { method: 'DELETE' }),
  updatePdfHighlight: (highlightId: string, data: { note?: string; color?: string }) =>
    request<{ success: boolean }>(`/pdfs/highlights/${highlightId}`, { method: 'PUT', body: JSON.stringify(data) }),
};
