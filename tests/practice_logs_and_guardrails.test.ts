import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import { DatabaseSync } from 'node:sqlite';

describe('Stateful Practice Logs & Data Immutability Guardrails', () => {
  let tempDir: string;
  let isolatedDbPath: string;
  let testDb: DatabaseSync;
  let initDatabase: any;
  let setDb: any;
  let closeDatabase: any;
  let practiceLogsService: any;
  let sourcesService: any;
  let problemsService: any;
  let attemptsService: any;
  let subjectsService: any;
  let guardrails: any;
  let server: http.Server;
  let baseUrl: string;

  before(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'monograph-logs-test-'));
    isolatedDbPath = path.join(tempDir, 'isolated_test.db');
    process.env.DB_PATH = isolatedDbPath;
    process.env.NODE_ENV = 'test';

    const dbModule = await import('../src/server/db.js');
    initDatabase = dbModule.initDatabase;
    setDb = dbModule.setDb;
    closeDatabase = dbModule.closeDatabase;

    testDb = initDatabase(isolatedDbPath);
    setDb(testDb);

    guardrails = await import('../src/server/guardrails.js');
    practiceLogsService = await import('../src/server/services/practiceLogsService.js');
    sourcesService = await import('../src/server/services/sourcesService.js');
    problemsService = await import('../src/server/services/problemsService.js');
    attemptsService = await import('../src/server/services/attemptsService.js');
    subjectsService = await import('../src/server/services/subjectsService.js');

    const serverModule = await import('../src/server/server.js');
    await new Promise<void>((resolve) => {
      server = serverModule.app.listen(0, () => {
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
    closeDatabase();
    setDb(null);
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  describe('Suite 1: Data Guardrails & Immutability Enforcement', () => {
    it('1.1: Guardrail detects production database and throws if a test attempts to use it', () => {
      const prodPath = path.resolve(process.cwd(), 'monograph.db');
      assert.throws(
        () => guardrails.assertTestIsolation(prodPath),
        /\[GUARDRAIL VIOLATION\] Test attempted to open production database/
      );
    });

    it('1.2: Guardrail blocks unapproved agent data mutation on production database', () => {
      const prodPath = path.resolve(process.cwd(), 'monograph.db');
      delete process.env.ALLOW_PROD_DATA_MUTATION;
      assert.throws(
        () => guardrails.assertAgentDataMutationAllowed(prodPath, 'Direct Agent Insert'),
        /\[GUARDRAIL VIOLATION\] Unauthorized agent data mutation on production database/
      );
    });

    it('1.3: Production monograph.db passes integrity and foreign key checks with 0 mock rows', () => {
      const prodDbPath = path.resolve(process.cwd(), 'monograph.db');
      assert.ok(fs.existsSync(prodDbPath), 'monograph.db must exist');
      const prodDb = new DatabaseSync(prodDbPath);
      try {
        const integrity = prodDb.prepare('PRAGMA integrity_check;').all() as any[];
        assert.equal(integrity[0].integrity_check, 'ok');

        const fk = prodDb.prepare('PRAGMA foreign_key_check;').all() as any[];
        assert.equal(fk.length, 0);

        // Verify unpopulated of mock data
        const mockSourcesCount = (prodDb.prepare("SELECT COUNT(*) as c FROM sources WHERE name IN ('Integration Sheet 07', 'Limits & Continuity Practice', 'JEE Advanced 2025 Paper');").get() as any).c;
        assert.equal(mockSourcesCount, 0, 'Production DB should have 0 mock sources');
      } finally {
        prodDb.close();
      }
    });
  });

  describe('Suite 2: Stateful Practice Logs Lifecycle & Persistence', () => {
    let testSubject: any;
    let testSource: any;
    let prob1: any;
    let prob2: any;
    let logSession: any;

    before(() => {
      testSubject = subjectsService.createSubject({
        name: 'Calculus Practice ' + crypto.randomUUID().slice(0, 6),
      });

      testSource = sourcesService.createSource({
        name: 'Taylor Series Sheet 01',
        subject_id: testSubject.id,
        type: 'sheet',
      });

      prob1 = problemsService.createProblem({
        source_id: testSource.id,
        number: '01',
        title: 'Maclaurin Expansion of Sin(x)',
      });

      prob2 = problemsService.createProblem({
        source_id: testSource.id,
        number: '02',
        title: 'Lagrange Remainder Bound',
      });
    });

    it('2.1: Creates a practice log for a sheet with initial in_progress status and default problem', () => {
      logSession = practiceLogsService.createLog({
        source_id: testSource.id,
      });

      assert.ok(logSession.id, 'Log has an ID');
      assert.equal(logSession.source_id, testSource.id);
      assert.equal(logSession.status, 'in_progress');
      assert.equal(logSession.time_seconds, 0);
      assert.equal(logSession.current_problem_id, prob1.id);
      assert.equal(logSession.current_problem_number, '01');
    });

    it('2.2: getActiveLog retrieves the in-progress log session', () => {
      const active = practiceLogsService.getActiveLog(testSource.id);
      assert.ok(active);
      assert.equal(active.id, logSession.id);
      assert.equal(active.status, 'in_progress');
    });

    it('2.3: Updates log state (elapsed timer, draft notes, and active problem)', () => {
      const updated = practiceLogsService.updateLog(logSession.id, {
        time_seconds: 145,
        notes_draft: 'Remember: differentiate 4 times for error bound',
        current_problem_id: prob2.id,
      });
      assert.ok(updated);

      const refreshed = practiceLogsService.getLogById(logSession.id);
      assert.equal(refreshed.time_seconds, 145);
      assert.equal(refreshed.notes_draft, 'Remember: differentiate 4 times for error bound');
      assert.equal(refreshed.current_problem_id, prob2.id);
      assert.equal(refreshed.current_problem_number, '02');
    });

    it('2.4: Associates attempts to the practice log via log_id and computes session stats', () => {
      const att1 = attemptsService.createAttempt({
        problem_id: prob1.id,
        result: 'solved',
        time_seconds: 60,
        notes: 'Clean series derivation',
        log_id: logSession.id,
      });
      assert.equal(att1.log_id, logSession.id);

      const att2 = attemptsService.createAttempt({
        problem_id: prob2.id,
        result: 'partial',
        time_seconds: 85,
        notes: 'Forgot factorial factor in remainder',
        log_id: logSession.id,
      });
      assert.equal(att2.log_id, logSession.id);

      const refreshed = practiceLogsService.getLogById(logSession.id);
      assert.equal(refreshed.attempts_count, 2, 'Session has 2 attempts');
      assert.equal(refreshed.solved_count, 1, 'Session has 1 solved attempt');
      assert.equal(refreshed.attempts.length, 2, 'Detailed attempts list returned');
      assert.equal(refreshed.attempts[0].problem_number, '01');
      assert.equal(refreshed.attempts[1].problem_number, '02');
    });

    it('2.5: Completes practice log session and records completed_at timestamp', () => {
      const ok = practiceLogsService.completeLog(logSession.id, { time_seconds: 240 });
      assert.ok(ok);

      const completed = practiceLogsService.getLogById(logSession.id);
      assert.equal(completed.status, 'completed');
      assert.equal(completed.time_seconds, 240);
      assert.ok(completed.completed_at);

      // getActiveLog should now return null for this sheet
      const active = practiceLogsService.getActiveLog(testSource.id);
      assert.equal(active, null);
    });

    it('2.6: Deleting a log session retains individual problem attempts safely (ON DELETE SET NULL)', () => {
      const deleted = practiceLogsService.deleteLog(logSession.id);
      assert.ok(deleted);

      // Verify attempts still exist and log_id is set to null
      const attempts = attemptsService.getRecentAttempts(10);
      const prob1Attempt = attempts.find((a: any) => a.problem_id === prob1.id);
      assert.ok(prob1Attempt, 'Problem attempt must be preserved');
      assert.equal(prob1Attempt.log_id, null, 'log_id safely unlinked');
    });
  });

  describe('Suite 3: REST API Endpoints for Practice Logs', () => {
    let sheetId: string;

    before(async () => {
      const subRes = await fetch(`${baseUrl}/api/subjects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Physics Notebook ' + crypto.randomUUID().slice(0, 6) }),
      });
      const sub = await subRes.json();

      const srcRes = await fetch(`${baseUrl}/api/sources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Optics Problem Set', subject_id: sub.id }),
      });
      const src = await srcRes.json();
      sheetId = src.id;

      await fetch(`${baseUrl}/api/problems`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_id: sheetId, number: '01', title: 'Snell Law' }),
      });
    });

    it('3.1: POST /api/logs creates a practice log and GET /api/logs/active returns it', async () => {
      const res = await fetch(`${baseUrl}/api/logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_id: sheetId }),
      });
      assert.equal(res.status, 201);
      const log = await res.json();
      assert.ok(log.id);
      assert.equal(log.status, 'in_progress');

      const activeRes = await fetch(`${baseUrl}/api/logs/active?sourceId=${sheetId}`);
      assert.equal(activeRes.status, 200);
      const active = await activeRes.json();
      assert.equal(active.id, log.id);
    });

    it('3.2: PUT /api/logs/:id updates timer and draft notes', async () => {
      const activeRes = await fetch(`${baseUrl}/api/logs/active?sourceId=${sheetId}`);
      const active = await activeRes.json();

      const putRes = await fetch(`${baseUrl}/api/logs/${active.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ time_seconds: 90, notes_draft: 'Critical angle calculation' }),
      });
      assert.equal(putRes.status, 200);
      const result = await putRes.json();
      assert.equal(result.log.time_seconds, 90);
      assert.equal(result.log.notes_draft, 'Critical angle calculation');
    });

    it('3.3: POST /api/logs/:id/complete marks session completed', async () => {
      const activeRes = await fetch(`${baseUrl}/api/logs/active?sourceId=${sheetId}`);
      const active = await activeRes.json();

      const compRes = await fetch(`${baseUrl}/api/logs/${active.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ time_seconds: 180 }),
      });
      assert.equal(compRes.status, 200);
      const result = await compRes.json();
      assert.equal(result.log.status, 'completed');
      assert.equal(result.log.time_seconds, 180);
    });
  });
});
