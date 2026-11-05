import { db } from '../db.js';
import crypto from 'node:crypto';

export interface Observation {
  id: string;
  problem_id: string;
  attempt_id?: string | null;
  type: 'note' | 'mistake' | 'insight' | 'technique' | 'pattern' | 'question';
  content: string;
  created_at: string;
  problem_number?: string;
  source_id?: string;
  source_name?: string;
}

export function createObservation(data: {
  problem_id: string;
  attempt_id?: string;
  type: 'note' | 'mistake' | 'insight' | 'technique' | 'pattern' | 'question';
  content: string;
}): Observation {
  const id = crypto.randomUUID();
  const created_at = new Date().toISOString();

  db.prepare(`
    INSERT INTO observations (id, problem_id, attempt_id, type, content, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, data.problem_id, data.attempt_id || null, data.type, data.content.trim(), created_at);

  return {
    id,
    problem_id: data.problem_id,
    attempt_id: data.attempt_id || null,
    type: data.type,
    content: data.content.trim(),
    created_at,
  };
}

export function getObservations(filters?: {
  type?: string;
  problem_id?: string;
  limit?: number;
}): Observation[] {
  let query = `
    SELECT 
      o.*,
      p.number as problem_number,
      p.title as problem_title,
      s.id as source_id,
      s.name as source_name
    FROM observations o
    JOIN problems p ON p.id = o.problem_id
    JOIN sources s ON s.id = p.source_id
  `;
  const conditions: string[] = [];
  const params: any[] = [];

  if (filters?.type) {
    conditions.push('o.type = ?');
    params.push(filters.type);
  }
  if (filters?.problem_id) {
    conditions.push('o.problem_id = ?');
    params.push(filters.problem_id);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY o.created_at DESC';

  if (filters?.limit) {
    query += ' LIMIT ?';
    params.push(filters.limit);
  }

  return db.prepare(query).all(...params) as unknown as Observation[];
}

export function deleteObservation(id: string): boolean {
  const res = db.prepare('DELETE FROM observations WHERE id = ?').run(id);
  return (res.changes ?? 0) > 0;
}
