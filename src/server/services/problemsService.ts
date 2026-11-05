import { db } from '../db.js';
import crypto from 'node:crypto';
import { setTagsForProblem, getTagsForProblem } from './tagsService.js';

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
  attempts?: any[];
  observations?: any[];
  attempt_count?: number;
  latest_result?: string | null;
  latest_recognition?: string | null;
  latest_notes?: string | null;
}

export function getProblemById(id: string): Problem | null {
  const query = `
    SELECT 
      p.*,
      s.name as source_name,
      s.type as source_type,
      s.subject_id,
      sub.name as subject_name
    FROM problems p
    JOIN sources s ON s.id = p.source_id
    LEFT JOIN subjects sub ON sub.id = s.subject_id
    WHERE p.id = ?
  `;
  const problem = db.prepare(query).get(id) as any;
  if (!problem) return null;

  // Get problem tags
  problem.tags = getTagsForProblem(id);
  problem.for_review = Boolean(problem.for_review);

  // Get all attempts in chronological order (most recent first or oldest first)
  const attemptsQuery = `
    SELECT *
    FROM attempts
    WHERE problem_id = ?
    ORDER BY created_at DESC
  `;
  const attempts = db.prepare(attemptsQuery).all(id) as any[];

  // Attach observations to problem and attempts
  const observationsQuery = `
    SELECT *
    FROM observations
    WHERE problem_id = ?
    ORDER BY created_at DESC
  `;
  const observations = db.prepare(observationsQuery).all(id) as any[];

  // Attach heuristic tags to attempts
  for (const att of attempts) {
    const heurTags = db.prepare(`
      SELECT t.id, t.name
      FROM tags t
      JOIN attempt_tags at ON at.tag_id = t.id
      WHERE at.attempt_id = ?
    `).all(att.id) as any[];

    att.heuristic_tags = heurTags.map((t: any) => t.name);
    try {
      att.meta_tags = att.meta_tags ? JSON.parse(att.meta_tags) : [];
    } catch {
      att.meta_tags = [];
    }
    att.for_review = Boolean(att.for_review);
  }

  problem.attempts = attempts;
  problem.problem_tags = problem.tags;
  problem.observations = observations;
  problem.attempt_count = attempts.length;
  problem.latest_result = attempts.length > 0 ? attempts[0].result : null;
  problem.latest_recognition = attempts.length > 0 ? attempts[0].recognition : null;
  problem.latest_notes = attempts.length > 0 ? attempts[0].notes : null;

  return problem;
}

export function createProblem(data: {
  id?: string;
  source_id: string;
  number: string;
  title?: string;
  reference?: string;
  tags?: string[];
  for_review?: number | boolean;
  metadata?: string;
}): Problem {
  const id = data.id || crypto.randomUUID();
  const created_at = new Date().toISOString();
  const title = data.title ? data.title.trim() : null;
  const reference = data.reference ? data.reference.trim() : null;
  const forReviewNum = data.for_review ? 1 : 0;

  db.prepare(`
    INSERT INTO problems (id, source_id, number, title, reference, created_at, for_review, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.source_id, data.number.trim(), title, reference, created_at, forReviewNum, data.metadata || null);

  let tags: any[] = [];
  if (data.tags && data.tags.length > 0) {
    tags = setTagsForProblem(id, data.tags);
  }

  const sourceInfo = db.prepare(`
    SELECT s.name as source_name, s.type as source_type, s.subject_id, sub.name as subject_name
    FROM sources s
    LEFT JOIN subjects sub ON sub.id = s.subject_id
    WHERE s.id = ?
  `).get(data.source_id) as any;

  return {
    id,
    source_id: data.source_id,
    number: data.number.trim(),
    title,
    reference,
    created_at,
    source_name: sourceInfo?.source_name,
    source_type: sourceInfo?.source_type,
    subject_id: sourceInfo?.subject_id || null,
    subject_name: sourceInfo?.subject_name || null,
    tags,
    attempts: [],
    observations: [],
    attempt_count: 0,
  };
}

export function batchCreateProblems(
  source_id: string,
  start: number,
  end: number,
  prefix: string = ''
): { count: number; created: number; problems: any[] } {
  let created = 0;
  const problems: any[] = [];
  for (let i = start; i <= end; i++) {
    const num = String(i).padStart(2, '0');
    const numStr = prefix ? `${prefix}${num}` : num;
    // Check if problem with this number already exists in source
    let existing = db.prepare('SELECT id, source_id, number, created_at FROM problems WHERE source_id = ? AND number = ?').get(source_id, numStr) as any;
    if (!existing) {
      const id = crypto.randomUUID();
      const created_at = new Date().toISOString();
      db.prepare(`
        INSERT INTO problems (id, source_id, number, created_at)
        VALUES (?, ?, ?, ?)
      `).run(id, source_id, numStr, created_at);
      existing = { id, source_id, number: numStr, created_at };
      created++;
    }
    problems.push(existing);
  }
  return { count: created, created, problems };
}

export function updateProblem(id: string, data: {
  number?: string;
  title?: string;
  reference?: string;
  tags?: string[];
  for_review?: boolean;
}): boolean {
  const existing = db.prepare('SELECT * FROM problems WHERE id = ?').get(id);
  if (!existing) return false;

  const updates: string[] = [];
  const params: any[] = [];

  if (data.number !== undefined) {
    updates.push('number = ?');
    params.push(data.number.trim());
  }
  if (data.title !== undefined) {
    updates.push('title = ?');
    params.push(data.title.trim());
  }
  if (data.reference !== undefined) {
    updates.push('reference = ?');
    params.push(data.reference.trim());
  }
  if (data.for_review !== undefined) {
    updates.push('for_review = ?');
    params.push(data.for_review ? 1 : 0);
  }

  if (updates.length > 0) {
    params.push(id);
    db.prepare(`UPDATE problems SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  }

  if (data.tags !== undefined) {
    setTagsForProblem(id, data.tags);
  }

  return true;
}

export function deleteProblem(id: string): boolean {
  const res = db.prepare('DELETE FROM problems WHERE id = ?').run(id);
  return (res.changes ?? 0) > 0;
}
