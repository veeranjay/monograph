import { db } from '../db.js';
import crypto from 'node:crypto';

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

export function getAllSources(subjectId?: string): Source[] {
  let query = `
    SELECT 
      s.id, 
      s.name, 
      s.type, 
      s.reference, 
      s.created_at, 
      s.metadata,
      s.subject_id,
      sub.name as subject_name,
      COUNT(DISTINCT p.id) as problem_count,
      COUNT(a.id) as attempt_count,
      SUM(CASE WHEN a.result = 'solved' THEN 1 ELSE 0 END) as solved_count,
      MAX(a.created_at) as latest_activity
    FROM sources s
    LEFT JOIN subjects sub ON sub.id = s.subject_id
    LEFT JOIN problems p ON p.source_id = s.id
    LEFT JOIN attempts a ON a.problem_id = p.id
  `;

  const params: any[] = [];
  if (subjectId) {
    query += ' WHERE s.subject_id = ?';
    params.push(subjectId);
  }

  query += `
    GROUP BY s.id
    ORDER BY COALESCE(MAX(a.created_at), s.created_at) DESC
  `;

  const rows = db.prepare(query).all(...params) as any[];
  return rows.map(r => {
    const total = Number(r.attempt_count || 0);
    const solved = Number(r.solved_count || 0);
    return {
      id: r.id,
      name: r.name,
      type: r.type,
      reference: r.reference,
      created_at: r.created_at,
      metadata: r.metadata,
      subject_id: r.subject_id || null,
      subject_name: r.subject_name || null,
      problem_count: Number(r.problem_count || 0),
      attempt_count: total,
      solved_count: solved,
      solve_rate: total > 0 ? Math.round((solved / total) * 100) : 0,
      latest_activity: r.latest_activity,
    };
  });
}

export function getSourceById(id: string): (Source & { problems: any[] }) | null {
  const sourceQuery = `
    SELECT 
      s.*,
      sub.name as subject_name
    FROM sources s
    LEFT JOIN subjects sub ON sub.id = s.subject_id
    WHERE s.id = ?
  `;
  const source = db.prepare(sourceQuery).get(id) as any;
  if (!source) return null;

  const problemsQuery = `
    SELECT 
      p.id, 
      p.source_id, 
      p.number, 
      p.title, 
      p.reference, 
      p.created_at,
      p.for_review,
      COUNT(a.id) as attempt_count,
      (
        SELECT result 
        FROM attempts 
        WHERE problem_id = p.id 
        ORDER BY created_at DESC 
        LIMIT 1
      ) as latest_result,
      (
        SELECT recognition 
        FROM attempts 
        WHERE problem_id = p.id 
        ORDER BY created_at DESC 
        LIMIT 1
      ) as latest_recognition,
      (
        SELECT created_at 
        FROM attempts 
        WHERE problem_id = p.id 
        ORDER BY created_at DESC 
        LIMIT 1
      ) as latest_attempt_at,
      (
        SELECT notes 
        FROM attempts 
        WHERE problem_id = p.id 
        ORDER BY created_at DESC 
        LIMIT 1
      ) as latest_notes
    FROM problems p
    LEFT JOIN attempts a ON a.problem_id = p.id
    WHERE p.source_id = ?
    GROUP BY p.id
    ORDER BY 
      CAST(p.number AS INTEGER) ASC, 
      p.number ASC
  `;

  const problems = db.prepare(problemsQuery).all(id) as any[];

  // Attach tags and attempts for each problem
  for (const prob of problems) {
    prob.for_review = Boolean(prob.for_review);
    const tags = db.prepare(`
      SELECT t.id, t.name 
      FROM tags t 
      JOIN problem_tags pt ON pt.tag_id = t.id 
      WHERE pt.problem_id = ?
    `).all(prob.id) as any[];
    prob.tags = tags;

    // Attach full attempt history for this problem
    const attempts = db.prepare(`
      SELECT *
      FROM attempts
      WHERE problem_id = ?
      ORDER BY created_at DESC
    `).all(prob.id) as any[];

    for (const att of attempts) {
      att.heuristic_tags = db.prepare(`
        SELECT t.id, t.name
        FROM tags t
        JOIN attempt_tags at ON at.tag_id = t.id
        WHERE at.attempt_id = ?
      `).all(att.id).map((t: any) => t.name);

      try {
        att.meta_tags = att.meta_tags ? JSON.parse(att.meta_tags) : [];
      } catch {
        att.meta_tags = [];
      }
      att.for_review = Boolean(att.for_review);
    }
    prob.attempts = attempts;
  }

  return {
    ...source,
    problems,
  };
}

export function createSource(data: {
  id?: string;
  name: string;
  type?: string;
  reference?: string;
  metadata?: any;
  subject_id?: string | null;
}): Source {
  const id = data.id || crypto.randomUUID();
  const created_at = new Date().toISOString();
  const type = data.type || 'sheet';
  const reference = data.reference || null;
  const metadata = data.metadata ? (typeof data.metadata === 'string' ? data.metadata : JSON.stringify(data.metadata)) : null;

  let subject_id = data.subject_id || null;
  if (!subject_id) {
    const defaultSub = (db.prepare("SELECT id FROM subjects WHERE name = 'Mathematics' LIMIT 1").get() ||
      db.prepare("SELECT id FROM subjects ORDER BY created_at ASC LIMIT 1").get()) as any;
    if (defaultSub?.id) {
      subject_id = defaultSub.id;
    }
  }

  let subject_name: string | null = null;
  if (subject_id) {
    const subRow = db.prepare('SELECT name FROM subjects WHERE id = ?').get(subject_id) as any;
    subject_name = subRow?.name || null;
  }

  db.prepare(`
    INSERT INTO sources (id, name, type, reference, created_at, metadata, subject_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.name.trim(), type, reference, created_at, metadata, subject_id);

  return {
    id,
    name: data.name.trim(),
    type,
    reference,
    created_at,
    metadata,
    subject_id,
    subject_name,
    problem_count: 0,
    attempt_count: 0,
    solved_count: 0,
    solve_rate: 0,
  };
}

export function updateSource(
  id: string,
  data: {
    name?: string;
    type?: string;
    reference?: string;
    subject_id?: string | null;
    metadata?: any;
  }
): boolean {
  const existing = db.prepare('SELECT * FROM sources WHERE id = ?').get(id);
  if (!existing) return false;

  const updates: string[] = [];
  const params: any[] = [];

  if (data.name !== undefined) {
    updates.push('name = ?');
    params.push(data.name.trim());
  }
  if (data.type !== undefined) {
    updates.push('type = ?');
    params.push(data.type);
  }
  if (data.reference !== undefined) {
    updates.push('reference = ?');
    params.push(data.reference);
  }
  if (data.subject_id !== undefined) {
    updates.push('subject_id = ?');
    params.push(data.subject_id || null);
  }
  if (data.metadata !== undefined) {
    updates.push('metadata = ?');
    params.push(data.metadata ? (typeof data.metadata === 'string' ? data.metadata : JSON.stringify(data.metadata)) : null);
  }

  if (updates.length === 0) return true;

  params.push(id);
  const sql = `UPDATE sources SET ${updates.join(', ')} WHERE id = ?`;
  db.prepare(sql).run(...params);
  return true;
}

export function deleteSource(id: string): boolean {
  const res = db.prepare('DELETE FROM sources WHERE id = ?').run(id);
  return (res.changes ?? 0) > 0;
}
