import { db } from '../db.js';
import crypto from 'node:crypto';
import { queryObjects } from './objectEngine.js';

export interface ViewRecord {
  id: string;
  object_type_id?: string | null;
  name: string;
  view_type: 'table' | 'kanban' | 'gallery' | 'list' | 'calendar' | 'graph';
  query: Record<string, any>;
  sort: any[];
  config: Record<string, any>;
  is_default: number;
  created_at: string;
  updated_at: string;
}

export function getAllViews(objectTypeId?: string): ViewRecord[] {
  let query = 'SELECT * FROM views';
  const args: any[] = [];
  if (objectTypeId) {
    query += ' WHERE object_type_id = ?';
    args.push(objectTypeId);
  }
  query += ' ORDER BY is_default DESC, name ASC';

  const rows = db.prepare(query).all(...args) as any[];
  return rows.map(r => ({
    ...r,
    query: safeJson(r.query),
    sort: safeJson(r.sort),
    config: safeJson(r.config),
  }));
}

export function getViewById(id: string): ViewRecord | null {
  const row = db.prepare('SELECT * FROM views WHERE id = ?').get(id) as any;
  if (!row) return null;
  return {
    ...row,
    query: safeJson(row.query),
    sort: safeJson(row.sort),
    config: safeJson(row.config),
  };
}

export function createView(data: {
  object_type_id?: string | null;
  name: string;
  view_type: 'table' | 'kanban' | 'gallery' | 'list' | 'calendar' | 'graph';
  query?: Record<string, any>;
  sort?: any[];
  config?: Record<string, any>;
  is_default?: boolean;
}): ViewRecord {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO views (id, object_type_id, name, view_type, query, sort, config, is_default, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.object_type_id || null,
    data.name.trim(),
    data.view_type,
    JSON.stringify(data.query || {}),
    JSON.stringify(data.sort || []),
    JSON.stringify(data.config || {}),
    data.is_default ? 1 : 0,
    now,
    now
  );

  return getViewById(id)!;
}

export function updateView(id: string, data: {
  name?: string;
  view_type?: 'table' | 'kanban' | 'gallery' | 'list' | 'calendar' | 'graph';
  query?: Record<string, any>;
  sort?: any[];
  config?: Record<string, any>;
  is_default?: boolean;
}): ViewRecord {
  const existing = getViewById(id);
  if (!existing) throw new Error(`View not found: ${id}`);

  const now = new Date().toISOString();
  const name = data.name !== undefined ? data.name.trim() : existing.name;
  const viewType = data.view_type !== undefined ? data.view_type : existing.view_type;
  const query = data.query !== undefined ? JSON.stringify(data.query) : JSON.stringify(existing.query);
  const sort = data.sort !== undefined ? JSON.stringify(data.sort) : JSON.stringify(existing.sort);
  const config = data.config !== undefined ? JSON.stringify(data.config) : JSON.stringify(existing.config);
  const isDefault = data.is_default !== undefined ? (data.is_default ? 1 : 0) : existing.is_default;

  db.prepare(`
    UPDATE views
    SET name = ?, view_type = ?, query = ?, sort = ?, config = ?, is_default = ?, updated_at = ?
    WHERE id = ?
  `).run(name, viewType, query, sort, config, isDefault, now, id);

  return getViewById(id)!;
}

export function deleteView(id: string): boolean {
  const res = db.prepare('DELETE FROM views WHERE id = ?').run(id);
  return (res.changes ?? 0) > 0;
}

export function executeView(viewId: string): {
  view: ViewRecord;
  items: any[];
  total: number;
} {
  const view = getViewById(viewId);
  if (!view) throw new Error(`View not found: ${viewId}`);

  let typeSlug: string | undefined;
  if (view.object_type_id) {
    const typeRow = db.prepare('SELECT slug FROM object_types WHERE id = ?').get(view.object_type_id) as any;
    if (typeRow) typeSlug = typeRow.slug;
  }

  const queryResult = queryObjects({
    typeSlug,
    search: view.query.search,
    filterProperty: view.query.filterProperty,
    filterValue: view.query.filterValue,
    sortBy: view.sort?.[0]?.field || 'updated_at',
    sortDir: view.sort?.[0]?.dir || 'desc',
    limit: 100,
  });

  return {
    view,
    items: queryResult.items,
    total: queryResult.total,
  };
}

function safeJson(val: any): any {
  if (!val) return {};
  try { return typeof val === 'string' ? JSON.parse(val) : val; } catch { return {}; }
}
