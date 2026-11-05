import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import express, { Express } from 'express';
import { Server } from 'node:http';

import { app } from '../src/server/server.js';
import { initDatabase, setDb, closeDatabase } from '../src/server/db.js';
import * as subjectsService from '../src/server/services/subjectsService.js';
import * as sourcesService from '../src/server/services/sourcesService.js';
import * as problemsService from '../src/server/services/problemsService.js';
import * as attemptsService from '../src/server/services/attemptsService.js';
import * as breadcrumbsService from '../src/server/services/breadcrumbsService.js';

export {
  app,
  initDatabase,
  setDb,
  closeDatabase,
  subjectsService,
  sourcesService,
  problemsService,
  attemptsService,
  breadcrumbsService
};

export interface TestDbInstance {
  db: DatabaseSync;
  dbPath: string;
  isMemory: boolean;
  cleanup: () => void;
}

export interface BreadcrumbItem {
  label: string;
  href?: string;
  active?: boolean;
}

export interface SubjectRecord {
  id: string;
  name: string;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
  created_at: string;
  metadata?: string | null;
  sources_count?: number;
  sheet_count?: number;
  problem_count?: number;
  attempt_count?: number;
  solved_count?: number;
  solve_rate?: number;
  latest_activity?: string | null;
}

export interface SourceRecord {
  id: string;
  name: string;
  type: string;
  reference?: string | null;
  created_at: string;
  metadata?: string | null;
  subject_id?: string | null;
  subject_name?: string | null;
  problem_count?: number;
  attempt_count?: number;
  solved_count?: number;
  solve_rate?: number;
  latest_activity?: string | null;
}

export interface ProblemRecord {
  id: string;
  source_id: string;
  number: string;
  title?: string | null;
  reference?: string | null;
  created_at: string;
  metadata?: string | null;
  for_review?: number | boolean;
  source_name?: string;
  subject_id?: string | null;
  subject_name?: string | null;
  latest_result?: string | null;
  attempts?: AttemptRecord[];
}

export interface AttemptRecord {
  id: string;
  problem_id: string;
  created_at: string;
  finished_at?: string | null;
  result: string;
  recognition?: string | null;
  help?: string | null;
  confidence?: number | null;
  time_seconds?: number | null;
  notes?: string | null;
  meta_tags?: string | null;
  for_review?: number | boolean;
  problem_number?: string;
  source_id?: string;
  source_name?: string;
  subject_id?: string | null;
  subject_name?: string | null;
  heuristic_tags?: string[];
}

/**
 * Creates an isolated SQLite database that NEVER touches monograph.db.
 * Uses :memory: by default, or a temporary file in OS temp dir.
 */
