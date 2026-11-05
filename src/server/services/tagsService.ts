import { db } from '../db.js';
import crypto from 'node:crypto';

export interface Tag {
  id: string;
  name: string;
  created_at: string;
  usage_count?: number;
}

export function getAllTags(): Tag[] {
  const query = `
    SELECT t.id, t.name, t.created_at,
      (
        (SELECT COUNT(*) FROM problem_tags pt WHERE pt.tag_id = t.id) +
        (SELECT COUNT(*) FROM attempt_tags at WHERE at.tag_id = t.id) +
        (SELECT COUNT(*) FROM observation_tags ot WHERE ot.tag_id = t.id)
      ) AS usage_count
    FROM tags t
    ORDER BY usage_count DESC, t.name ASC
  `;
  return db.prepare(query).all() as unknown as Tag[];
}

export function getOrCreateTag(name: string): Tag {
  const cleanName = name.trim().toLowerCase();
  const existing = db.prepare('SELECT * FROM tags WHERE name = ?').get(cleanName) as unknown as Tag | undefined;
  if (existing) {
    return existing;
  }

  const id = crypto.randomUUID();
  const created_at = new Date().toISOString();
  db.prepare('INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)').run(id, cleanName, created_at);
  return { id, name: cleanName, created_at };
}

export function getTagsForProblem(problemId: string): Tag[] {
  const query = `
    SELECT t.id, t.name, t.created_at
    FROM tags t
    JOIN problem_tags pt ON pt.tag_id = t.id
    WHERE pt.problem_id = ?
    ORDER BY t.name ASC
  `;
  return db.prepare(query).all(problemId) as unknown as Tag[];
}

export function setTagsForProblem(problemId: string, tagNames: string[]): Tag[] {
  // Remove existing
  db.prepare('DELETE FROM problem_tags WHERE problem_id = ?').run(problemId);
  const tags: Tag[] = [];
  for (const name of tagNames) {
    if (!name.trim()) continue;
    const tag = getOrCreateTag(name);
    db.prepare('INSERT OR IGNORE INTO problem_tags (problem_id, tag_id) VALUES (?, ?)').run(problemId, tag.id);
    tags.push(tag);
  }
  return tags;
}

export function setTagsForAttempt(attemptId: string, tagNames: string[]): Tag[] {
  db.prepare('DELETE FROM attempt_tags WHERE attempt_id = ?').run(attemptId);
  const tags: Tag[] = [];
  for (const name of tagNames) {
    if (!name.trim()) continue;
    const tag = getOrCreateTag(name);
    db.prepare('INSERT OR IGNORE INTO attempt_tags (attempt_id, tag_id) VALUES (?, ?)').run(attemptId, tag.id);
    tags.push(tag);
  }
  return tags;
}

export function setCategorizedTagsForAttempt(
  attemptId: string,
  categorized: { tag: string; category_id: string }[]
): void {
  for (const item of categorized) {
    if (!item.tag || !item.tag.trim()) continue;
    const tag = getOrCreateTag(item.tag);
    db.prepare(`
      INSERT INTO attempt_tags (attempt_id, tag_id, category_id)
      VALUES (?, ?, ?)
      ON CONFLICT(attempt_id, tag_id) DO UPDATE SET category_id = excluded.category_id
    `).run(attemptId, tag.id, item.category_id || null);
  }
}

export function deleteTag(id: string): boolean {
  const res = db.prepare('DELETE FROM tags WHERE id = ?').run(id);
  return (res.changes ?? 0) > 0;
}
