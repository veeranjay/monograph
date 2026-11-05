import { db } from '../db.js';
import crypto from 'node:crypto';
import { getAllSources, Source } from './sourcesService.js';

export interface Subject {
  id: string;
  name: string;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
  created_at: string;
  metadata?: string | null;
  sources_count?: number;
  sheet_count?: number;
  problem_count?: number;
  problems_count?: number;
  attempt_count?: number;
  solved_count?: number;
  solve_rate?: number;
  latest_activity?: string | null;
}

export function getAllSubjects(): Subject[] {
  const query = `
    SELECT 
      sub.id,
      sub.name,
      sub.description,
      sub.color,
      sub.icon,
      sub.created_at,
      sub.metadata,
      COUNT(DISTINCT s.id) as sources_count,
      COUNT(DISTINCT p.id) as problem_count,
      COUNT(a.id) as attempt_count,
      SUM(CASE WHEN a.result = 'solved' THEN 1 ELSE 0 END) as solved_count,
      MAX(a.created_at) as latest_activity
    FROM subjects sub
    LEFT JOIN sources s ON s.subject_id = sub.id
    LEFT JOIN problems p ON p.source_id = s.id
    LEFT JOIN attempts a ON a.problem_id = p.id
    GROUP BY sub.id
    ORDER BY sub.created_at ASC
  `;

  const rows = db.prepare(query).all() as any[];
  return rows.map(r => {
    const total = Number(r.attempt_count || 0);
    const solved = Number(r.solved_count || 0);
    const sourcesCount = Number(r.sources_count || 0);
    const problemsCount = Number(r.problem_count || 0);
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      color: r.color,
      icon: r.icon,
      created_at: r.created_at,
      metadata: r.metadata,
      sources_count: sourcesCount,
      sheet_count: sourcesCount,
      problem_count: problemsCount,
      problems_count: problemsCount,
      attempt_count: total,
      solved_count: solved,
      solve_rate: total > 0 ? Math.round((solved / total) * 100) : 0,
      latest_activity: r.latest_activity || null,
    };
  });
}

export function getSubjectById(id: string): (Subject & { sources: Source[] }) | null {
  const subjectRow = db.prepare('SELECT * FROM subjects WHERE id = ?').get(id) as any;
  if (!subjectRow) return null;

  const sources = getAllSources(id);

  let totalAttempts = 0;
  let totalSolved = 0;
  let totalProblems = 0;
  let latestActivity: string | null = null;

  for (const s of sources) {
    totalProblems += Number(s.problem_count || 0);
    totalAttempts += Number(s.attempt_count || 0);
    totalSolved += Number(s.solved_count || 0);
    if (s.latest_activity) {
      if (!latestActivity || s.latest_activity > latestActivity) {
        latestActivity = s.latest_activity;
      }
    }
  }

  const solveRate = totalAttempts > 0 ? Math.round((totalSolved / totalAttempts) * 100) : 0;

  return {
    id: subjectRow.id,
    name: subjectRow.name,
    description: subjectRow.description,
    color: subjectRow.color,
    icon: subjectRow.icon,
    created_at: subjectRow.created_at,
    metadata: subjectRow.metadata,
    sources_count: sources.length,
    sheet_count: sources.length,
    problem_count: totalProblems,
    problems_count: totalProblems,
    attempt_count: totalAttempts,
    solved_count: totalSolved,
    solve_rate: solveRate,
    latest_activity: latestActivity,
    sources,
  };
}

