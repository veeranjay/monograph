import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import http from 'node:http';
import { AddressInfo } from 'node:net';

// ---------------------------------------------------------------------------
// Setup: Point DB_PATH to an isolated temporary file BEFORE importing server
// Dynamic imports in before() ensure DB_PATH is set before db.ts loads.
// ---------------------------------------------------------------------------
const isolatedDbId = crypto.randomUUID();
const isolatedDbPath = path.join(os.tmpdir(), `challenger_isolated_${isolatedDbId}.db`);
process.env.DB_PATH = isolatedDbPath;
process.env.NODE_ENV = 'test';

let initDatabase: any;
let appDb: any;
let subjectsService: any;
let sourcesService: any;
let problemsService: any;
let attemptsService: any;
let analyticsService: any;
let app: any;
let server: http.Server;
let baseUrl: string;

describe('Milestone 1 Empirical Challenger Test Battery', () => {
  before(async () => {
    // Dynamically import modules so that process.env.DB_PATH is active
    const dbModule = await import('../src/server/db.js');
    initDatabase = dbModule.initDatabase;
    appDb = dbModule.db;

    subjectsService = await import('../src/server/services/subjectsService.js');
    sourcesService = await import('../src/server/services/sourcesService.js');
    problemsService = await import('../src/server/services/problemsService.js');
    attemptsService = await import('../src/server/services/attemptsService.js');
    analyticsService = await import('../src/server/services/analyticsService.js');
    const serverModule = await import('../src/server/server.js');
    app = serverModule.app;

    // Start real production express app on ephemeral port
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const port = (server.address() as AddressInfo).port;
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    try {
      if (appDb) appDb.close();
    } catch {}
    // Clean up isolated DB files
    for (const ext of ['', '-wal', '-shm']) {
      try {
        const f = `${isolatedDbPath}${ext}`;
        if (fs.existsSync(f)) fs.unlinkSync(f);
      } catch {}
    }
  });

  // =========================================================================
  // SUITE 1: Production monograph.db Verification
  // =========================================================================
  describe('Suite 1: Production Database (monograph.db) Health & Fidelity', () => {
    const prodDbPath = path.resolve(process.cwd(), 'monograph.db');

    test('1.1: Production DB exists and passes PRAGMA integrity_check', () => {
      assert.ok(fs.existsSync(prodDbPath), 'monograph.db must exist on disk');
      const prodDb = new DatabaseSync(prodDbPath, {readOnly:true});
      try {
        const integrity = prodDb.prepare('PRAGMA integrity_check;').all() as any[];
        assert.equal(integrity.length, 1);
        assert.equal(integrity[0].integrity_check, 'ok');
      } finally {
        prodDb.close();
      }
    });

    test('1.2: Production DB passes PRAGMA foreign_key_check with 0 violations', () => {
      const prodDb = new DatabaseSync(prodDbPath, {readOnly:true});
      try {
        const fkCheck = prodDb.prepare('PRAGMA foreign_key_check;').all() as any[];
        assert.equal(fkCheck.length, 0, `Expected 0 FK violations, found: ${JSON.stringify(fkCheck)}`);
      } finally {
        prodDb.close();
      }
    });

    test('1.3: Production DB is unpopulated of seeded mock sources', () => {
      const prodDb = new DatabaseSync(prodDbPath, {readOnly:true});
      try {
        const mockSources = (prodDb.prepare("SELECT count(*) as c FROM sources WHERE name IN ('Integration Sheet 07', 'Limits & Continuity Practice', 'JEE Advanced 2025 Paper');").get() as any).c;
        assert.equal(mockSources, 0, `Expected 0 mock sources, found ${mockSources}`);
      } finally {
        prodDb.close();
      }
    });

    test('1.4: 100% of production sources are assigned to valid subjects (0 unassigned)', () => {
      const prodDb = new DatabaseSync(prodDbPath, {readOnly:true});
      try {
        const unassigned = (prodDb.prepare("SELECT count(*) as c FROM sources WHERE subject_id IS NULL OR subject_id = '';").get() as any).c;
        assert.equal(unassigned, 0, 'Found unassigned sources in monograph.db');

        // Check each source references an existing subject
        const invalidFk = (prodDb.prepare(`
          SELECT count(*) as c FROM sources s
          LEFT JOIN subjects sub ON sub.id = s.subject_id
          WHERE sub.id IS NULL;
        `).get() as any).c;
        assert.equal(invalidFk, 0, 'Sources point to non-existent subject_ids');
      } finally {
        prodDb.close();
      }
    });

    test('1.5: Backup files exist for safe recovery', () => {
      const backupPath = path.resolve(process.cwd(), 'monograph.db.bak');
      assert.ok(fs.existsSync(backupPath), 'monograph.db.bak should exist as backup');
      const backupStat = fs.statSync(backupPath);
      assert.ok(backupStat.size > 0, 'monograph.db.bak must not be empty');
    });
  });

  // =========================================================================
  // SUITE 2: Cold-Start Migration & Schema Evolution on Isolated Databases
  // =========================================================================
  describe('Suite 2: Database Migration, Schema Evolution & Idempotency', () => {
    test('2.1: Cold migration on legacy database schema preserves all data and backfills', () => {
      const legacyPath = path.join(os.tmpdir(), `legacy_${crypto.randomUUID()}.db`);
      const legacyDb = new DatabaseSync(legacyPath);
      legacyDb.exec('PRAGMA foreign_keys = ON;');

      // Create pure legacy schema WITHOUT subjects table and WITHOUT subject_id column on sources
      legacyDb.exec(`
        CREATE TABLE sources (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          type TEXT NOT NULL DEFAULT 'sheet',
          reference TEXT,
          created_at TEXT NOT NULL,
          metadata TEXT
        );
        CREATE TABLE problems (
          id TEXT PRIMARY KEY,
          source_id TEXT NOT NULL,
          number TEXT NOT NULL,
          title TEXT,
          reference TEXT,
          created_at TEXT NOT NULL,
          metadata TEXT,
          FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE
        );
        CREATE TABLE attempts (
          id TEXT PRIMARY KEY,
          problem_id TEXT NOT NULL,
          created_at TEXT NOT NULL,
          finished_at TEXT,
          result TEXT NOT NULL,
          notes TEXT,
          FOREIGN KEY (problem_id) REFERENCES problems(id) ON DELETE CASCADE
        );
      `);

      const now = new Date().toISOString();
      legacyDb.prepare("INSERT INTO sources VALUES ('s1', 'Old Math Sheet', 'sheet', 'Ref 1', ?, NULL)").run(now);
      legacyDb.prepare("INSERT INTO sources VALUES ('s2', 'Old Physics Sheet', 'sheet', 'Ref 2', ?, NULL)").run(now);
      legacyDb.prepare("INSERT INTO problems VALUES ('p1', 's1', '01', 'Problem 1', NULL, ?, NULL)").run(now);
      legacyDb.prepare("INSERT INTO attempts VALUES ('a1', 'p1', ?, ?, 'solved', 'legacy note')").run(now, now);
      legacyDb.close();

      // Now run initDatabase on this legacy database
      const migratedDb = initDatabase(legacyPath);
      try {
        // Verify subjects table exists and starts unpopulated
        const subjects = migratedDb.prepare('SELECT * FROM subjects').all() as any[];
        assert.equal(subjects.length, 0, 'Database starts clean without mock subjects');

        // Verify subject_id column was added to sources
        const sources = migratedDb.prepare('SELECT * FROM sources').all() as any[];
        assert.equal(sources.length, 2);
        assert.ok('subject_id' in sources[0], 'subject_id column was added');

        // Verify practice_logs table and attempts.log_id column exist
        const practiceLogsTable = migratedDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='practice_logs'").get();
        assert.ok(practiceLogsTable, 'practice_logs table was created');

        const attemptCols = (migratedDb.prepare('PRAGMA table_info(attempts)').all() as any[]).map(c => c.name);
        assert.ok(attemptCols.includes('log_id'), 'attempts.log_id column exists');

        // Verify problem and attempt survived completely
        const problems = migratedDb.prepare('SELECT * FROM problems').all() as any[];
        assert.equal(problems.length, 1);
        assert.equal(problems[0].id, 'p1');

        const attempts = migratedDb.prepare('SELECT * FROM attempts').all() as any[];
        assert.equal(attempts.length, 1);
        assert.equal(attempts[0].id, 'a1');
      } finally {
        migratedDb.close();
        for (const ext of ['', '-wal', '-shm']) {
          try { fs.unlinkSync(`${legacyPath}${ext}`); } catch {}
        }
      }
    });

    test('2.2: Idempotent migration calls (running initDatabase 5 times) cause 0 errors and 0 duplicate rows', () => {
      const idemPath = path.join(os.tmpdir(), `idem_${crypto.randomUUID()}.db`);
      for (let i = 0; i < 5; i++) {
        const db = initDatabase(idemPath);
        const subCount = (db.prepare('SELECT count(*) as c FROM subjects').get() as any).c;
        assert.equal(subCount, 0, `Iteration ${i + 1}: Expected clean 0 subjects, got ${subCount}`);
        db.close();
      }
      for (const ext of ['', '-wal', '-shm']) {
        try { fs.unlinkSync(`${idemPath}${ext}`); } catch {}
      }
    });

    test('2.3: Foreign Key enforcement rejects invalid subject_id when inserting source', () => {
      const fkPath = path.join(os.tmpdir(), `fk_${crypto.randomUUID()}.db`);
      const db = initDatabase(fkPath);
      try {
        assert.throws(() => {
          db.prepare(`
            INSERT INTO sources (id, name, type, created_at, subject_id)
            VALUES ('s-invalid', 'Invalid Source', 'sheet', ?, 'non-existent-sub-id')
          `).run(new Date().toISOString());
        }, /FOREIGN KEY constraint failed/);
      } finally {
        db.close();
        for (const ext of ['', '-wal', '-shm']) {
          try { fs.unlinkSync(`${fkPath}${ext}`); } catch {}
        }
      }
    });

    test('2.4: SQLite ON DELETE SET NULL works when subject is deleted directly in SQL', () => {
      const onDelPath = path.join(os.tmpdir(), `ondel_${crypto.randomUUID()}.db`);
      const db = initDatabase(onDelPath);
      try {
        const subId = crypto.randomUUID();
        const srcId = crypto.randomUUID();
        const now = new Date().toISOString();

        db.prepare('INSERT INTO subjects (id, name, created_at) VALUES (?, ?, ?)').run(subId, 'Temp Subject', now);
        db.prepare('INSERT INTO sources (id, name, type, created_at, subject_id) VALUES (?, ?, ?, ?, ?)').run(srcId, 'Temp Sheet', 'sheet', now, subId);

        // Verify source has subject_id
        const before = db.prepare('SELECT subject_id FROM sources WHERE id = ?').get(srcId) as any;
        assert.equal(before.subject_id, subId);

        // Delete subject directly via SQL
        db.prepare('DELETE FROM subjects WHERE id = ?').run(subId);

        // Verify sources.subject_id became NULL due to ON DELETE SET NULL
        const afterDel = db.prepare('SELECT subject_id FROM sources WHERE id = ?').get(srcId) as any;
        assert.equal(afterDel.subject_id, null);
      } finally {
        db.close();
        for (const ext of ['', '-wal', '-shm']) {
          try { fs.unlinkSync(`${onDelPath}${ext}`); } catch {}
        }
      }
    });
  });

  // =========================================================================
  // SUITE 3: Multi-Level Cascading & Hierarchy Reassignment
  // =========================================================================
  describe('Suite 3: Multi-Level Cascading & Reassignment Integrity', () => {
    test('3.1: Deep multi-tier hierarchy is fully preserved when sheet is reassigned between subjects', () => {
      // 1. Create two subjects
      const sub1 = subjectsService.createSubject({ name: `Topology_${crypto.randomUUID().slice(0, 6)}` });
      const sub2 = subjectsService.createSubject({ name: `Differential Geometry_${crypto.randomUUID().slice(0, 6)}` });

      // 2. Create sheet under sub1
      const sheet = sourcesService.createSource({ name: 'Manifolds Sheet 1', subject_id: sub1.id });

      // 3. Create problem under sheet
      const prob = problemsService.createProblem({ source_id: sheet.id, number: 'M01', title: 'Tangent Spaces' });

      // 4. Create attempt with heuristic tags and observation
      const att = attemptsService.createAttempt({
        problem_id: prob.id,
        result: 'solved',
        confidence: 5,
        time_seconds: 420,
        heuristic_tags: ['Vector Bundles', 'Charts'],
        meta_tags: ['Technique'],
        observation: { type: 'technique', content: 'Local coordinate chart change' }
      });

      // Verify initial state
      const initialProb = problemsService.getProblemById(prob.id);
      assert.equal(initialProb?.subject_id, sub1.id);
      assert.equal(initialProb?.subject_name, sub1.name);

      const initialSub1 = subjectsService.getSubjectById(sub1.id);
      assert.equal(initialSub1?.sources_count, 1);
      assert.equal(initialSub1?.problem_count, 1);
      assert.equal(initialSub1?.attempt_count, 1);
      assert.equal(initialSub1?.solve_rate, 100);

      // Reassign sheet to sub2
      const updated = sourcesService.updateSource(sheet.id, { subject_id: sub2.id });
      assert.equal(updated, true);

      // Verify sub1 has 0 sources now
      const sub1After = subjectsService.getSubjectById(sub1.id);
      assert.equal(sub1After?.sources_count, 0);
      assert.equal(sub1After?.problem_count, 0);
      assert.equal(sub1After?.attempt_count, 0);

      // Verify sub2 inherited sheet, problem, and attempts stats
      const sub2After = subjectsService.getSubjectById(sub2.id);
      assert.equal(sub2After?.sources_count, 1);
      assert.equal(sub2After?.problem_count, 1);
      assert.equal(sub2After?.attempt_count, 1);
      assert.equal(sub2After?.solve_rate, 100);

      // Verify problem spatial context updated to sub2
      const probAfter = problemsService.getProblemById(prob.id);
      assert.equal(probAfter?.subject_id, sub2.id);
      assert.equal(probAfter?.subject_name, sub2.name);
      assert.equal(probAfter?.attempts?.length, 1);
      assert.equal(probAfter?.attempts?.[0].heuristic_tags.length, 2);
    });

    test('3.2: Subject deletion reassigns child sheets to fallback subject and preserves all child data', () => {
      const subA = subjectsService.createSubject({ name: `Algebraic Number Theory_${crypto.randomUUID().slice(0, 6)}` });
      const subB = subjectsService.createSubject({ name: `Analytic Number Theory_${crypto.randomUUID().slice(0, 6)}` });

      const sheetA = sourcesService.createSource({ name: 'Class Field Theory', subject_id: subA.id });
      const probA = problemsService.createProblem({ source_id: sheetA.id, number: 'ANT-1' });
      attemptsService.createAttempt({ problem_id: probA.id, result: 'solved' });

      // Delete subA specifying subB as fallback
      const delSuccess = subjectsService.deleteSubject(subA.id, subB.id);
      assert.equal(delSuccess, true);

      // subA should no longer exist
      const subAFetched = subjectsService.getSubjectById(subA.id);
      assert.equal(subAFetched, null);

      // sheetA should now be assigned to subB
      const sheetAFetched = sourcesService.getSourceById(sheetA.id);
      assert.equal(sheetAFetched?.subject_id, subB.id);
      assert.equal(sheetAFetched?.subject_name, subB.name);

      // Problem and attempt still intact
      assert.equal(sheetAFetched?.problems.length, 1);
      assert.equal(sheetAFetched?.problems[0].id, probA.id);
    });

    test('3.3: Deleting a sheet cascades to delete problems, attempts, and observations without orphans', () => {
      const sub = subjectsService.createSubject({ name: `Fluid Mechanics_${crypto.randomUUID().slice(0, 6)}` });
      const sheet = sourcesService.createSource({ name: 'Navier-Stokes Sets', subject_id: sub.id });
      const prob = problemsService.createProblem({ source_id: sheet.id, number: 'FM-01' });
      const att = attemptsService.createAttempt({
        problem_id: prob.id,
        result: 'failed',
        observation: { type: 'mistake', content: 'Forgot convective term' }
      });

      // Delete sheet
      const delOk = sourcesService.deleteSource(sheet.id);
      assert.equal(delOk, true);

      // Verify sheet is gone
      assert.equal(sourcesService.getSourceById(sheet.id), null);

      // Verify problems cascaded
      assert.equal(problemsService.getProblemById(prob.id), null);

      // Verify attempts cascaded in DB
      const attRow = appDb.prepare('SELECT * FROM attempts WHERE id = ?').get(att.id);
      assert.equal(attRow, undefined);

      // Verify observations cascaded in DB
      const obsCount = (appDb.prepare('SELECT count(*) as c FROM observations WHERE problem_id = ?').get(prob.id) as any).c;
      assert.equal(obsCount, 0);

      // Verify subject stats decrement to 0
      const subStats = subjectsService.getSubjectById(sub.id);
      assert.equal(subStats?.sources_count, 0);
      assert.equal(subStats?.problem_count, 0);
      assert.equal(subStats?.attempt_count, 0);
    });
  });

  // =========================================================================
  // SUITE 4: Concurrency Stress-Testing (WAL Mode)
  // =========================================================================
  describe('Suite 4: Concurrency Stress-Testing in WAL Mode', () => {
    test('4.1: Rapid parallel creation of 30 unique subjects executes cleanly without database lock crashes', async () => {
      const creationPromises = Array.from({ length: 30 }).map(async (_, idx) => {
        return subjectsService.createSubject({
          name: `Concurrent Subject ${idx}_${crypto.randomUUID().slice(0, 8)}`,
          description: `Description for subject ${idx}`
        });
      });

      const results = await Promise.all(creationPromises);
      assert.equal(results.length, 30);
      const uniqueIds = new Set(results.map((r: any) => r.id));
      assert.equal(uniqueIds.size, 30);
    });

    test('4.2: Parallel attempt logging accurately accumulates solve counts and rates without race conditions', async () => {
      const sub = subjectsService.createSubject({ name: `Concurrency Stats ${crypto.randomUUID()}` });
      const sheet = sourcesService.createSource({ name: 'Concurrent Sheet', subject_id: sub.id });

      const prob1 = problemsService.createProblem({ source_id: sheet.id, number: 'C1' });
      const prob2 = problemsService.createProblem({ source_id: sheet.id, number: 'C2' });

      // Log 20 attempts concurrently: 10 solved, 10 failed
      const attemptPromises: Promise<any>[] = [];
      for (let i = 0; i < 10; i++) {
        attemptPromises.push(Promise.resolve().then(() => attemptsService.createAttempt({ problem_id: prob1.id, result: 'solved' })));
        attemptPromises.push(Promise.resolve().then(() => attemptsService.createAttempt({ problem_id: prob2.id, result: 'failed' })));
      }

      await Promise.all(attemptPromises);

      const stats = subjectsService.getSubjectById(sub.id);
      assert.equal(stats?.attempt_count, 20);
      assert.equal(stats?.solved_count, 10);
      assert.equal(stats?.solve_rate, 50);
    });
  });

  // =========================================================================
  // SUITE 5: Adversarial Inputs & Boundary Conditions
  // =========================================================================
  describe('Suite 5: Non-Standard Inputs, Unicode, Emojis & Extremes', () => {
    test('5.1: Unicode, Emojis, RTL, LaTeX, and Special Characters persist and retrieve intact', () => {
      const testCases = [
        {
          name: `🚀 Quantum Computing & Quantum Hall Effect 🌌 🔬_${crypto.randomUUID().slice(0, 6)}`,
          desc: 'Entanglement, Bell inequalities $\\langle \\psi | \\phi \\rangle$'
        },
        {
          name: `الرياضيات المتقدمة_${crypto.randomUUID().slice(0, 6)}`,
          desc: 'الجبر والهندسة التحليلية'
        },
        {
          name: `抽象代数学与模形式 (Abstract Algebra)_${crypto.randomUUID().slice(0, 6)}`,
          desc: '环、域、Galois 理论'
        },
        {
          name: `Gödel, Escher, Bach: München & Zürich_${crypto.randomUUID().slice(0, 6)}`,
          desc: 'Special accents: à, é, î, ö, ü, ñ, ç, ø, å'
        },
        {
          name: `<script>alert("xss")</script>_${crypto.randomUUID().slice(0, 6)}`,
          desc: 'XSS injection attempt string &lt;&gt;&amp;'
        },
        {
          name: `Math'; DROP TABLE subjects; --_${crypto.randomUUID().slice(0, 6)}`,
          desc: 'SQL injection payload'
        }
      ];

      for (const tc of testCases) {
        const sub = subjectsService.createSubject({ name: tc.name, description: tc.desc });
        assert.ok(sub.id);
        const retrieved = subjectsService.getSubjectById(sub.id);
        assert.equal(retrieved?.name, tc.name);
        assert.equal(retrieved?.description, tc.desc);
      }
    });

    test('5.2: Extreme string lengths and large metadata JSON objects store cleanly', () => {
      const longName = 'LongSub_' + crypto.randomUUID().slice(0, 6) + '_' + 'A'.repeat(500);
      const longDesc = 'B'.repeat(5000);
      const complexMetadata = {
        tags: Array.from({ length: 50 }, (_, i) => `tag_${i}`),
        nested: { a: { b: { c: { d: [1, 2, 3, 'deep'] } } } },
        flags: { enabled: true, priority: 999 }
      };

      const sub = subjectsService.createSubject({
        name: longName,
        description: longDesc,
        metadata: complexMetadata
      });

      const fetched = subjectsService.getSubjectById(sub.id);
      assert.equal(fetched?.name, longName);
      assert.equal(fetched?.description, longDesc);
      assert.deepEqual(JSON.parse(fetched?.metadata as string), complexMetadata);
    });

    test('5.3: Duplicate subject name triggers unique constraint error', () => {
      const name = `Unique_Name_${crypto.randomUUID()}`;
      subjectsService.createSubject({ name });

      assert.throws(() => {
        subjectsService.createSubject({ name });
      }, /UNIQUE constraint failed/);
    });

    test('5.4: Leading and trailing whitespace is trimmed properly', () => {
      const sub = subjectsService.createSubject({
        name: `   Functional Analysis_${crypto.randomUUID().slice(0, 6)}   `,
        description: '   Hilbert and Banach spaces   '
      });
      assert.ok(sub.name.startsWith('Functional Analysis'));
      assert.equal(sub.description, 'Hilbert and Banach spaces');
    });
  });

  // =========================================================================
  // SUITE 6: Edge Case Queries in Analytics (0 sheets, 0 attempts, edge ratios)
  // =========================================================================
  describe('Suite 6: Analytics Edge Cases (0 Sheets, 0 Attempts, Skips, Non-Existent IDs)', () => {
    test('6.1: Analytics on a Subject with 0 sheets returns zeroed metrics without division by zero', () => {
      const emptySub = subjectsService.createSubject({ name: `Zero Sheet Sub ${crypto.randomUUID()}` });
      const analytics = analyticsService.getAnalytics(undefined, emptySub.id);

      assert.equal(analytics.totalProblemsAttempted, 0);
      assert.equal(analytics.totalAttempts, 0);
      assert.equal(analytics.totalSolved, 0);
      assert.equal(analytics.totalPartial, 0);
      assert.equal(analytics.totalFailed, 0);
      assert.equal(analytics.totalSkipped, 0);
      assert.equal(analytics.solveRate, 0);
      assert.equal(analytics.recognitionRate, 0);
      assert.equal(analytics.independentSolveRate, 0);
      assert.equal(analytics.averageTimeSeconds, 0);
      assert.deepEqual(analytics.tagFriction, []);
      assert.deepEqual(analytics.commonMistakes, []);
      assert.deepEqual(analytics.commonTechniques, []);
      assert.deepEqual(analytics.mostUsedTags, []);
    });

    test('6.2: Analytics on a Subject with sheets but 0 problems returns clean zeroed metrics', () => {
      const sub = subjectsService.createSubject({ name: `Zero Prob Sub ${crypto.randomUUID()}` });
      sourcesService.createSource({ name: 'Empty Sheet', subject_id: sub.id });

      const analytics = analyticsService.getAnalytics(undefined, sub.id);
      assert.equal(analytics.totalAttempts, 0);
      assert.equal(analytics.solveRate, 0);
      assert.deepEqual(analytics.tagFriction, []);
    });

    test('6.3: Analytics on a Subject with problems but 0 attempts returns clean zeroed metrics', () => {
      const sub = subjectsService.createSubject({ name: `Zero Attempt Sub ${crypto.randomUUID()}` });
      const sheet = sourcesService.createSource({ name: 'Problem Sheet', subject_id: sub.id });
      problemsService.createProblem({ source_id: sheet.id, number: 'Q1' });

      const analytics = analyticsService.getAnalytics(undefined, sub.id);
      assert.equal(analytics.totalProblemsAttempted, 0);
      assert.equal(analytics.totalAttempts, 0);
      assert.equal(analytics.solveRate, 0);
    });

    test('6.4: Analytics with 100% failed attempts reports solveRate 0 and 100% tag friction', () => {
      const sub = subjectsService.createSubject({ name: `Failed Sub ${crypto.randomUUID()}` });
      const sheet = sourcesService.createSource({ name: 'Fail Sheet', subject_id: sub.id });
      const prob = problemsService.createProblem({ source_id: sheet.id, number: 'Fail-01' });

      attemptsService.createAttempt({
        problem_id: prob.id,
        result: 'failed',
        heuristic_tags: ['difficult tag']
      });

      const analytics = analyticsService.getAnalytics(undefined, sub.id);
      assert.equal(analytics.totalAttempts, 1);
      assert.equal(analytics.totalFailed, 1);
      assert.equal(analytics.solveRate, 0);
      assert.equal(analytics.tagFriction.length, 1);
      assert.equal(analytics.tagFriction[0].tagName, 'difficult tag');
      assert.equal(analytics.tagFriction[0].failureRate, 100);
    });

    test('6.5: Analytics with ONLY skipped attempts handles completedAttempts=0 safely without NaN', () => {
      const sub = subjectsService.createSubject({ name: `Skipped Sub ${crypto.randomUUID()}` });
      const sheet = sourcesService.createSource({ name: 'Skip Sheet', subject_id: sub.id });
      const prob = problemsService.createProblem({ source_id: sheet.id, number: 'Skip-01' });

      attemptsService.createAttempt({
        problem_id: prob.id,
        result: 'skipped'
      });

      const analytics = analyticsService.getAnalytics(undefined, sub.id);
      assert.equal(analytics.totalAttempts, 1);
      assert.equal(analytics.totalSkipped, 1);
      assert.equal(analytics.solveRate, 0);
      assert.ok(!Number.isNaN(analytics.solveRate), 'solveRate must not be NaN');
    });

    test('6.6: Analytics on non-existent subject ID returns zeros without throwing exception', () => {
      const analytics = analyticsService.getAnalytics(undefined, 'non-existent-uuid-999');
      assert.equal(analytics.totalAttempts, 0);
      assert.equal(analytics.solveRate, 0);
    });

    test('6.7: Analytics aggregates unicode qualitative observations under scoped subject', () => {
      const sub = subjectsService.createSubject({ name: `Qualitative Sub ${crypto.randomUUID()}` });
      const sheet = sourcesService.createSource({ name: 'Observation Sheet', subject_id: sub.id });
      const prob = problemsService.createProblem({ source_id: sheet.id, number: 'OBS-1' });

      attemptsService.createAttempt({
        problem_id: prob.id,
        result: 'failed',
        observation: { type: 'mistake', content: '❌ Misapplied Cauchy-Schwarz inequality: $\\langle u, v \\rangle^2 \\le \\|u\\|^2 \\|v\\|^2$' }
      });
      attemptsService.createAttempt({
        problem_id: prob.id,
        result: 'solved',
        observation: { type: 'technique', content: '💡 Used Gram-Schmidt orthogonalization $\\{e_i\\}$' }
      });

      const analytics = analyticsService.getAnalytics(undefined, sub.id);
      assert.equal(analytics.commonMistakes.length, 1);
      assert.ok(analytics.commonMistakes[0].content.includes('Cauchy-Schwarz'));
      assert.equal(analytics.commonTechniques.length, 1);
      assert.ok(analytics.commonTechniques[0].content.includes('Gram-Schmidt'));
    });
  });

  // =========================================================================
  // SUITE 7: REST API Direct Endpoint Verification against src/server/server.ts
  // =========================================================================
  describe('Suite 7: REST API Direct Endpoints on Isolated Production Server', () => {
    test('7.1: GET /api/subjects returns array of subjects with stats', async () => {
      const res = await fetch(`${baseUrl}/api/subjects`);
      assert.equal(res.status, 200);
      const subjects = await res.json();
      assert.ok(Array.isArray(subjects));
      assert.ok(subjects.length >= 3);
      for (const s of subjects) {
        assert.ok(s.id);
        assert.ok(s.name);
        assert.ok(typeof s.sources_count === 'number');
        assert.ok(typeof s.solve_rate === 'number');
      }
    });

    test('7.2: POST /api/subjects creates subject and validates required name', async () => {
      // 1. Missing name -> 400
      const badRes = await fetch(`${baseUrl}/api/subjects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '   ' })
      });
      assert.equal(badRes.status, 400);

      // 2. Valid creation
      const name = `API Sub ${crypto.randomUUID()}`;
      const createRes = await fetch(`${baseUrl}/api/subjects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color: 'emerald', icon: 'atom' })
      });
      assert.equal(createRes.status, 201);
      const created = await createRes.json();
      assert.equal(created.name, name);
      assert.equal(created.color, 'emerald');
      assert.equal(created.icon, 'atom');

      // 3. GET /api/subjects/:id
      const getRes = await fetch(`${baseUrl}/api/subjects/${created.id}`);
      assert.equal(getRes.status, 200);
      const fetched = await getRes.json();
      assert.equal(fetched.id, created.id);
      assert.deepEqual(fetched.sources, []);
    });

    test('7.3: PUT /api/subjects/:id updates fields', async () => {
      const sub = subjectsService.createSubject({ name: `To Update ${crypto.randomUUID()}` });
      const putRes = await fetch(`${baseUrl}/api/subjects/${sub.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: 'New description', color: 'rose' })
      });
      assert.equal(putRes.status, 200);

      const fetched = subjectsService.getSubjectById(sub.id);
      assert.equal(fetched?.description, 'New description');
      assert.equal(fetched?.color, 'rose');
    });

    test('7.4: DELETE /api/subjects/:id removes subject and reassigns sheets', async () => {
      const subToDel = subjectsService.createSubject({ name: `To Delete ${crypto.randomUUID()}` });
      const fallbackSub = subjectsService.createSubject({ name: `Fallback ${crypto.randomUUID()}` });
      const sheet = sourcesService.createSource({ name: 'Orphan Sheet', subject_id: subToDel.id });

      const delRes = await fetch(`${baseUrl}/api/subjects/${subToDel.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fallbackSubjectId: fallbackSub.id })
      });
      assert.equal(delRes.status, 200);

      // Sheet reallocated
      const sheetFetched = sourcesService.getSourceById(sheet.id);
      assert.equal(sheetFetched?.subject_id, fallbackSub.id);
    });

    test('7.5: GET /api/sources?subjectId=... filters sources by subject', async () => {
      const sub = subjectsService.createSubject({ name: `Filter Test ${crypto.randomUUID()}` });
      const s1 = sourcesService.createSource({ name: 'Sheet A', subject_id: sub.id });
      const s2 = sourcesService.createSource({ name: 'Sheet B', subject_id: sub.id });

      const res = await fetch(`${baseUrl}/api/sources?subjectId=${sub.id}`);
      assert.equal(res.status, 200);
      const sources = await res.json();
      assert.equal(sources.length, 2);
      const ids = sources.map((s: any) => s.id);
      assert.ok(ids.includes(s1.id));
      assert.ok(ids.includes(s2.id));
    });

    test('7.6: GET /api/analytics?subjectId=... returns scoped analytics', async () => {
      const sub = subjectsService.createSubject({ name: `Analytics API Sub ${crypto.randomUUID()}` });
      const sheet = sourcesService.createSource({ name: 'Analytics API Sheet', subject_id: sub.id });
      const prob = problemsService.createProblem({ source_id: sheet.id, number: 'API-1' });

      attemptsService.createAttempt({ problem_id: prob.id, result: 'solved', time_seconds: 180 });

      const res = await fetch(`${baseUrl}/api/analytics?subjectId=${sub.id}`);
      assert.equal(res.status, 200);
      const analytics = await res.json();
      assert.equal(analytics.totalProblemsAttempted, 1);
      assert.equal(analytics.totalSolved, 1);
      assert.equal(analytics.solveRate, 100);
    });
  });

  // =========================================================================
  // SUITE 8: Spatial Context (Breadcrumbs) & Multi-Resource Aggregation Math
  // =========================================================================
  describe('Suite 8: Spatial Context (Breadcrumbs) & Complex Aggregation Math', () => {
    test('8.1: GET /api/sources/:id and GET /api/problems/:id expose subject_id and subject_name', async () => {
      const sub = subjectsService.createSubject({ name: `Spatial Math ${crypto.randomUUID()}` });
      const sheet = sourcesService.createSource({ name: 'Spatial Sheet', subject_id: sub.id });
      const prob = problemsService.createProblem({ source_id: sheet.id, number: 'SP-01', title: 'Spatial Problem' });

      // Check Sheet API
      const sheetRes = await fetch(`${baseUrl}/api/sources/${sheet.id}`);
      assert.equal(sheetRes.status, 200);
      const sheetData = await sheetRes.json();
      assert.equal(sheetData.subject_id, sub.id);
      assert.equal(sheetData.subject_name, sub.name);

      // Check Problem API
      const probRes = await fetch(`${baseUrl}/api/problems/${prob.id}`);
      assert.equal(probRes.status, 200);
      const probData = await probRes.json();
      assert.equal(probData.subject_id, sub.id);
      assert.equal(probData.subject_name, sub.name);
      assert.equal(probData.source_name, sheet.name);
    });

    test('8.2: Complex multi-sheet multi-problem aggregation arithmetic is verified', () => {
      const sub = subjectsService.createSubject({ name: `Math Aggregation ${crypto.randomUUID()}` });

      // Sheet 1: 2 problems (P1: 2 solved attempts, P2: 1 failed attempt) -> 3 attempts total, 2 solved = 67%
      const sheet1 = sourcesService.createSource({ name: 'Sheet 1', subject_id: sub.id });
      const p1 = problemsService.createProblem({ source_id: sheet1.id, number: 'P1' });
      const p2 = problemsService.createProblem({ source_id: sheet1.id, number: 'P2' });
      attemptsService.createAttempt({ problem_id: p1.id, result: 'solved' });
      attemptsService.createAttempt({ problem_id: p1.id, result: 'solved' });
      attemptsService.createAttempt({ problem_id: p2.id, result: 'failed' });

      // Sheet 2: 1 problem (P3: 0 attempts) -> 0 attempts, 0%
      const sheet2 = sourcesService.createSource({ name: 'Sheet 2', subject_id: sub.id });
      problemsService.createProblem({ source_id: sheet2.id, number: 'P3' });

      // Verify Sheet 1
      const s1Fetched = sourcesService.getAllSources(sub.id).find((s: any) => s.id === sheet1.id);
      assert.ok(s1Fetched);
      assert.equal(s1Fetched.problem_count, 2);
      assert.equal(s1Fetched.attempt_count, 3);
      assert.equal(s1Fetched.solved_count, 2);
      assert.equal(s1Fetched.solve_rate, 67);

      // Verify Sheet 2
      const s2Fetched = sourcesService.getAllSources(sub.id).find((s: any) => s.id === sheet2.id);
      assert.ok(s2Fetched);
      assert.equal(s2Fetched.problem_count, 1);
      assert.equal(s2Fetched.attempt_count, 0);
      assert.equal(s2Fetched.solved_count, 0);
      assert.equal(s2Fetched.solve_rate, 0);

      // Verify Subject Aggregate Stats
      const subFetched = subjectsService.getSubjectById(sub.id);
      assert.ok(subFetched);
      assert.equal(subFetched.sources_count, 2);
      assert.equal(subFetched.problem_count, 3);
      assert.equal(subFetched.attempt_count, 3);
      assert.equal(subFetched.solved_count, 2);
      assert.equal(subFetched.solve_rate, 67);

      // Verify getAllSubjects() matches getSubjectById()
      const allSubs = subjectsService.getAllSubjects();
      const subInAll = allSubs.find((s: any) => s.id === sub.id);
      assert.ok(subInAll);
      assert.equal(subInAll.sources_count, 2);
      assert.equal(subInAll.problem_count, 3);
      assert.equal(subInAll.attempt_count, 3);
      assert.equal(subInAll.solved_count, 2);
      assert.equal(subInAll.solve_rate, 67);
    });

    test('8.3: Null spatial context (orphaned sheets) handles gracefully without crashing', () => {
      // Create isolated DB with just 1 subject, assign sheet, then delete that subject
      const orphanPath = path.join(os.tmpdir(), `orphan_${crypto.randomUUID()}.db`);
      const orphanDb = initDatabase(orphanPath);
      try {
        // Clear all subjects in this temp db
        orphanDb.prepare('DELETE FROM subjects').run();
        const subId = crypto.randomUUID();
        orphanDb.prepare('INSERT INTO subjects (id, name, created_at) VALUES (?, ?, ?)').run(subId, 'Sole Subject', new Date().toISOString());

        const sheetId = crypto.randomUUID();
        orphanDb.prepare('INSERT INTO sources (id, name, type, created_at, subject_id) VALUES (?, ?, ?, ?, ?)').run(sheetId, 'Sole Sheet', 'sheet', new Date().toISOString(), subId);

        const probId = crypto.randomUUID();
        orphanDb.prepare('INSERT INTO problems (id, source_id, number, created_at) VALUES (?, ?, ?, ?)').run(probId, sheetId, 'Q1', new Date().toISOString());

        // Delete Sole Subject directly
        orphanDb.prepare('DELETE FROM subjects WHERE id = ?').run(subId);

        // Sources subject_id is now NULL
        const sheet = orphanDb.prepare('SELECT * FROM sources WHERE id = ?').get(sheetId) as any;
        assert.equal(sheet.subject_id, null);

        // Query problems with LEFT JOIN subjects
        const prob = orphanDb.prepare(`
          SELECT p.*, s.name as source_name, s.subject_id, sub.name as subject_name
          FROM problems p
          JOIN sources s ON s.id = p.source_id
          LEFT JOIN subjects sub ON sub.id = s.subject_id
          WHERE p.id = ?
        `).get(probId) as any;
        assert.equal(prob.subject_id, null);
        assert.equal(prob.subject_name, null);
        assert.equal(prob.source_name, 'Sole Sheet');
      } finally {
        orphanDb.close();
        for (const ext of ['', '-wal', '-shm']) {
          try { fs.unlinkSync(`${orphanPath}${ext}`); } catch {}
        }
      }
    });
  });
});
