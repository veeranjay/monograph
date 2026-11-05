import { db } from '../db.js';
import crypto from 'node:crypto';
import { logEvent } from './eventEngine.js';

export interface ObjectTypeRecord {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
  is_system: number;
  created_at: string;
  updated_at: string;
  metadata?: string | null;
}

export interface FieldDefinitionRecord {
  id: string;
  object_type_id: string;
  name: string;
  slug: string;
  field_type: string;
  config: string;
  ordinal: number;
  is_required: number;
  created_at: string;
}

export interface WorkspaceObjectRecord {
  id: string;
  type_id: string;
  type_slug?: string;
  type_name?: string;
  type_color?: string;
  type_icon?: string;
  title: string;
  properties: Record<string, any>;
  content?: string | null;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, any> | null;
  relations?: any[];
}

export function getAllObjectTypes(): ObjectTypeRecord[] {
  return db.prepare('SELECT * FROM object_types ORDER BY is_system DESC, name ASC').all() as unknown as ObjectTypeRecord[];
}

export function getObjectTypeBySlug(slug: string): ObjectTypeRecord | null {
  const row = db.prepare('SELECT * FROM object_types WHERE slug = ?').get(slug) as unknown as ObjectTypeRecord | undefined;
  return row || null;
}

export function getObjectTypeById(id: string): ObjectTypeRecord | null {
  const row = db.prepare('SELECT * FROM object_types WHERE id = ?').get(id) as unknown as ObjectTypeRecord | undefined;
  return row || null;
}

