import { db } from '../db.js';
import crypto from 'node:crypto';
import { setTagsForAttempt, setTagsForProblem, getTagsForProblem, setCategorizedTagsForAttempt } from './tagsService.js';
import { createObservation } from './observationsService.js';

export interface Attempt {
  id: string;
  problem_id: string;
  created_at: string;
  finished_at?: string | null;
  result: 'solved' | 'partial' | 'failed' | 'skipped';
  recognition?: 'recognized_immediately' | 'recognized_after_thinking' | 'didnt_recognize' | 'not_sure' | null;
  help?: 'none' | 'hint' | 'solution' | 'someone_helped' | null;
  confidence?: number | null;
  time_seconds?: number | null;
  notes?: string | null;
  problem_number?: string;
  problem_title?: string | null;
  source_id?: string;
  source_name?: string;
  subject_id?: string | null;
  subject_name?: string | null;
  meta_tags?: string[] | null;
  categorized_tags?: { tag: { id: string; name: string }; category?: { id: string; name: string; color?: string; role?: string } }[];
  for_review?: boolean;
  log_id?: string | null;
}

export function createAttempt(data: {
  id?: string;
  problem_id: string;
  result: 'solved' | 'partial' | 'failed' | 'skipped' | string;
  recognition?: string | null;
  help?: string | null;
  confidence?: number | null;
  time_seconds?: number | null;
  notes?: string | null;
  tags?: string[];
  problem_tags?: string[];
  heuristic_tags?: string[];
  meta_tags?: any;
  categorized_tags?: { tag: string; category_id: string }[];
  for_review?: boolean | number;
  log_id?: string | null;
  created_at?: string;
  finished_at?: string;
  observation?: {
    type: 'note' | 'mistake' | 'insight' | 'technique' | 'pattern' | 'question';
    content: string;
  };
}): Attempt {
  const id = data.id || crypto.randomUUID();
  const created_at = data.created_at || new Date().toISOString();
  const finished_at = data.finished_at || created_at;
  const metaTagsStr = typeof data.meta_tags === 'string'
    ? data.meta_tags
    : (data.meta_tags ? JSON.stringify(data.meta_tags) : null);
  const forReviewNum = data.for_review ? 1 : 0;
  const logId = data.log_id || null;

  db.prepare(`
    INSERT INTO attempts (
      id, problem_id, created_at, finished_at, result, recognition, help, confidence, time_seconds, notes, meta_tags, for_review, log_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.problem_id,
    created_at,
    finished_at,
    data.result,
    data.recognition || null,
    data.help || null,
    data.confidence || null,
    data.time_seconds || null,
    data.notes ? data.notes.trim() : null,
    metaTagsStr,
    forReviewNum,
    logId
  );

  // Update problem's for_review flag
  if (data.for_review !== undefined) {
    db.prepare('UPDATE problems SET for_review = ? WHERE id = ?').run(forReviewNum, data.problem_id);
  }

  // 1. Categorized Tags (user-defined categories)
  if (data.categorized_tags && data.categorized_tags.length > 0) {
    setCategorizedTagsForAttempt(id, data.categorized_tags);
  } else if (data.heuristic_tags !== undefined) {
    setTagsForAttempt(id, data.heuristic_tags);
  }

  // 2. Problem Tags (attached to the problem)
  const problemTags = data.problem_tags !== undefined ? data.problem_tags : data.tags;
  if (problemTags !== undefined) {
    setTagsForProblem(data.problem_id, problemTags);
  }

  // If observation provided, create it (kept for backwards compatibility)
  if (data.observation && data.observation.content.trim()) {
    createObservation({
      problem_id: data.problem_id,
      attempt_id: id,
      type: data.observation.type,
      content: data.observation.content.trim(),
    });
  }

  const probInfo = db.prepare(`
    SELECT p.number as problem_number, p.title as problem_title, s.id as source_id, s.name as source_name, s.subject_id, sub.name as subject_name
    FROM problems p
    JOIN sources s ON s.id = p.source_id
    LEFT JOIN subjects sub ON sub.id = s.subject_id
    WHERE p.id = ?
  `).get(data.problem_id) as any;

  return {
    id,
    problem_id: data.problem_id,
    problem_number: probInfo?.problem_number,
    problem_title: probInfo?.problem_title,
    source_id: probInfo?.source_id,
    source_name: probInfo?.source_name,
    subject_id: probInfo?.subject_id || null,
    subject_name: probInfo?.subject_name || null,
    created_at,
    finished_at,
    result: data.result as any,
    recognition: (data.recognition as any) || null,
    help: (data.help as any) || null,
    confidence: data.confidence || null,
    time_seconds: data.time_seconds || null,
    notes: data.notes || null,
    meta_tags: data.meta_tags || [],
    for_review: Boolean(data.for_review),
    log_id: logId,
  };
}

export function getRecentAttempts(limit: number = 20): any[] {
  const query = `
    SELECT 
      a.*,
      p.number as problem_number,
      p.title as problem_title,
      p.for_review as problem_for_review,
      s.id as source_id,
      s.name as source_name,
      s.subject_id,
      sub.name as subject_name
    FROM attempts a
    JOIN problems p ON p.id = a.problem_id
    JOIN sources s ON s.id = p.source_id
    LEFT JOIN subjects sub ON sub.id = s.subject_id
    ORDER BY a.created_at DESC
    LIMIT ?
  `;
  const attempts = db.prepare(query).all(limit) as any[];

  for (const att of attempts) {
    // Attempt's heuristic tags
    const heurTags = db.prepare(`
      SELECT t.id, t.name
      FROM tags t
      JOIN attempt_tags at ON at.tag_id = t.id
      WHERE at.attempt_id = ?
    `).all(att.id) as any[];
    att.heuristic_tags = heurTags;

    // Parse meta tags
    try {
      att.meta_tags = att.meta_tags ? JSON.parse(att.meta_tags) : [];
    } catch {
      att.meta_tags = [];
    }
    att.for_review = Boolean(att.for_review);

    // Problem's tags
    const probTags = db.prepare(`
      SELECT t.id, t.name
      FROM tags t
      JOIN problem_tags pt ON pt.tag_id = t.id
      WHERE pt.problem_id = ?
    `).all(att.problem_id) as any[];
    att.problem_tags = probTags;

    att.tags = heurTags.length > 0 ? heurTags : probTags;

    // Categorized tags
    const catTags = db.prepare(`
      SELECT t.id, t.name, at.category_id, tc.name as category_name, tc.color as category_color, tc.role as category_role
      FROM tags t
      JOIN attempt_tags at ON at.tag_id = t.id
      LEFT JOIN tag_categories tc ON tc.id = at.category_id
      WHERE at.attempt_id = ?
    `).all(att.id) as any[];
    att.categorized_tags = catTags.map(c => ({
      tag: { id: c.id, name: c.name },
      category: c.category_id ? { id: c.category_id, name: c.category_name, color: c.category_color, role: c.category_role } : undefined
    }));
  }

  return attempts;
}

export function deleteAttempt(id: string): boolean {
  const res = db.prepare('DELETE FROM attempts WHERE id = ?').run(id);
  return (res.changes ?? 0) > 0;
}
