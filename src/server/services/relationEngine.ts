import { db } from '../db.js';
import crypto from 'node:crypto';
import { logEvent } from './eventEngine.js';

export interface RelationRecord {
  id: string;
  source_id: string;
  target_id: string;
  relation_type: string;
  metadata: Record<string, any>;
  created_at: string;
  source_title?: string;
  source_type_slug?: string;
  target_title?: string;
  target_type_slug?: string;
}

export function createRelation(
  sourceId: string,
  targetId: string,
  relationType: string,
  metadata: Record<string, any> = {}
): RelationRecord {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const metaJson = JSON.stringify(metadata);

  db.prepare(`
    INSERT INTO relations (id, source_id, target_id, relation_type, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_id, target_id, relation_type) DO UPDATE SET
      metadata = excluded.metadata
  `).run(id, sourceId, targetId, relationType.trim(), metaJson, now);

  logEvent(sourceId, 'relation_created', { targetId, relationType });

  return getRelation(sourceId, targetId, relationType)!;
}

export function getRelation(sourceId: string, targetId: string, relationType: string): RelationRecord | null {
  const row = db.prepare(`
    SELECT r.*,
           s.title as source_title, sot.slug as source_type_slug,
           t.title as target_title, tot.slug as target_type_slug
    FROM relations r
    JOIN objects s ON s.id = r.source_id
    JOIN object_types sot ON sot.id = s.type_id
    JOIN objects t ON t.id = r.target_id
    JOIN object_types tot ON tot.id = t.type_id
    WHERE r.source_id = ? AND r.target_id = ? AND r.relation_type = ?
  `).get(sourceId, targetId, relationType) as any;

  if (!row) return null;
  return {
    ...row,
    metadata: safeJsonParse(row.metadata),
  };
}

export function deleteRelation(id: string): boolean {
  const res = db.prepare('DELETE FROM relations WHERE id = ?').run(id);
  return (res.changes ?? 0) > 0;
}

export function deleteRelationBetween(sourceId: string, targetId: string, relationType?: string): boolean {
  if (relationType) {
    const res = db.prepare('DELETE FROM relations WHERE source_id = ? AND target_id = ? AND relation_type = ?').run(sourceId, targetId, relationType);
    return (res.changes ?? 0) > 0;
  } else {
    const res = db.prepare('DELETE FROM relations WHERE source_id = ? AND target_id = ?').run(sourceId, targetId);
    return (res.changes ?? 0) > 0;
  }
}

export function getRelationsForObject(
  objectId: string,
  direction: 'both' | 'outgoing' | 'incoming' = 'both'
): RelationRecord[] {
  let query = '';
  if (direction === 'outgoing') {
    query = `
      SELECT r.*,
             s.title as source_title, sot.slug as source_type_slug,
             t.title as target_title, tot.slug as target_type_slug
      FROM relations r
      JOIN objects s ON s.id = r.source_id
      JOIN object_types sot ON sot.id = s.type_id
      JOIN objects t ON t.id = r.target_id
      JOIN object_types tot ON tot.id = t.type_id
      WHERE r.source_id = ?
      ORDER BY r.created_at DESC
    `;
    const rows = db.prepare(query).all(objectId) as any[];
    return rows.map(r => ({ ...r, metadata: safeJsonParse(r.metadata) }));
  } else if (direction === 'incoming') {
    query = `
      SELECT r.*,
             s.title as source_title, sot.slug as source_type_slug,
             t.title as target_title, tot.slug as target_type_slug
      FROM relations r
      JOIN objects s ON s.id = r.source_id
      JOIN object_types sot ON sot.id = s.type_id
      JOIN objects t ON t.id = r.target_id
      JOIN object_types tot ON tot.id = t.type_id
      WHERE r.target_id = ?
      ORDER BY r.created_at DESC
    `;
    const rows = db.prepare(query).all(objectId) as any[];
    return rows.map(r => ({ ...r, metadata: safeJsonParse(r.metadata) }));
  } else {
    query = `
      SELECT r.*,
             s.title as source_title, sot.slug as source_type_slug,
             t.title as target_title, tot.slug as target_type_slug
      FROM relations r
      JOIN objects s ON s.id = r.source_id
      JOIN object_types sot ON sot.id = s.type_id
      JOIN objects t ON t.id = r.target_id
      JOIN object_types tot ON tot.id = t.type_id
      WHERE r.source_id = ? OR r.target_id = ?
      ORDER BY r.created_at DESC
    `;
    const rows = db.prepare(query).all(objectId, objectId) as any[];
    return rows.map(r => ({ ...r, metadata: safeJsonParse(r.metadata) }));
  }
}

export function getGraph(centerObjectId?: string, limit: number = 100): {
  nodes: { id: string; title: string; type: string; color?: string }[];
  edges: { id: string; source: string; target: string; type: string; label?: string }[];
} {
  let edgesRows: any[] = [];
  if (centerObjectId) {
    edgesRows = db.prepare(`
      SELECT r.id, r.source_id, r.target_id, r.relation_type, r.metadata
      FROM relations r
      WHERE r.source_id = ? OR r.target_id = ?
      LIMIT ?
    `).all(centerObjectId, centerObjectId, limit) as any[];
  } else {
    edgesRows = db.prepare(`
      SELECT r.id, r.source_id, r.target_id, r.relation_type, r.metadata
      FROM relations r
      LIMIT ?
    `).all(limit) as any[];
  }

  const nodeIds = new Set<string>();
  if (centerObjectId) nodeIds.add(centerObjectId);
  for (const e of edgesRows) {
    nodeIds.add(e.source_id);
    nodeIds.add(e.target_id);
  }

  if (nodeIds.size === 0) return { nodes: [], edges: [] };

  const idList = Array.from(nodeIds);
  const placeholders = idList.map(() => '?').join(',');
  const nodesRows = db.prepare(`
    SELECT o.id, o.title, ot.slug as type, ot.color
    FROM objects o
    JOIN object_types ot ON ot.id = o.type_id
    WHERE o.id IN (${placeholders})
  `).all(...idList) as any[];

  return {
    nodes: nodesRows.map(n => ({
      id: n.id,
      title: n.title,
      type: n.type,
      color: n.color || undefined,
    })),
    edges: edgesRows.map(e => ({
      id: e.id,
      source: e.source_id,
      target: e.target_id,
      type: e.relation_type,
      label: e.relation_type,
    })),
  };
}

function safeJsonParse(val: any): Record<string, any> {
  if (!val) return {};
  try { return typeof val === 'string' ? JSON.parse(val) : val; } catch { return {}; }
}
