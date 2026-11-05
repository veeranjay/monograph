import { db } from '../db.js';

export interface SearchResult {
  type: 'subject' | 'source' | 'problem' | 'note' | 'observation' | 'tag';
  id: string;
  title: string;
  subtitle: string;
  context?: string;
  url: string;
  badge?: string;
}

export function searchGlobal(query: string): SearchResult[] {
  if (!query || query.trim().length === 0) return [];
  const term = `%${query.trim()}%`;
  const results: SearchResult[] = [];

  // 0. Search Subjects
  const subjects = db.prepare(`
    SELECT id, name, description
    FROM subjects
    WHERE name LIKE ? OR description LIKE ?
    LIMIT 4
  `).all(term, term) as any[];

  for (const sub of subjects) {
    results.push({
      type: 'subject',
      id: sub.id,
      title: sub.name,
      subtitle: sub.description || 'Subject Notebook',
      badge: 'Subject',
      url: `/subject/${sub.id}`,
    });
  }

  // 1. Search Sources
  const sources = db.prepare(`
    SELECT id, name, type, reference
    FROM sources
    WHERE name LIKE ? OR reference LIKE ?
    LIMIT 5
  `).all(term, term) as any[];

  for (const s of sources) {
    results.push({
      type: 'source',
      id: s.id,
      title: s.name,
      subtitle: s.reference || 'Sheet / Problem Set',
      badge: 'Source',
      url: `/source/${s.id}`,
    });
  }

  // 2. Search Problems
  const problems = db.prepare(`
    SELECT p.id, p.number, p.title, p.reference, s.id as source_id, s.name as source_name
    FROM problems p
    JOIN sources s ON s.id = p.source_id
    WHERE p.number LIKE ? OR p.title LIKE ? OR p.reference LIKE ?
    LIMIT 8
  `).all(term, term, term) as any[];

  for (const p of problems) {
    results.push({
      type: 'problem',
      id: p.id,
      title: `Problem ${p.number}${p.title ? ` — ${p.title}` : ''}`,
      subtitle: p.source_name,
      badge: 'Problem',
      url: `/problem/${p.id}`,
    });
  }

  // 3. Search Notes in Attempts
  const notes = db.prepare(`
    SELECT a.id as attempt_id, a.notes, a.result, p.id as problem_id, p.number as problem_number, s.id as source_id, s.name as source_name
    FROM attempts a
    JOIN problems p ON p.id = a.problem_id
    JOIN sources s ON s.id = p.source_id
    WHERE a.notes LIKE ?
    LIMIT 6
  `).all(term) as any[];

  for (const n of notes) {
    results.push({
      type: 'note',
      id: n.attempt_id,
      title: `Note on Problem ${n.problem_number}`,
      subtitle: n.source_name,
      context: n.notes,
      badge: 'Note',
      url: `/problem/${n.problem_id}`,
    });
  }

  // 4. Search Observations (Mistakes, Techniques, etc.)
  const observations = db.prepare(`
    SELECT o.id, o.type, o.content, p.id as problem_id, p.number as problem_number, s.name as source_name
    FROM observations o
    JOIN problems p ON p.id = o.problem_id
    JOIN sources s ON s.id = p.source_id
    WHERE o.content LIKE ?
    LIMIT 6
  `).all(term) as any[];

  for (const o of observations) {
    results.push({
      type: 'observation',
      id: o.id,
      title: `${o.type.charAt(0).toUpperCase() + o.type.slice(1)}: ${o.content}`,
      subtitle: `${o.source_name} — Problem ${o.problem_number}`,
      badge: o.type.charAt(0).toUpperCase() + o.type.slice(1),
      url: `/problem/${o.problem_id}`,
    });
  }

  // 5. Search Tags
  const tags = db.prepare(`
    SELECT id, name
    FROM tags
    WHERE name LIKE ?
    LIMIT 5
  `).all(term) as any[];

  for (const t of tags) {
    results.push({
      type: 'tag',
      id: t.id,
      title: `Tag: #${t.name}`,
      subtitle: 'View problems with this tag in Analytics',
      badge: 'Tag',
      url: `/analytics?tag=${t.name}`,
    });
  }

  return results;
}
