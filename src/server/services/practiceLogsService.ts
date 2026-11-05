import { db } from '../db.js';
import crypto from 'node:crypto';

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
  attempts?: any[];
}

export function getAllLogs(options?: {
  source_id?: string;
  status?: string;
  limit?: number;
}): PracticeLog[] {
  let query = `
    SELECT
      l.id,
      l.source_id,
      l.status,
      l.current_problem_id,
      l.time_seconds,
      l.notes_draft,
      l.created_at,
      l.updated_at,
      l.completed_at,
      l.metadata,
      s.name as source_name,
      sub.id as subject_id,
      sub.name as subject_name,
      sub.color as subject_color,
      p.number as current_problem_number,
      p.title as current_problem_title,
      (SELECT COUNT(*) FROM problems WHERE source_id = l.source_id) as problem_count,
      (SELECT COUNT(*) FROM attempts WHERE log_id = l.id) as attempts_count,
      (SELECT COUNT(*) FROM attempts WHERE log_id = l.id AND result = 'solved') as solved_count
    FROM practice_logs l
    JOIN sources s ON s.id = l.source_id
    LEFT JOIN subjects sub ON sub.id = s.subject_id
    LEFT JOIN problems p ON p.id = l.current_problem_id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (options?.source_id) {
    query += ' AND l.source_id = ?';
    params.push(options.source_id);
  }
  if (options?.status) {
    query += ' AND l.status = ?';
    params.push(options.status);
  }

  query += ' ORDER BY l.updated_at DESC';

  if (options?.limit) {
    query += ' LIMIT ?';
    params.push(Number(options.limit));
  }

  return db.prepare(query).all(...params) as unknown as PracticeLog[];
}

export function getLogById(id: string): PracticeLog | null {
  const row = db.prepare(`
    SELECT
      l.id,
      l.source_id,
      l.status,
      l.current_problem_id,
      l.time_seconds,
      l.notes_draft,
      l.created_at,
      l.updated_at,
      l.completed_at,
      l.metadata,
      s.name as source_name,
      sub.id as subject_id,
      sub.name as subject_name,
      sub.color as subject_color,
      p.number as current_problem_number,
      p.title as current_problem_title,
      (SELECT COUNT(*) FROM problems WHERE source_id = l.source_id) as problem_count,
      (SELECT COUNT(*) FROM attempts WHERE log_id = l.id) as attempts_count,
      (SELECT COUNT(*) FROM attempts WHERE log_id = l.id AND result = 'solved') as solved_count
    FROM practice_logs l
    JOIN sources s ON s.id = l.source_id
    LEFT JOIN subjects sub ON sub.id = s.subject_id
    LEFT JOIN problems p ON p.id = l.current_problem_id
    WHERE l.id = ?
  `).get(id) as unknown as PracticeLog | undefined;

  if (!row) return null;

  const sessionAttempts = db.prepare(`
    SELECT
      a.id,
      a.problem_id,
      a.created_at,
      a.finished_at,
      a.result,
      a.recognition,
      a.help,
      a.confidence,
      a.time_seconds,
      a.notes,
      a.for_review,
      p.number as problem_number,
      p.title as problem_title
    FROM attempts a
    JOIN problems p ON p.id = a.problem_id
    WHERE a.log_id = ?
    ORDER BY a.created_at ASC
  `).all(id) as any[];

  return {
    ...row,
    attempts: sessionAttempts,
  };
}

export function getActiveLog(sourceId?: string): PracticeLog | null {
  let query = `
    SELECT
      l.id,
      l.source_id,
      l.status,
      l.current_problem_id,
      l.time_seconds,
      l.notes_draft,
      l.created_at,
      l.updated_at,
      l.completed_at,
      l.metadata,
      s.name as source_name,
      sub.id as subject_id,
      sub.name as subject_name,
      sub.color as subject_color,
      p.number as current_problem_number,
      p.title as current_problem_title,
      (SELECT COUNT(*) FROM problems WHERE source_id = l.source_id) as problem_count,
      (SELECT COUNT(*) FROM attempts WHERE log_id = l.id) as attempts_count,
      (SELECT COUNT(*) FROM attempts WHERE log_id = l.id AND result = 'solved') as solved_count
    FROM practice_logs l
    JOIN sources s ON s.id = l.source_id
    LEFT JOIN subjects sub ON sub.id = s.subject_id
    LEFT JOIN problems p ON p.id = l.current_problem_id
    WHERE l.status IN ('in_progress', 'paused')
  `;
  const params: any[] = [];

  if (sourceId) {
    query += ' AND l.source_id = ?';
    params.push(sourceId);
  }

  query += ' ORDER BY l.updated_at DESC LIMIT 1';

  const row = db.prepare(query).get(...params) as unknown as PracticeLog | undefined;
  if (!row) return null;

  return getLogById(row.id);
}

export function createLog(data: {
  source_id: string;
  current_problem_id?: string | null;
  time_seconds?: number;
  notes_draft?: string | null;
}): PracticeLog {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  // If no problem_id is specified, pick the first unsolved problem or first problem in source
  let problemId = data.current_problem_id || null;
  if (!problemId) {
    const firstProb = db.prepare(`
      SELECT p.id FROM problems p
      WHERE p.source_id = ?
      ORDER BY CAST(p.number AS INTEGER) ASC, p.number ASC
      LIMIT 1
    `).get(data.source_id) as { id: string } | undefined;
    problemId = firstProb?.id || null;
  }

  db.prepare(`
    INSERT INTO practice_logs (
      id, source_id, status, current_problem_id, time_seconds, notes_draft, created_at, updated_at
    ) VALUES (?, ?, 'in_progress', ?, ?, ?, ?, ?)
  `).run(
    id,
    data.source_id,
    problemId,
    data.time_seconds || 0,
    data.notes_draft || null,
    now,
    now
  );

  const created = getLogById(id);
  if (!created) throw new Error('Failed to create practice log');
  return created;
}

export function updateLog(
  id: string,
  data: {
    status?: 'in_progress' | 'paused' | 'completed' | string;
    current_problem_id?: string | null;
    time_seconds?: number;
    notes_draft?: string | null;
  }
): boolean {
  const existing = db.prepare('SELECT id FROM practice_logs WHERE id = ?').get(id);
  if (!existing) return false;

  const now = new Date().toISOString();
  const updates: string[] = ['updated_at = ?'];
  const values: any[] = [now];

  if (data.status !== undefined) {
    updates.push('status = ?');
    values.push(data.status);
    if (data.status === 'completed') {
      updates.push('completed_at = ?');
      values.push(now);
    }
  }

  if (data.current_problem_id !== undefined) {
    updates.push('current_problem_id = ?');
    values.push(data.current_problem_id);
  }

  if (data.time_seconds !== undefined) {
    updates.push('time_seconds = ?');
    values.push(Number(data.time_seconds));
  }

  if (data.notes_draft !== undefined) {
    updates.push('notes_draft = ?');
    values.push(data.notes_draft);
  }

  values.push(id);
  const result = db.prepare(`UPDATE practice_logs SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  return result.changes > 0;
}

export function completeLog(id: string, data?: { time_seconds?: number }): boolean {
  const now = new Date().toISOString();
  const updates = ['status = ?', 'completed_at = ?', 'updated_at = ?'];
  const values: any[] = ['completed', now, now];

  if (data?.time_seconds !== undefined) {
    updates.push('time_seconds = ?');
    values.push(Number(data.time_seconds));
  }

  values.push(id);
  const result = db.prepare(`UPDATE practice_logs SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  return result.changes > 0;
}

export function deleteLog(id: string): boolean {
  const result = db.prepare('DELETE FROM practice_logs WHERE id = ?').run(id);
  return result.changes > 0;
}