export function createTestDb(options: {
  inMemory?: boolean;
  seedDefaults?: boolean;
  populateLegacyData?: boolean;
} = {}): TestDbInstance {
  const inMemory = options.inMemory ?? true;
  let dbPath = ':memory:';
  let tempFiles: string[] = [];

  if (!inMemory) {
    const id = crypto.randomUUID();
    dbPath = path.join(os.tmpdir(), `monograph_test_${id}.db`);
    tempFiles = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`];
  }

  // Safety Assertion: ensure monograph.db is never passed
  const normalizedPath = path.resolve(dbPath);
  const prodPath = path.resolve(process.cwd(), 'monograph.db');
  if (normalizedPath === prodPath) {
    throw new Error('SAFETY VIOLATION: Test database cannot use production monograph.db!');
  }

  process.env.NODE_ENV = 'test';
  process.env.DB_PATH = dbPath;

  let db: DatabaseSync;

  if (options.populateLegacyData) {
    // For legacy migration tests: create schema without subjects table first
    db = new DatabaseSync(dbPath);
    db.exec('PRAGMA foreign_keys = ON;');
    db.exec(`
      CREATE TABLE IF NOT EXISTS sources (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'sheet',
        reference TEXT,
        created_at TEXT NOT NULL,
        metadata TEXT,
        subject_id TEXT
      );

      CREATE TABLE IF NOT EXISTS problems (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        number TEXT NOT NULL,
        title TEXT,
        reference TEXT,
        created_at TEXT NOT NULL,
        metadata TEXT,
        for_review INTEGER DEFAULT 0,
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
        meta_tags TEXT,
        for_review INTEGER DEFAULT 0,
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

      CREATE TABLE IF NOT EXISTS subjects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        color TEXT,
        icon TEXT,
        created_at TEXT NOT NULL,
        metadata TEXT
      );
    `);

    // Insert legacy data without subjects
    const s1 = 'legacy-sheet-1';
    const s2 = 'legacy-sheet-2';
    const now = new Date().toISOString();
    db.prepare('INSERT INTO sources (id, name, type, reference, created_at, subject_id) VALUES (?, ?, ?, ?, ?, NULL)').run(
      s1, 'Legacy Integration Sheet', 'sheet', 'Stewart Ch 5', now
    );
    db.prepare('INSERT INTO sources (id, name, type, reference, created_at, subject_id) VALUES (?, ?, ?, ?, ?, NULL)').run(
      s2, 'Legacy Limits Set', 'sheet', 'Spivak Ch 2', now
    );
    db.prepare('INSERT INTO problems (id, source_id, number, title, created_at) VALUES (?, ?, ?, ?, ?)').run(
      'p-leg-1', s1, 'Q01', 'Integration by parts', now
    );
    db.prepare('INSERT INTO attempts (id, problem_id, created_at, result, notes) VALUES (?, ?, ?, ?, ?)').run(
      'a-leg-1', 'p-leg-1', now, 'solved', 'Done cleanly'
    );
  } else {
    db = initDatabase(dbPath);
  }

  setDb(db);

  const cleanup = () => {
    try {
      db.close();
    } catch {}
    setDb(null);
    for (const f of tempFiles) {
      try {
        if (fs.existsSync(f)) {
          fs.unlinkSync(f);
        }
      } catch {}
    }
  };

  return {
    db,
    dbPath,
    isMemory: inMemory,
    cleanup
  };
}

/**
 * Seeds default subjects: Mathematics, Physics, Computer Science
 */
export function seedDefaultSubjects(db: DatabaseSync): { mathId: string; physicsId: string; csId: string } {
  setDb(db);
  const mathId = 'sub-math-default';
  const physicsId = 'sub-physics-default';
  const csId = 'sub-cs-default';
  const now = new Date().toISOString();

  db.prepare(`
    INSERT OR IGNORE INTO subjects (id, name, description, color, icon, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    mathId,
    'Mathematics',
    'Core calculus, analysis, linear algebra, and competition problem sets.',
    '#82533d',
    'calculator',
    now
  );

  db.prepare(`
    INSERT OR IGNORE INTO subjects (id, name, description, color, icon, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    physicsId,
    'Physics',
    'Classical mechanics, electrodynamics, and experimental physics problem sets.',
    '#2563eb',
    'atom',
    now
  );

  db.prepare(`
    INSERT OR IGNORE INTO subjects (id, name, description, color, icon, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    csId,
    'Computer Science',
    'Algorithms, discrete mathematics, and computational theory exercises.',
    '#059669',
    'binary',
    now
  );

  return { mathId, physicsId, csId };
}

/**
 * Backfills unassigned sources into default subject
 */
export function backfillSourcesToDefaultSubject(db: DatabaseSync): number {
  setDb(db);
  const defaultSubject = db.prepare("SELECT id FROM subjects WHERE name = 'Mathematics' LIMIT 1").get() as any;
  if (!defaultSubject?.id) return 0;
  const result = db.prepare("UPDATE sources SET subject_id = ? WHERE subject_id IS NULL OR subject_id = ''").run(defaultSubject.id);
  return Number(result.changes || 0);
}

// -------------------------------------------------------------
// Database Helper Operations (Delegating directly to production services)
// -------------------------------------------------------------

export function insertSubject(db: DatabaseSync, data: {
  id?: string;
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  metadata?: any;
}): SubjectRecord {
  setDb(db);
  return subjectsService.createSubject(data);
}

export function getAllSubjectsWithStats(db: DatabaseSync): SubjectRecord[] {
  setDb(db);
  return subjectsService.getAllSubjects();
}

export function getSubjectById(db: DatabaseSync, id: string): (SubjectRecord & { sources: SourceRecord[] }) | null {
  setDb(db);
  return subjectsService.getSubjectById(id);
}

export function insertSource(db: DatabaseSync, data: {
  id?: string;
  name: string;
  type?: string;
  reference?: string;
  subject_id?: string | null;
  metadata?: string;
}): SourceRecord {
  setDb(db);
  return sourcesService.createSource(data);
}

export function insertProblem(db: DatabaseSync, data: {
  id?: string;
  source_id: string;
  number: string;
  title?: string;
  reference?: string;
  metadata?: string;
  for_review?: number;
}): ProblemRecord {
  setDb(db);
  return problemsService.createProblem(data);
}

export function insertAttempt(db: DatabaseSync, data: {
  id?: string;
  problem_id: string;
  result: string;
  created_at?: string;
  finished_at?: string;
  recognition?: string;
  help?: string;
  confidence?: number;
  time_seconds?: number;
  notes?: string;
  meta_tags?: string;
  for_review?: number;
  heuristic_tags?: string[];
}): AttemptRecord {
  setDb(db);
  return attemptsService.createAttempt(data);
}

export function resolveBreadcrumbs(
  db: DatabaseSync,
  entityType: 'subject' | 'source' | 'problem',
  entityId: string
): BreadcrumbItem[] {
  setDb(db);
  return breadcrumbsService.resolveBreadcrumbs(entityType, entityId);
}

// -------------------------------------------------------------
// Real REST API Application Coupling
// -------------------------------------------------------------

export function createTestApp(db: DatabaseSync): Express {
  setDb(db);
  return app;
}

/**
 * Starts an ephemeral test server listening on port 0.
 */
export async function startTestServer(app: Express): Promise<{
  server: Server;
  port: number;
  url: string;
  baseUrl: string;
  close: () => Promise<void>;
}> {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address() as any;
      const port = addr.port;
      const baseUrl = `http://127.0.0.1:${port}`;
      resolve({
        server,
        port,
        url: baseUrl,
        baseUrl,
        close: () => new Promise<void>((res) => server.close(() => res()))
      });
    });
  });
}
