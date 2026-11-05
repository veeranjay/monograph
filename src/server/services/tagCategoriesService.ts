import { db } from '../db.js';
import crypto from 'node:crypto';

export interface TagCategory {
  id: string;
  name: string;
  description?: string | null;
  role?: string | null;
  color?: string | null;
  icon?: string | null;
  created_at: string;
  metadata?: string | null;
  usage_count?: number;
}

export function getAllTagCategories(): TagCategory[] {
  const query = `
    SELECT 
      tc.id, tc.name, tc.description, tc.role, tc.color, tc.icon, tc.created_at, tc.metadata,
      COUNT(at.category_id) as usage_count
    FROM tag_categories tc
    LEFT JOIN attempt_tags at ON at.category_id = tc.id
    GROUP BY tc.id
    ORDER BY tc.created_at ASC
  `;

  return db.prepare(query).all().map((r: any) => ({
    ...r,
    usage_count: Number(r.usage_count || 0)
  }));
}

export function getTagCategoryById(id: string): TagCategory | null {
  const row = db.prepare('SELECT * FROM tag_categories WHERE id = ?').get(id) as any;
  if (!row) return null;
  return row;
}

export function createTagCategory(data: { name: string; description?: string; role?: string; color?: string; icon?: string; metadata?: any }): TagCategory {
  if (!data.name || data.name.trim() === '') {
    throw new Error('Name cannot be empty');
  }
  const existing = db.prepare('SELECT id FROM tag_categories WHERE name = ?').get(data.name.trim());
  if (existing) {
    throw new Error('Tag category with this name already exists');
  }

  const id = crypto.randomUUID();
  const created_at = new Date().toISOString();
  const metadata = data.metadata ? (typeof data.metadata === 'string' ? data.metadata : JSON.stringify(data.metadata)) : null;

  db.prepare(`
    INSERT INTO tag_categories (id, name, description, role, color, icon, created_at, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.name.trim(),
    data.description || null,
    data.role || null,
    data.color || null,
    data.icon || null,
    created_at,
    metadata
  );

  return {
    id,
    name: data.name.trim(),
    description: data.description || null,
    role: data.role || null,
    color: data.color || null,
    icon: data.icon || null,
    created_at,
    metadata,
    usage_count: 0
  };
}

export function updateTagCategory(id: string, data: { name?: string; description?: string; role?: string; color?: string; icon?: string; metadata?: any }): boolean {
  const existing = db.prepare('SELECT * FROM tag_categories WHERE id = ?').get(id);
  if (!existing) return false;

  const updates: string[] = [];
  const params: any[] = [];

  if (data.name !== undefined) {
    if (data.name.trim() === '') throw new Error('Name cannot be empty');
    updates.push('name = ?');
    params.push(data.name.trim());
  }
  if (data.description !== undefined) {
    updates.push('description = ?');
    params.push(data.description);
  }
  if (data.role !== undefined) {
    updates.push('role = ?');
    params.push(data.role);
  }
  if (data.color !== undefined) {
    updates.push('color = ?');
    params.push(data.color);
  }
  if (data.icon !== undefined) {
    updates.push('icon = ?');
    params.push(data.icon);
  }
  if (data.metadata !== undefined) {
    updates.push('metadata = ?');
    params.push(data.metadata ? (typeof data.metadata === 'string' ? data.metadata : JSON.stringify(data.metadata)) : null);
  }

  if (updates.length === 0) return true;
  params.push(id);

  db.prepare(`UPDATE tag_categories SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  return true;
}

export function deleteTagCategory(id: string): boolean {
  const res = db.prepare('DELETE FROM tag_categories WHERE id = ?').run(id);
  return (res.changes ?? 0) > 0;
}
