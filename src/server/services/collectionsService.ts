import { db } from '../db.js';
import crypto from 'node:crypto';

export interface Collection {
  id: string;
  name: string;
  description?: string | null;
  created_at: string;
  problem_count?: number;
}

export function getAllCollections(): Collection[] {
  const query = `
    SELECT 
      c.id, 
      c.name, 
      c.description, 
      c.created_at,
      COUNT(cp.problem_id) as problem_count
    FROM collections c
    LEFT JOIN collection_problems cp ON cp.collection_id = c.id
    GROUP BY c.id
    ORDER BY c.name ASC
  `;
  return db.prepare(query).all() as unknown as Collection[];
}

export function getCollectionById(id: string): (Collection & { problems: any[] }) | null {
  const coll = db.prepare('SELECT * FROM collections WHERE id = ?').get(id) as any;
  if (!coll) return null;

  const problemsQuery = `
    SELECT 
      p.*,
      s.name as source_name,
      (
        SELECT result 
        FROM attempts 
        WHERE problem_id = p.id 
        ORDER BY created_at DESC 
        LIMIT 1
      ) as latest_result
    FROM problems p
    JOIN collection_problems cp ON cp.problem_id = p.id
    JOIN sources s ON s.id = p.source_id
    WHERE cp.collection_id = ?
    ORDER BY p.number ASC
  `;
  const problems = db.prepare(problemsQuery).all(id) as any[];

  return {
    ...coll,
    problems,
  };
}

export function createCollection(name: string, description?: string): Collection {
  const id = crypto.randomUUID();
  const created_at = new Date().toISOString();

  db.prepare(`
    INSERT INTO collections (id, name, description, created_at)
    VALUES (?, ?, ?, ?)
  `).run(id, name.trim(), description ? description.trim() : null, created_at);

  return {
    id,
    name: name.trim(),
    description: description || null,
    created_at,
    problem_count: 0,
  };
}

export function addProblemToCollection(collectionId: string, problemId: string): boolean {
  try {
    db.prepare(`
      INSERT OR IGNORE INTO collection_problems (collection_id, problem_id)
      VALUES (?, ?)
    `).run(collectionId, problemId);
    return true;
  } catch (err) {
    return false;
  }
}

export function removeProblemFromCollection(collectionId: string, problemId: string): boolean {
  const res = db.prepare(`
    DELETE FROM collection_problems
    WHERE collection_id = ? AND problem_id = ?
  `).run(collectionId, problemId);
  return (res.changes ?? 0) > 0;
}

export function deleteCollection(id: string): boolean {
  const res = db.prepare('DELETE FROM collections WHERE id = ?').run(id);
  return (res.changes ?? 0) > 0;
}
