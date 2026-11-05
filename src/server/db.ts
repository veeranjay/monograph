import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { assertTestIsolation } from './guardrails.js';

export function getDefaultDbPath(): string {
  return process.env.DB_PATH || path.resolve(process.cwd(), 'monograph.db');
}

export function initDatabase(dbFilePath: string = getDefaultDbPath()): DatabaseSync {
  assertTestIsolation(dbFilePath);

  const db = new DatabaseSync(dbFilePath);

  // Enable foreign keys
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');

  // ── Core schema ──────────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS subjects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      color TEXT,
      icon TEXT,
      created_at TEXT NOT NULL,
      metadata TEXT
    );

    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'sheet',
      reference TEXT,
      created_at TEXT NOT NULL,
      metadata TEXT
    );

    CREATE TABLE IF NOT EXISTS problems (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      number TEXT NOT NULL,
      title TEXT,
      reference TEXT,
      created_at TEXT NOT NULL,
      metadata TEXT,
      FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS attempts (
      id TEXT PRIMARY KEY,
      problem_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      finished_at TEXT,
      result TEXT NOT NULL,
      recognition TEXT,
      help TEXT,
      confidence INTEGER,
      time_seconds INTEGER,
      notes TEXT,
      FOREIGN KEY (problem_id) REFERENCES problems(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS observations (
      id TEXT PRIMARY KEY,
      problem_id TEXT NOT NULL,
      attempt_id TEXT,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (problem_id) REFERENCES problems(id) ON DELETE CASCADE,
      FOREIGN KEY (attempt_id) REFERENCES attempts(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS problem_tags (
      problem_id TEXT NOT NULL,
      tag_id TEXT NOT NULL,
      PRIMARY KEY (problem_id, tag_id),
      FOREIGN KEY (problem_id) REFERENCES problems(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS attempt_tags (
      attempt_id TEXT NOT NULL,
      tag_id TEXT NOT NULL,
      PRIMARY KEY (attempt_id, tag_id),
      FOREIGN KEY (attempt_id) REFERENCES attempts(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS observation_tags (
      observation_id TEXT NOT NULL,
      tag_id TEXT NOT NULL,
      PRIMARY KEY (observation_id, tag_id),
      FOREIGN KEY (observation_id) REFERENCES observations(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS collections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS collection_problems (
      collection_id TEXT NOT NULL,
      problem_id TEXT NOT NULL,
      PRIMARY KEY (collection_id, problem_id),
      FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
      FOREIGN KEY (problem_id) REFERENCES problems(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS practice_logs (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'in_progress',
      current_problem_id TEXT,
      time_seconds INTEGER NOT NULL DEFAULT 0,
      notes_draft TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      metadata TEXT,
      FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE,
      FOREIGN KEY (current_problem_id) REFERENCES problems(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_problems_source_id ON problems(source_id);
    CREATE INDEX IF NOT EXISTS idx_attempts_problem_id ON attempts(problem_id);
    CREATE INDEX IF NOT EXISTS idx_observations_problem_id ON observations(problem_id);
    CREATE INDEX IF NOT EXISTS idx_problem_tags_tag_id ON problem_tags(tag_id);
    CREATE INDEX IF NOT EXISTS idx_attempt_tags_tag_id ON attempt_tags(tag_id);
    CREATE INDEX IF NOT EXISTS idx_practice_logs_source_id ON practice_logs(source_id);
    CREATE INDEX IF NOT EXISTS idx_practice_logs_status ON practice_logs(status);
    CREATE INDEX IF NOT EXISTS idx_practice_logs_created_at ON practice_logs(created_at);
  `);

  // ── Academic Suite: Tag Categories (user-defined, replaces hardcoded types) ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS tag_categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      role TEXT,
      color TEXT,
      icon TEXT,
      created_at TEXT NOT NULL,
      metadata TEXT
    );
  `);

  // ── Academic Suite: Notes ────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
      title TEXT NOT NULL DEFAULT 'Untitled',
      content TEXT NOT NULL DEFAULT '[]',
      type TEXT NOT NULL DEFAULT 'note',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      metadata TEXT
    );

    CREATE TABLE IF NOT EXISTS note_tags (
      note_id TEXT NOT NULL,
      tag_id TEXT NOT NULL,
      PRIMARY KEY (note_id, tag_id),
      FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_notes_subject_id ON notes(subject_id);
    CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(updated_at);
    CREATE INDEX IF NOT EXISTS idx_note_tags_tag_id ON note_tags(tag_id);
  `);

  // ── Academic Suite: PDFs & Highlights ─────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS pdfs (
      id TEXT PRIMARY KEY,
      subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      filename TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0,
      page_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      metadata TEXT
    );

    CREATE TABLE IF NOT EXISTS pdf_highlights (
      id TEXT PRIMARY KEY,
      pdf_id TEXT NOT NULL,
      page_number INTEGER NOT NULL,
      color TEXT NOT NULL DEFAULT 'yellow',
      text TEXT NOT NULL,
      note TEXT,
      rects TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (pdf_id) REFERENCES pdfs(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_pdfs_subject_id ON pdfs(subject_id);
    CREATE INDEX IF NOT EXISTS idx_pdfs_created_at ON pdfs(created_at);
    CREATE INDEX IF NOT EXISTS idx_pdf_highlights_pdf_id ON pdf_highlights(pdf_id);
    CREATE INDEX IF NOT EXISTS idx_pdf_highlights_page_number ON pdf_highlights(page_number);
  `);

  // ── Incremental schema migrations (safe, idempotent) ────────────────────────
  // sources.subject_id
  try { db.exec('ALTER TABLE sources ADD COLUMN subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL;'); } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_sources_subject_id ON sources(subject_id);'); } catch {}

  // attempts extras
  try { db.exec('ALTER TABLE attempts ADD COLUMN meta_tags TEXT;'); } catch {}
  try { db.exec('ALTER TABLE attempts ADD COLUMN for_review INTEGER DEFAULT 0;'); } catch {}
  try { db.exec('ALTER TABLE problems ADD COLUMN for_review INTEGER DEFAULT 0;'); } catch {}
  try { db.exec('ALTER TABLE attempts ADD COLUMN log_id TEXT REFERENCES practice_logs(id) ON DELETE SET NULL;'); } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_attempts_log_id ON attempts(log_id);'); } catch {}

  // attempt_tags: add category_id for user-defined tag category tracking
  try { db.exec('ALTER TABLE attempt_tags ADD COLUMN category_id TEXT REFERENCES tag_categories(id) ON DELETE SET NULL;'); } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_attempt_tags_category_id ON attempt_tags(category_id);'); } catch {}

  // ── Generic Workspace & Object Engine Schema ──────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS object_types (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      icon TEXT,
      color TEXT,
      is_system INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      metadata TEXT DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS field_definitions (
      id TEXT PRIMARY KEY,
      object_type_id TEXT NOT NULL REFERENCES object_types(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      field_type TEXT NOT NULL,
      config TEXT DEFAULT '{}',
      ordinal INTEGER DEFAULT 0,
      is_required INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      UNIQUE(object_type_id, slug)
    );

    CREATE TABLE IF NOT EXISTS objects (
      id TEXT PRIMARY KEY,
      type_id TEXT NOT NULL REFERENCES object_types(id) ON DELETE RESTRICT,
      title TEXT NOT NULL,
      properties TEXT NOT NULL DEFAULT '{}',
      content TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      metadata TEXT DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_objects_type_id ON objects(type_id);
    CREATE INDEX IF NOT EXISTS idx_objects_updated_at ON objects(updated_at);

    CREATE TABLE IF NOT EXISTS relations (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
      target_id TEXT NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
      relation_type TEXT NOT NULL,
      metadata TEXT DEFAULT '{}',
      created_at TEXT NOT NULL,
      UNIQUE(source_id, target_id, relation_type)
    );
    CREATE INDEX IF NOT EXISTS idx_relations_source ON relations(source_id);
    CREATE INDEX IF NOT EXISTS idx_relations_target ON relations(target_id);
    CREATE INDEX IF NOT EXISTS idx_relations_type ON relations(relation_type);

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      object_id TEXT REFERENCES objects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      blocks TEXT NOT NULL DEFAULT '[]',
      latex_source TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      metadata TEXT DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_documents_object_id ON documents(object_id);

    CREATE TABLE IF NOT EXISTS views (
      id TEXT PRIMARY KEY,
      object_type_id TEXT REFERENCES object_types(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      view_type TEXT NOT NULL,
      query TEXT NOT NULL DEFAULT '{}',
      sort TEXT NOT NULL DEFAULT '[]',
      config TEXT NOT NULL DEFAULT '{}',
      is_default INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      object_id TEXT NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      payload TEXT DEFAULT '{}',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_events_object_id ON events(object_id);
    CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);

    CREATE TABLE IF NOT EXISTS inbox (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      capture_type TEXT NOT NULL DEFAULT 'text',
      processed INTEGER NOT NULL DEFAULT 0,
      converted_object_id TEXT REFERENCES objects(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      metadata TEXT DEFAULT '{}'
    );
  `);

  // ── Seed default tag categories + backfill ───────────────────────────────────
  seedAndBackfillTagCategories(db);

  // ── Seed default academic object types & fields ──────────────────────────────
  seedAcademicObjectTypes(db);

  // ── Lossless migration: Legacy records → Generic Objects & Relations ───────────
  migrateLegacyToGenericObjects(db);

  return db;
}

/**
 * Idempotently seeds the 3 default tag categories (Heuristic, Meta, Topic)
 * and backfills `attempt_tags.category_id` from the old `meta_tags` JSON column.
 *
 * Heuristic tags were already stored in `attempt_tags` (via setTagsForAttempt),
 * so those rows just need their category_id updated.
 * Meta tags were stored as JSON strings in `attempts.meta_tags`, so those
 * need new rows inserted into `attempt_tags` with the Meta category_id.
 */
function seedAndBackfillTagCategories(db: DatabaseSync): void {
  const now = new Date().toISOString();

  const defaults = [
    { name: 'Heuristic', role: 'heuristic', color: '#8b5cf6', description: 'Problem-solving strategies and approaches used during an attempt' },
    { name: 'Meta', role: 'meta', color: '#3b82f6', description: 'High-level categorization and difficulty markers' },
    { name: 'Topic', role: 'topic', color: '#6b7280', description: 'Subject matter and concept topic tags' },
  ];

  const ids: Record<string, string> = {};

  for (const cat of defaults) {
    const existing = db.prepare('SELECT id FROM tag_categories WHERE name = ?').get(cat.name) as { id: string } | undefined;
    if (existing) {
      ids[cat.role] = existing.id;
    } else {
      const id = crypto.randomUUID();
      db.prepare(`
        INSERT INTO tag_categories (id, name, description, role, color, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, cat.name, cat.description, cat.role, cat.color, now);
      ids[cat.role] = id;
    }
  }

  const heuristicId = ids['heuristic'];
  const metaId = ids['meta'];

  // Backfill 1: heuristic_tags — attempt_tags rows with no category_id yet
  // These rows were created by setTagsForAttempt and represent heuristic tags.
  // We assign them the Heuristic category if they don't already have one.
  // Since we can't distinguish "heuristic" from "topic" rows in the old scheme
  // without extra context, we leave existing NULL rows to the user to categorize,
  // and only assign category_id to rows inserted going forward.

  // Backfill 2: meta_tags JSON column → attempt_tags rows with Meta category_id
  // This is a genuine new-data backfill since meta_tags were JSON-only.
  try {
    const attemptsWithMeta = db.prepare(
      "SELECT id, meta_tags FROM attempts WHERE meta_tags IS NOT NULL AND meta_tags != '' AND meta_tags != '[]' AND meta_tags != 'null'"
    ).all() as { id: string; meta_tags: string }[];

    for (const att of attemptsWithMeta) {
      let names: string[] = [];
      try {
        const parsed = JSON.parse(att.meta_tags);
        names = Array.isArray(parsed) ? parsed.filter((n) => typeof n === 'string' && n.trim()) : [];
      } catch {
        continue;
      }

      for (const name of names) {
        const trimmed = name.trim();
        if (!trimmed) continue;

        // Find or create tag record
        let tag = db.prepare('SELECT id FROM tags WHERE name = ?').get(trimmed) as { id: string } | undefined;
        if (!tag) {
          const tagId = crypto.randomUUID();
          try {
            db.prepare('INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)').run(tagId, trimmed, now);
            tag = { id: tagId };
          } catch {
            tag = db.prepare('SELECT id FROM tags WHERE name = ?').get(trimmed) as { id: string } | undefined;
            if (!tag) continue;
          }
        }

        // Insert attempt_tags row with meta category_id (if not already present)
        try {
          db.prepare(
            'INSERT OR IGNORE INTO attempt_tags (attempt_id, tag_id, category_id) VALUES (?, ?, ?)'
          ).run(att.id, tag.id, metaId);
        } catch {}
      }
    }
  } catch {
    // Backfill is best-effort — if it fails (e.g., column doesn't exist yet), skip
  }
}

function seedAcademicObjectTypes(db: DatabaseSync): void {
  const now = new Date().toISOString();
  const types = [
    { id: 'type_notebook', slug: 'notebook', name: 'Notebook', description: 'Subject or course workspace container', icon: 'book-marked', color: '#6366f1' },
    { id: 'type_sheet', slug: 'sheet', name: 'Sheet', description: 'Curated problem sheet, worksheet, or problem set', icon: 'file-spreadsheet', color: '#0e3566' },
    { id: 'type_problem', slug: 'problem', name: 'Problem', description: 'Discrete academic problem, question, or exercise', icon: 'target', color: '#0284c7' },
    { id: 'type_attempt', slug: 'attempt', name: 'Attempt', description: 'Student execution attempt on a problem', icon: 'check-circle', color: '#10b981' },
    { id: 'type_note', slug: 'note', name: 'Note', description: 'Document, journal entry, or mathematical summary', icon: 'file-text', color: '#8b5cf6' },
    { id: 'type_concept', slug: 'concept', name: 'Concept', description: 'Core domain idea, theorem, or knowledge node', icon: 'brain', color: '#ec4899' },
    { id: 'type_technique', slug: 'technique', name: 'Technique', description: 'Problem-solving heuristic, formula, or method', icon: 'wrench', color: '#f59e0b' },
    { id: 'type_failure', slug: 'failure', name: 'Failure', description: 'Misconception, calculation slip, or pattern failure', icon: 'alert-triangle', color: '#ef4444' },
    { id: 'type_reference', slug: 'reference', name: 'Reference', description: 'Book, paper, lecture, or external source citation', icon: 'bookmark', color: '#64748b' },
    { id: 'type_tag', slug: 'tag', name: 'Tag', description: 'Taxonomy or keyword label', icon: 'tag', color: '#84cc16' },
    { id: 'type_practice_log', slug: 'practice_log', name: 'Practice Log', description: 'Time-tracked problem-solving session', icon: 'pen-square', color: '#0e3566' },
    { id: 'type_pdf', slug: 'pdf', name: 'PDF Document', description: 'Academic paper, textbook chapter, or PDF problem sheet', icon: 'file', color: '#dc2626' },
  ];

  for (const t of types) {
    db.prepare(`
      INSERT OR IGNORE INTO object_types (id, name, slug, description, icon, color, is_system, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(t.id, t.name, t.slug, t.description, t.icon, t.color, now, now);
  }

  // Seed default fields for Problem
  const problemFields = [
    { slug: 'number', name: 'Number', type: 'text', ordinal: 1 },
    { slug: 'reference', name: 'Reference', type: 'text', ordinal: 2 },
    { slug: 'difficulty', name: 'Difficulty', type: 'number', ordinal: 3 },
    { slug: 'status', name: 'Status', type: 'select', ordinal: 4, config: JSON.stringify({ options: ['unsolved', 'attempted', 'solved', 'review'] }) },
    { slug: 'for_review', name: 'For Review', type: 'boolean', ordinal: 5 },
  ];
  for (const f of problemFields) {
    db.prepare(`
      INSERT OR IGNORE INTO field_definitions (id, object_type_id, name, slug, field_type, config, ordinal, created_at)
      VALUES (?, 'type_problem', ?, ?, ?, ?, ?, ?)
    `).run('field_problem_' + f.slug, f.name, f.slug, f.type, (f as any).config || '{}', f.ordinal, now);
  }

  // Seed default fields for Attempt
  const attemptFields = [
    { slug: 'result', name: 'Result', type: 'select', ordinal: 1, config: JSON.stringify({ options: ['solved', 'partial', 'failed', 'skipped'] }) },
    { slug: 'recognition', name: 'Recognition', type: 'select', ordinal: 2, config: JSON.stringify({ options: ['recognized_immediately', 'recognized_after_thinking', 'didnt_recognize', 'not_sure'] }) },
    { slug: 'help', name: 'Help', type: 'select', ordinal: 3, config: JSON.stringify({ options: ['none', 'hint', 'solution', 'someone_helped'] }) },
    { slug: 'confidence', name: 'Confidence', type: 'number', ordinal: 4 },
    { slug: 'time_seconds', name: 'Duration (s)', type: 'duration', ordinal: 5 },
  ];
  for (const f of attemptFields) {
    db.prepare(`
      INSERT OR IGNORE INTO field_definitions (id, object_type_id, name, slug, field_type, config, ordinal, created_at)
      VALUES (?, 'type_attempt', ?, ?, ?, ?, ?, ?)
    `).run('field_attempt_' + f.slug, f.name, f.slug, f.type, (f as any).config || '{}', f.ordinal, now);
  }
}

function migrateLegacyToGenericObjects(db: DatabaseSync): void {
  const now = new Date().toISOString();

  // 1. Subjects -> Objects (Notebooks)
  try {
    const subjects = db.prepare('SELECT * FROM subjects').all() as any[];
    for (const sub of subjects) {
      const props = JSON.stringify({
        color: sub.color || null,
        icon: sub.icon || null,
        description: sub.description || null,
      });
      db.prepare(`
        INSERT OR IGNORE INTO objects (id, type_id, title, properties, content, created_at, updated_at, metadata)
        VALUES (?, 'type_notebook', ?, ?, NULL, ?, ?, ?)
      `).run(sub.id, sub.name, props, sub.created_at, sub.created_at, sub.metadata || '{}');
    }
  } catch {}

  // 2. Sources -> Objects (Sheets) + Relations
  try {
    const sources = db.prepare('SELECT * FROM sources').all() as any[];
    for (const src of sources) {
      const props = JSON.stringify({
        type: src.type || 'sheet',
        reference: src.reference || null,
      });
      db.prepare(`
        INSERT OR IGNORE INTO objects (id, type_id, title, properties, content, created_at, updated_at, metadata)
        VALUES (?, 'type_sheet', ?, ?, NULL, ?, ?, ?)
      `).run(src.id, src.name, props, src.created_at, src.created_at, src.metadata || '{}');

      if (src.subject_id) {
        db.prepare(`
          INSERT OR IGNORE INTO relations (id, source_id, target_id, relation_type, metadata, created_at)
          VALUES (?, ?, ?, 'contains', '{}', ?)
        `).run(crypto.randomUUID(), src.subject_id, src.id, src.created_at);
      }
    }
  } catch {}

  // 3. Problems -> Objects + Relations
  try {
    const problems = db.prepare('SELECT * FROM problems').all() as any[];
    for (const p of problems) {
      const props = JSON.stringify({
        number: p.number,
        reference: p.reference || null,
        for_review: p.for_review === 1,
      });
      const title = p.title && p.title.trim() ? p.title.trim() : 'Problem ' + p.number;
      db.prepare(`
        INSERT OR IGNORE INTO objects (id, type_id, title, properties, content, created_at, updated_at, metadata)
        VALUES (?, 'type_problem', ?, ?, NULL, ?, ?, ?)
      `).run(p.id, title, props, p.created_at, p.created_at, p.metadata || '{}');

      if (p.source_id) {
        db.prepare(`
          INSERT OR IGNORE INTO relations (id, source_id, target_id, relation_type, metadata, created_at)
          VALUES (?, ?, ?, 'contains', '{}', ?)
        `).run(crypto.randomUUID(), p.source_id, p.id, p.created_at);
      }
    }
  } catch {}

  // 4. Attempts -> Objects + Relations
  try {
    const attempts = db.prepare('SELECT * FROM attempts').all() as any[];
    for (const att of attempts) {
      const props = JSON.stringify({
        result: att.result,
        recognition: att.recognition || null,
        help: att.help || null,
        confidence: att.confidence || null,
        time_seconds: att.time_seconds || null,
        for_review: att.for_review === 1,
        log_id: att.log_id || null,
      });
      db.prepare(`
        INSERT OR IGNORE INTO objects (id, type_id, title, properties, content, created_at, updated_at, metadata)
        VALUES (?, 'type_attempt', ?, ?, ?, ?, ?, '{}')
      `).run(att.id, 'Attempt on ' + att.problem_id, props, att.notes || null, att.created_at, att.finished_at || att.created_at);

      if (att.problem_id) {
        const relMetadata = JSON.stringify({
          result: att.result,
          recognition: att.recognition || null,
          help: att.help || null,
          time_seconds: att.time_seconds || null,
        });
        db.prepare(`
          INSERT OR IGNORE INTO relations (id, source_id, target_id, relation_type, metadata, created_at)
          VALUES (?, ?, ?, 'attempts', ?, ?)
        `).run(crypto.randomUUID(), att.id, att.problem_id, relMetadata, att.created_at);
      }

      if (att.log_id) {
        db.prepare(`
          INSERT OR IGNORE INTO relations (id, source_id, target_id, relation_type, metadata, created_at)
          VALUES (?, ?, ?, 'logged_in', '{}', ?)
        `).run(crypto.randomUUID(), att.id, att.log_id, att.created_at);
      }
    }
  } catch {}

  // 5. Notes -> Objects & Documents + Relations
  try {
    const notes = db.prepare('SELECT * FROM notes').all() as any[];
    for (const n of notes) {
      const props = JSON.stringify({
        type: n.type || 'note',
      });
      db.prepare(`
        INSERT OR IGNORE INTO objects (id, type_id, title, properties, content, created_at, updated_at, metadata)
        VALUES (?, 'type_note', ?, ?, ?, ?, ?, ?)
      `).run(n.id, n.title || 'Untitled', props, n.content || '[]', n.created_at, n.updated_at, n.metadata || '{}');

      db.prepare(`
        INSERT OR IGNORE INTO documents (id, object_id, title, blocks, created_at, updated_at, metadata)
        VALUES (?, ?, ?, ?, ?, ?, '{}')
      `).run(n.id, n.id, n.title || 'Untitled', n.content || '[]', n.created_at, n.updated_at);

      if (n.subject_id) {
        db.prepare(`
          INSERT OR IGNORE INTO relations (id, source_id, target_id, relation_type, metadata, created_at)
          VALUES (?, ?, ?, 'contained_in', '{}', ?)
        `).run(crypto.randomUUID(), n.id, n.subject_id, n.created_at);
      }
    }
  } catch {}

  // 6. Tags -> Objects & Tagging Relations
  try {
    const tags = db.prepare('SELECT * FROM tags').all() as any[];
    for (const t of tags) {
      db.prepare(`
        INSERT OR IGNORE INTO objects (id, type_id, title, properties, content, created_at, updated_at, metadata)
        VALUES (?, 'type_tag', ?, '{}', NULL, ?, ?, '{}')
      `).run(t.id, t.name, t.created_at, t.created_at);
    }

    const probTags = db.prepare('SELECT * FROM problem_tags').all() as any[];
    for (const pt of probTags) {
      db.prepare(`
        INSERT OR IGNORE INTO relations (id, source_id, target_id, relation_type, metadata, created_at)
        VALUES (?, ?, ?, 'tagged_with', '{}', ?)
      `).run(crypto.randomUUID(), pt.problem_id, pt.tag_id, now);
    }

    const attTags = db.prepare('SELECT * FROM attempt_tags').all() as any[];
    for (const at of attTags) {
      const meta = JSON.stringify({ category_id: at.category_id || null });
      db.prepare(`
        INSERT OR IGNORE INTO relations (id, source_id, target_id, relation_type, metadata, created_at)
        VALUES (?, ?, ?, 'tagged_with', ?, ?)
      `).run(crypto.randomUUID(), at.attempt_id, at.tag_id, meta, now);
    }
  } catch {}

  // 7. Practice Logs -> Objects
  try {
    const logs = db.prepare('SELECT * FROM practice_logs').all() as any[];
    for (const pl of logs) {
      const props = JSON.stringify({
        status: pl.status,
        time_seconds: pl.time_seconds,
        current_problem_id: pl.current_problem_id || null,
        completed_at: pl.completed_at || null,
      });
      db.prepare(`
        INSERT OR IGNORE INTO objects (id, type_id, title, properties, content, created_at, updated_at, metadata)
        VALUES (?, 'type_practice_log', ?, ?, ?, ?, ?, ?)
      `).run(pl.id, 'Session ' + pl.id.substring(0, 8), props, pl.notes_draft || null, pl.created_at, pl.updated_at, pl.metadata || '{}');

      if (pl.source_id) {
        db.prepare(`
          INSERT OR IGNORE INTO relations (id, source_id, target_id, relation_type, metadata, created_at)
          VALUES (?, ?, ?, 'session_of', '{}', ?)
        `).run(crypto.randomUUID(), pl.id, pl.source_id, pl.created_at);
      }
    }
  } catch {}
}

let _activeDb: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (!_activeDb) {
    _activeDb = initDatabase(getDefaultDbPath());
  }
  return _activeDb;
}

export function setDb(newDb: DatabaseSync | null): void {
  _activeDb = newDb;
}

export function closeDatabase(): void {
  if (_activeDb) {
    try {
      _activeDb.close();
    } catch {}
    _activeDb = null;
  }
}

export const db: DatabaseSync = new Proxy({} as DatabaseSync, {
  get(_target, prop) {
    const active = getDb();
    const val = (active as any)[prop];
    if (typeof val === 'function') {
      return val.bind(active);
    }
    return val;
  }
});