export function createObjectType(data: {
  name: string;
  slug?: string;
  description?: string;
  icon?: string;
  color?: string;
  metadata?: any;
}): ObjectTypeRecord {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const slug = (data.slug || data.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')).trim();

  db.prepare(`
    INSERT INTO object_types (id, name, slug, description, icon, color, is_system, created_at, updated_at, metadata)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
  `).run(
    id,
    data.name.trim(),
    slug,
    data.description || null,
    data.icon || null,
    data.color || null,
    now,
    now,
    JSON.stringify(data.metadata || {})
  );

  return getObjectTypeById(id)!;
}

export function getFieldDefinitions(objectTypeId: string): FieldDefinitionRecord[] {
  return db.prepare('SELECT * FROM field_definitions WHERE object_type_id = ? ORDER BY ordinal ASC, name ASC').all(objectTypeId) as unknown as FieldDefinitionRecord[];
}

export function createFieldDefinition(objectTypeId: string, data: {
  name: string;
  slug?: string;
  field_type: string;
  config?: any;
  ordinal?: number;
  is_required?: boolean;
}): FieldDefinitionRecord {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const slug = (data.slug || data.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')).trim();

  db.prepare(`
    INSERT INTO field_definitions (id, object_type_id, name, slug, field_type, config, ordinal, is_required, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    objectTypeId,
    data.name.trim(),
    slug,
    data.field_type,
    JSON.stringify(data.config || {}),
    data.ordinal || 0,
    data.is_required ? 1 : 0,
    now
  );

  return db.prepare('SELECT * FROM field_definitions WHERE id = ?').get(id) as unknown as FieldDefinitionRecord;
}

export function createObject(typeSlugOrId: string, data: {
  id?: string;
  title: string;
  properties?: Record<string, any>;
  content?: string | null;
  metadata?: Record<string, any>;
}): WorkspaceObjectRecord {
  const now = new Date().toISOString();
  const id = data.id || crypto.randomUUID();

  let type = getObjectTypeBySlug(typeSlugOrId);
  if (!type) {
    type = getObjectTypeById(typeSlugOrId);
  }
  if (!type) {
    throw new Error(`Unknown object type: ${typeSlugOrId}`);
  }

  const propsJson = JSON.stringify(data.properties || {});
  const metaJson = JSON.stringify(data.metadata || {});

  db.prepare(`
    INSERT INTO objects (id, type_id, title, properties, content, created_at, updated_at, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    type.id,
    data.title.trim(),
    propsJson,
    data.content || null,
    now,
    now,
    metaJson
  );

  logEvent(id, 'created', { type: type.slug, title: data.title });

  return getObjectById(id)!;
}

export function getObjectById(id: string): WorkspaceObjectRecord | null {
  const row = db.prepare(`
    SELECT o.*, ot.slug as type_slug, ot.name as type_name, ot.color as type_color, ot.icon as type_icon
    FROM objects o
    JOIN object_types ot ON ot.id = o.type_id
    WHERE o.id = ?
  `).get(id) as any;

  if (!row) return null;

  let properties = {};
  let metadata = {};
  try { properties = JSON.parse(row.properties || '{}'); } catch {}
  try { metadata = JSON.parse(row.metadata || '{}'); } catch {}

  // Hydrate outgoing relations
  const outgoing = db.prepare(`
    SELECT r.id, r.relation_type, r.metadata, r.created_at,
           t.id as target_id, t.title as target_title, ot.slug as target_type_slug, ot.name as target_type_name
    FROM relations r
    JOIN objects t ON t.id = r.target_id
    JOIN object_types ot ON ot.id = t.type_id
    WHERE r.source_id = ?
  `).all(id) as any[];

  // Hydrate incoming relations
  const incoming = db.prepare(`
    SELECT r.id, r.relation_type, r.metadata, r.created_at,
           s.id as source_id, s.title as source_title, ot.slug as source_type_slug, ot.name as source_type_name
    FROM relations r
    JOIN objects s ON s.id = r.source_id
    JOIN object_types ot ON ot.id = s.type_id
    WHERE r.target_id = ?
  `).all(id) as any[];

  return {
    ...row,
    properties,
    metadata,
    relations: {
      outgoing: outgoing.map(o => ({ ...o, metadata: safeJsonParse(o.metadata) })),
      incoming: incoming.map(i => ({ ...i, metadata: safeJsonParse(i.metadata) })),
    }
  };
}

export function updateObject(id: string, data: {
  title?: string;
  properties?: Record<string, any>;
  content?: string | null;
  metadata?: Record<string, any>;
}): WorkspaceObjectRecord {
  const existing = getObjectById(id);
  if (!existing) {
    throw new Error(`Object not found: ${id}`);
  }

  const now = new Date().toISOString();
  const nextTitle = data.title !== undefined ? data.title.trim() : existing.title;
  const nextProps = data.properties !== undefined
    ? { ...existing.properties, ...data.properties }
    : existing.properties;
  const nextContent = data.content !== undefined ? data.content : (existing.content ?? null);
  const nextMeta = data.metadata !== undefined
    ? { ...(existing.metadata || {}), ...data.metadata }
    : (existing.metadata || {});

  db.prepare(`
    UPDATE objects
    SET title = ?, properties = ?, content = ?, updated_at = ?, metadata = ?
    WHERE id = ?
  `).run(
    nextTitle,
    JSON.stringify(nextProps),
    nextContent ?? null,
    now,
    JSON.stringify(nextMeta),
    id
  );

  logEvent(id, 'updated', { changes: Object.keys(data) });

  return getObjectById(id)!;
}

export function deleteObject(id: string): boolean {
  const existing = getObjectById(id);
  if (!existing) return false;

  logEvent(id, 'deleted', { title: existing.title, type: existing.type_slug });
  const res = db.prepare('DELETE FROM objects WHERE id = ?').run(id);
  return (res.changes ?? 0) > 0;
}

export function queryObjects(params: {
  typeSlug?: string;
  search?: string;
  filterProperty?: string;
  filterValue?: any;
  limit?: number;
  offset?: number;
  sortBy?: 'created_at' | 'updated_at' | 'title';
  sortDir?: 'asc' | 'desc';
}): { items: WorkspaceObjectRecord[]; total: number } {
  let whereClauses: string[] = [];
  let args: any[] = [];

  if (params.typeSlug) {
    whereClauses.push('ot.slug = ?');
    args.push(params.typeSlug);
  }

  if (params.search && params.search.trim()) {
    const q = '%' + params.search.trim() + '%';
    whereClauses.push('(o.title LIKE ? OR o.content LIKE ?)');
    args.push(q, q);
  }

  if (params.filterProperty && params.filterValue !== undefined) {
    whereClauses.push(`json_extract(o.properties, '$.' || ?) = ?`);
    args.push(params.filterProperty, String(params.filterValue));
  }

  const whereSql = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';
  const sortBy = params.sortBy || 'updated_at';
  const sortDir = params.sortDir === 'asc' ? 'ASC' : 'DESC';
  const limit = params.limit ? Math.min(params.limit, 200) : 50;
  const offset = params.offset || 0;

  const countRow = db.prepare(`
    SELECT COUNT(o.id) as total
    FROM objects o
    JOIN object_types ot ON ot.id = o.type_id
    ${whereSql}
  `).get(...args) as { total: number };

  const querySql = `
    SELECT o.*, ot.slug as type_slug, ot.name as type_name, ot.color as type_color, ot.icon as type_icon
    FROM objects o
    JOIN object_types ot ON ot.id = o.type_id
    ${whereSql}
    ORDER BY o.${sortBy} ${sortDir}
    LIMIT ? OFFSET ?
  `;

  const rows = db.prepare(querySql).all(...args, limit, offset) as any[];

  const items = rows.map(r => ({
    ...r,
    properties: safeJsonParse(r.properties),
    metadata: safeJsonParse(r.metadata),
  }));

  return { items, total: countRow.total };
}

function safeJsonParse(val: any): Record<string, any> {
  if (!val) return {};
  try { return typeof val === 'string' ? JSON.parse(val) : val; } catch { return {}; }
}
