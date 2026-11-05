import { db } from '../db.js';
import crypto from 'node:crypto';

export interface ActivityEvent {
  id: string;
  object_id: string;
  event_type: string;
  payload: Record<string, any>;
  created_at: string;
  object_title?: string;
  object_type?: string;
}

export function logEvent(
  objectId: string,
  eventType: string,
  payload: Record<string, any> = {}
): void {
  try {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO events (id, object_id, event_type, payload, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, objectId, eventType, JSON.stringify(payload), now);
  } catch (err) {
    // Non-blocking
    console.error('Failed to log event:', err);
  }
}

export function getEventsForObject(objectId: string, limit: number = 50): ActivityEvent[] {
  const rows = db.prepare(`
    SELECT e.*, o.title as object_title, ot.slug as object_type
    FROM events e
    JOIN objects o ON o.id = e.object_id
    JOIN object_types ot ON ot.id = o.type_id
    WHERE e.object_id = ?
    ORDER BY e.created_at DESC
    LIMIT ?
  `).all(objectId, limit) as any[];

  return rows.map(r => ({
    ...r,
    payload: safeJsonParse(r.payload),
  }));
}

export function getRecentEvents(limit: number = 30): ActivityEvent[] {
  const rows = db.prepare(`
    SELECT e.*, o.title as object_title, ot.slug as object_type
    FROM events e
    JOIN objects o ON o.id = e.object_id
    JOIN object_types ot ON ot.id = o.type_id
    ORDER BY e.created_at DESC
    LIMIT ?
  `).all(limit) as any[];

  return rows.map(r => ({
    ...r,
    payload: safeJsonParse(r.payload),
  }));
}

function safeJsonParse(val: any): Record<string, any> {
  if (!val) return {};
  try { return typeof val === 'string' ? JSON.parse(val) : val; } catch { return {}; }
}
