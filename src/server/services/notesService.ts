import { db } from '../db.js';
import crypto from 'node:crypto';

export interface Note {
  id: string;
  subject_id?: string | null;
  title: string;
  content: string;
  type: string;
  created_at: string;
  updated_at: string;
  metadata?: string | null;
  subject_name?: string | null;
  tags?: any[];
}

export function createNote(data: { subject_id?: string | null; title?: string; content?: string; type?: string; metadata?: any }): Note {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  
  const title = data.title || 'Untitled';
  const content = data.content || '[]';
  const type = data.type || 'note';
  const metadata = data.metadata ? (typeof data.metadata === 'string' ? data.metadata : JSON.stringify(data.metadata)) : null;

  db.prepare(`
    INSERT INTO notes (id, subject_id, title, content, type, created_at, updated_at, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.subject_id || null, title, content, type, now, now, metadata);

  return {
    id,
    subject_id: data.subject_id || null,
    title,
    content,
    type,
    created_at: now,
    updated_at: now,
    metadata
  };
}

export function getNoteById(id: string): Note | null {
  const row = db.prepare(`
    SELECT n.*, s.name as subject_name
    FROM notes n
    LEFT JOIN subjects s ON s.id = n.subject_id
    WHERE n.id = ?
  `).get(id) as any;
  if (!row) return null;

  row.tags = db.prepare(`
    SELECT t.id, t.name 
    FROM tags t
    JOIN note_tags nt ON nt.tag_id = t.id
    WHERE nt.note_id = ?
  `).all(id);

  return row;
}

export function getAllNotes(params?: { subject_id?: string; type?: string; limit?: number }): Note[] {
  let query = `
    SELECT n.*, s.name as subject_name
    FROM notes n
    LEFT JOIN subjects s ON s.id = n.subject_id
    WHERE 1=1
  `;
  const args: any[] = [];
  
  if (params?.subject_id) {
    query += ` AND n.subject_id = ?`;
    args.push(params.subject_id);
  }
  if (params?.type) {
    query += ` AND n.type = ?`;
    args.push(params.type);
  }
  
  query += ` ORDER BY n.updated_at DESC LIMIT ?`;
  args.push(params?.limit || 100);

  const notes = db.prepare(query).all(...args) as any[];

  for (const n of notes) {
    n.tags = db.prepare(`
      SELECT t.id, t.name 
      FROM tags t
      JOIN note_tags nt ON nt.tag_id = t.id
      WHERE nt.note_id = ?
    `).all(n.id);
  }

  return notes;
}

export function getRecentNotes(limit: number = 8): Note[] {
  return getAllNotes({ limit });
}

export function updateNote(id: string, data: { subject_id?: string | null; title?: string; content?: string; type?: string; metadata?: any }): Note | null {
  const updates: string[] = [];
  const args: any[] = [];

  if (data.subject_id !== undefined) {
    updates.push('subject_id = ?');
    args.push(data.subject_id || null);
  }
  if (data.title !== undefined) {
    updates.push('title = ?');
    args.push(data.title);
  }
  if (data.content !== undefined) {
    updates.push('content = ?');
    args.push(data.content);
  }
  if (data.type !== undefined) {
    updates.push('type = ?');
    args.push(data.type);
  }
  if (data.metadata !== undefined) {
    updates.push('metadata = ?');
    args.push(data.metadata ? (typeof data.metadata === 'string' ? data.metadata : JSON.stringify(data.metadata)) : null);
  }

  if (updates.length > 0) {
    updates.push('updated_at = ?');
    args.push(new Date().toISOString());

    args.push(id);
    db.prepare(`UPDATE notes SET ${updates.join(', ')} WHERE id = ?`).run(...args);
  }

  return getNoteById(id);
}

export function deleteNote(id: string): boolean {
  const res = db.prepare('DELETE FROM notes WHERE id = ?').run(id);
  return (res.changes ?? 0) > 0;
}

export function searchNotes(query: string): Note[] {
  if (!query.trim()) return [];
  const q = '%' + query + '%';
  
  const notes = db.prepare(`
    SELECT n.*, s.name as subject_name
    FROM notes n
    LEFT JOIN subjects s ON s.id = n.subject_id
    WHERE n.title LIKE ? OR n.content LIKE ?
    ORDER BY n.updated_at DESC
    LIMIT 20
  `).all(q, q) as any[];

  for (const n of notes) {
    n.tags = db.prepare(`
      SELECT t.id, t.name 
      FROM tags t
      JOIN note_tags nt ON nt.tag_id = t.id
      WHERE nt.note_id = ?
    `).all(n.id);
  }

  return notes;
}
