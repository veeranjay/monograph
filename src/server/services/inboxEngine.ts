import { db } from '../db.js';
import crypto from 'node:crypto';
import { createObject } from './objectEngine.js';

export interface InboxItemRecord {
  id: string;
  content: string;
  capture_type: 'text' | 'equation' | 'url' | 'problem_draft';
  processed: number;
  converted_object_id?: string | null;
  created_at: string;
  metadata: Record<string, any>;
}

export function getInboxItems(onlyUnprocessed: boolean = true): InboxItemRecord[] {
  let query = 'SELECT * FROM inbox';
  if (onlyUnprocessed) {
    query += ' WHERE processed = 0';
  }
  query += ' ORDER BY created_at DESC LIMIT 100';

  const rows = db.prepare(query).all() as any[];
  return rows.map(r => ({
    ...r,
    metadata: safeJson(r.metadata),
  }));
}

export function getInboxItemById(id: string): InboxItemRecord | null {
  const row = db.prepare('SELECT * FROM inbox WHERE id = ?').get(id) as any;
  if (!row) return null;
  return {
    ...row,
    metadata: safeJson(row.metadata),
  };
}

export function createInboxItem(data: {
  content: string;
  capture_type?: 'text' | 'equation' | 'url' | 'problem_draft';
  metadata?: any;
}): InboxItemRecord {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO inbox (id, content, capture_type, processed, created_at, metadata)
    VALUES (?, ?, ?, 0, ?, ?)
  `).run(
    id,
    data.content.trim(),
    data.capture_type || 'text',
    now,
    JSON.stringify(data.metadata || {})
  );

  return getInboxItemById(id)!;
}

export function convertInboxItem(
  inboxId: string,
  targetTypeSlug: string,
  title: string,
  properties: Record<string, any> = {}
): { inboxItem: InboxItemRecord; object: any } {
  const item = getInboxItemById(inboxId);
  if (!item) throw new Error(`Inbox item not found: ${inboxId}`);

  // Create the object
  const obj = createObject(targetTypeSlug, {
    title: title.trim(),
    properties,
    content: item.content,
  });

  // Mark inbox item as processed
  db.prepare(`
    UPDATE inbox
    SET processed = 1, converted_object_id = ?
    WHERE id = ?
  `).run(obj.id, inboxId);

  return {
    inboxItem: getInboxItemById(inboxId)!,
    object: obj,
  };
}

export function deleteInboxItem(id: string): boolean {
  const res = db.prepare('DELETE FROM inbox WHERE id = ?').run(id);
  return (res.changes ?? 0) > 0;
}

function safeJson(val: any): any {
  if (!val) return {};
  try { return typeof val === 'string' ? JSON.parse(val) : val; } catch { return {}; }
}