export function createSubject(data: {
  id?: string;
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  metadata?: any;
}): Subject {
  if (data.name === undefined || typeof data.name !== 'string' || data.name.trim().length === 0) {
    throw new Error('Subject name must be a non-empty string');
  }
  const id = data.id || crypto.randomUUID();
  const created_at = new Date().toISOString();
  const name = data.name.startsWith(' ') ? data.name.trim() : data.name;
  const description = data.description ? data.description.trim() : null;
  const color = data.color ? data.color.trim() : 'indigo';
  const icon = data.icon ? data.icon.trim() : 'book-open';
  const metadata = data.metadata ? (typeof data.metadata === 'string' ? data.metadata : JSON.stringify(data.metadata)) : null;

  db.prepare(`
    INSERT INTO subjects (id, name, description, color, icon, created_at, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, description, color, icon, created_at, metadata);

  return {
    id,
    name,
    description,
    color,
    icon,
    created_at,
    metadata,
    sources_count: 0,
    sheet_count: 0,
    problem_count: 0,
    problems_count: 0,
    attempt_count: 0,
    solved_count: 0,
    solve_rate: 0,
    latest_activity: null,
  };
}

export function updateSubject(
  id: string,
  data: {
    name?: string;
    description?: string;
    color?: string;
    icon?: string;
    metadata?: any;
  }
): boolean {
  const existing = db.prepare('SELECT * FROM subjects WHERE id = ?').get(id);
  if (!existing) return false;

  const updates: string[] = [];
  const params: any[] = [];

  if (data.name !== undefined) {
    if (typeof data.name !== 'string' || data.name.trim().length === 0) {
      throw new Error('Subject name must be a non-empty string');
    }
    updates.push('name = ?');
    params.push(data.name.trim());
  }
  if (data.description !== undefined) {
    updates.push('description = ?');
    params.push(data.description ? data.description.trim() : null);
  }
  if (data.color !== undefined) {
    updates.push('color = ?');
    params.push(data.color ? data.color.trim() : null);
  }
  if (data.icon !== undefined) {
    updates.push('icon = ?');
    params.push(data.icon ? data.icon.trim() : null);
  }
  if (data.metadata !== undefined) {
    updates.push('metadata = ?');
    params.push(data.metadata ? (typeof data.metadata === 'string' ? data.metadata : JSON.stringify(data.metadata)) : null);
  }

  if (updates.length === 0) return true;

  params.push(id);
  const sql = `UPDATE subjects SET ${updates.join(', ')} WHERE id = ?`;
  db.prepare(sql).run(...params);
  return true;
}

export function deleteSubject(id: string, fallbackSubjectId?: string): boolean {
  const existing = db.prepare('SELECT * FROM subjects WHERE id = ?').get(id);
  if (!existing) return false;

  // Determine fallback subject to reassign sources to
  let targetSubjectId: string | null = null;
  if (fallbackSubjectId && fallbackSubjectId !== id) {
    const targetExists = db.prepare('SELECT id FROM subjects WHERE id = ?').get(fallbackSubjectId);
    if (targetExists) {
      targetSubjectId = fallbackSubjectId;
    }
  }

  if (!targetSubjectId) {
    // Pick first remaining subject (preferring 'Mathematics' or oldest)
    const mathSub = db.prepare("SELECT id FROM subjects WHERE name = 'Mathematics' AND id != ? LIMIT 1").get(id) as any;
    if (mathSub?.id) {
      targetSubjectId = mathSub.id;
    } else {
      const otherSub = db.prepare("SELECT id FROM subjects WHERE id != ? ORDER BY created_at ASC LIMIT 1").get(id) as any;
      if (otherSub?.id) {
        targetSubjectId = otherSub.id;
      }
    }
  }

  // Reassign sources belonging to this subject
  if (targetSubjectId) {
    db.prepare('UPDATE sources SET subject_id = ? WHERE subject_id = ?').run(targetSubjectId, id);
  } else {
    db.prepare('UPDATE sources SET subject_id = NULL WHERE subject_id = ?').run(id);
  }

  const res = db.prepare('DELETE FROM subjects WHERE id = ?').run(id);
  return (res.changes ?? 0) > 0;
}

export function getSubjectStats(subjectId?: string) {
  const subjects = getAllSubjects();
  if (subjectId) {
    const sub = subjects.find(s => s.id === subjectId);
    if (!sub) return null;
    return {
      id: sub.id,
      name: sub.name,
      sources_count: sub.sources_count,
      sheet_count: sub.sheet_count,
      problem_count: sub.problem_count,
      problems_count: sub.problems_count,
      attempt_count: sub.attempt_count,
      solved_count: sub.solved_count,
      solve_rate: sub.solve_rate,
      latest_activity: sub.latest_activity,
    };
  }

  return subjects.map(sub => ({
    id: sub.id,
    name: sub.name,
    sources_count: sub.sources_count,
    sheet_count: sub.sheet_count,
    problem_count: sub.problem_count,
    problems_count: sub.problems_count,
    attempt_count: sub.attempt_count,
    solved_count: sub.solved_count,
    solve_rate: sub.solve_rate,
    latest_activity: sub.latest_activity,
  }));
}
