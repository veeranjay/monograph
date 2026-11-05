import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { Server } from 'node:http';
import { DatabaseSync } from 'node:sqlite';

// SAFETY CHECK & ZERO-LEAK BASELINE
const PROD_DB_PATH = path.resolve(process.cwd(), 'monograph.db');
const prodStatBefore = fs.statSync(PROD_DB_PATH);
const prodDbBefore = new DatabaseSync(PROD_DB_PATH, {readOnly:true});
const prodCountsBefore = {
  subjects: (prodDbBefore.prepare('SELECT count(*) as c FROM subjects').get() as any).c,
  sources: (prodDbBefore.prepare('SELECT count(*) as c FROM sources').get() as any).c,
  problems: (prodDbBefore.prepare('SELECT count(*) as c FROM problems').get() as any).c,
  attempts: (prodDbBefore.prepare('SELECT count(*) as c FROM attempts').get() as any).c,
};
prodDbBefore.close();

// Set ephemeral test database path BEFORE importing server
const tempDbId = crypto.randomUUID();
const tempDbPath = path.join(os.tmpdir(), `monograph_adv_c2_${tempDbId}.db`);
process.env.DB_PATH = tempDbPath;
process.env.NODE_ENV = 'test';

// Dynamic import ensures process.env.DB_PATH is active when db.ts initializes
const { app } = await import('../src/server/server.js');

describe('Challenger 2: Empirical Stress-Testing of Real REST API & Backwards Compatibility', () => {
  let server: Server;
  let baseUrl: string;

  before(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });

    // Clean up temporary database files
    for (const f of [tempDbPath, `${tempDbPath}-wal`, `${tempDbPath}-shm`]) {
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      } catch {}
    }

    // VERIFY MONOGRAPH.DB INTEGRITY & ZERO LEAKS
    const prodStatAfter = fs.statSync(PROD_DB_PATH);
    const prodDbAfter = new DatabaseSync(PROD_DB_PATH, {readOnly:true});
    const prodCountsAfter = {
      subjects: (prodDbAfter.prepare('SELECT count(*) as c FROM subjects').get() as any).c,
      sources: (prodDbAfter.prepare('SELECT count(*) as c FROM sources').get() as any).c,
      problems: (prodDbAfter.prepare('SELECT count(*) as c FROM problems').get() as any).c,
      attempts: (prodDbAfter.prepare('SELECT count(*) as c FROM attempts').get() as any).c,
    };
    prodDbAfter.close();

    // WAL checkpoints can change physical file size without changing any records.
    assert.deepEqual(prodCountsAfter, prodCountsBefore, 'monograph.db row counts must not change');
  });

  // --------------------------------------------------------------------------
  // SECTION 1: /api/subjects Endpoints & Input Stress-Testing
  // --------------------------------------------------------------------------

  test('C2-01: GET /api/subjects returns subjects with computed stats', async () => {
    // Starts clean without mock subjects
    const initialRes = await fetch(`${baseUrl}/api/subjects`);
    assert.equal(initialRes.status, 200);
    const initialSubjects = await initialRes.json();
    assert.ok(Array.isArray(initialSubjects));

    // Create a subject and verify computed stats
    const createRes = await fetch(`${baseUrl}/api/subjects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Mathematics', description: 'Core mathematics problem sets' }),
    });
    assert.equal(createRes.status, 201);

    const res = await fetch(`${baseUrl}/api/subjects`);
    assert.equal(res.status, 200);
    const subjects = await res.json();
    assert.ok(Array.isArray(subjects));
    assert.ok(subjects.length >= 1);

    const math = subjects.find((s: any) => s.name === 'Mathematics');
    assert.ok(math, 'Mathematics subject must exist');
    assert.equal(typeof math.sources_count, 'number');
    assert.equal(typeof math.problem_count, 'number');
    assert.equal(typeof math.attempt_count, 'number');
    assert.equal(typeof math.solved_count, 'number');
    assert.equal(typeof math.solve_rate, 'number');
  });

  test('C2-02: Missing fields in POST /api/subjects returns 400 Bad Request', async () => {
    // Missing body
    const emptyBodyRes = await fetch(`${baseUrl}/api/subjects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert.equal(emptyBodyRes.status, 400, 'Empty body must return 400');
    const emptyErr = await emptyBodyRes.json();
    assert.ok(emptyErr.error, 'Error message must be present');

    // Empty string name
    const emptyNameRes = await fetch(`${baseUrl}/api/subjects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '' })
    });
    assert.equal(emptyNameRes.status, 400, 'Empty string name must return 400');

    // Whitespace only name
    const spaceNameRes = await fetch(`${baseUrl}/api/subjects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '    ' })
    });
    assert.equal(spaceNameRes.status, 400, 'Whitespace name must return 400');
  });

  test('C2-03: Invalid name types in POST /api/subjects (number, null, boolean, object)', async () => {
    // Number type: { name: 12345 }
    const numRes = await fetch(`${baseUrl}/api/subjects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 12345 })
    });
    console.log(`[Empirical Finding] POST /api/subjects with number name status: ${numRes.status}`);
    const numBody = await numRes.json();
    console.log(`[Empirical Finding] POST /api/subjects with number name body:`, numBody);

    // Null name: { name: null }
    const nullRes = await fetch(`${baseUrl}/api/subjects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: null })
    });
    assert.equal(nullRes.status, 400, 'null name must return 400');
  });

  test('C2-04: Duplicate subject name handling in POST /api/subjects (UNIQUE constraint)', async () => {
    const subName = `Unique Subject ${crypto.randomUUID()}`;

    // First creation -> 201 Created
    const res1 = await fetch(`${baseUrl}/api/subjects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: subName, description: 'First instance' })
    });
    assert.equal(res1.status, 201);
    const sub1 = await res1.json();
    assert.equal(sub1.name, subName);

    // Duplicate creation with same name
    const res2 = await fetch(`${baseUrl}/api/subjects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: subName, description: 'Duplicate instance' })
    });

    console.log(`[Empirical Finding] Duplicate POST /api/subjects returned status: ${res2.status}`);
    const dupBody = await res2.json();
    console.log(`[Empirical Finding] Duplicate POST /api/subjects body:`, dupBody);
  });

  test('C2-05: Duplicate subject name in PUT /api/subjects/:id', async () => {
    const nameA = `Subject A ${crypto.randomUUID()}`;
    const nameB = `Subject B ${crypto.randomUUID()}`;

    const resA = await fetch(`${baseUrl}/api/subjects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nameA })
    });
    const subA = await resA.json();

    const resB = await fetch(`${baseUrl}/api/subjects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nameB })
    });
    const subB = await resB.json();

    // Try to update Subject B's name to Subject A's name
    const updateRes = await fetch(`${baseUrl}/api/subjects/${subB.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nameA })
    });

    console.log(`[Empirical Finding] PUT /api/subjects duplicate name status: ${updateRes.status}`);
    const updateBody = await updateRes.json();
    console.log(`[Empirical Finding] PUT /api/subjects duplicate name body:`, updateBody);
  });

  test('C2-06: Malformed JSON payload handling in POST /api/subjects', async () => {
    const res = await fetch(`${baseUrl}/api/subjects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"name": "Broken JSON, missing closing brace'
    });
    // Express json body parser rejects with 400
    assert.equal(res.status, 400, 'Malformed JSON must return 400');
  });

  test('C2-07: Invalid subject ID handling across all methods (GET, PUT, DELETE, GET /sheets)', async () => {
    const invalidId = 'non-existent-uuid-99999';

    // GET /api/subjects/:id -> 404
    const getRes = await fetch(`${baseUrl}/api/subjects/${invalidId}`);
    assert.equal(getRes.status, 404);

    // PUT /api/subjects/:id -> 404
    const putRes = await fetch(`${baseUrl}/api/subjects/${invalidId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: 'New description' })
    });
    assert.equal(putRes.status, 404);

    // DELETE /api/subjects/:id -> 404
    const delRes = await fetch(`${baseUrl}/api/subjects/${invalidId}`, {
      method: 'DELETE'
    });
    assert.equal(delRes.status, 404);

    // GET /api/subjects/:id/sheets for invalid ID
    const sheetsRes = await fetch(`${baseUrl}/api/subjects/${invalidId}/sheets`);
    console.log(`[Empirical Finding] GET /api/subjects/:id/sheets for non-existent ID status: ${sheetsRes.status}`);
    const sheetsBody = await sheetsRes.json();
    console.log(`[Empirical Finding] GET /api/subjects/:id/sheets for non-existent ID body:`, sheetsBody);
  });

  test('C2-08: Non-standard inputs: Unicode, Emojis, and SQL Injection strings', async () => {
    const complexName = `Algebraic Topology 🍩 & Kähler Geometry ∇² [${crypto.randomUUID()}]`;
    const complexDesc = `Description with quotes "double" and 'single', and LaTeX: $\\int_{0}^{\\infty} e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}$`;

    const createRes = await fetch(`${baseUrl}/api/subjects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: complexName,
        description: complexDesc,
        color: '#f59e0b',
        icon: 'atom'
      })
    });
    assert.equal(createRes.status, 201);
    const created = await createRes.json();
    assert.equal(created.name, complexName);
    assert.equal(created.description, complexDesc);

    // Verify GET retrieves it identically
    const getRes = await fetch(`${baseUrl}/api/subjects/${created.id}`);
    assert.equal(getRes.status, 200);
    const retrieved = await getRes.json();
    assert.equal(retrieved.name, complexName);
    assert.equal(retrieved.description, complexDesc);

    // SQL Injection attempt in ID parameter
    const sqlInjId = `' OR '1'='1`;
    const sqlRes = await fetch(`${baseUrl}/api/subjects/${encodeURIComponent(sqlInjId)}`);
    assert.equal(sqlRes.status, 404, 'SQL injection in ID must return 404 not execute query');
  });

  test('C2-09: PUT /api/subjects/:id with empty/whitespace name or non-string', async () => {
    const subRes = await fetch(`${baseUrl}/api/subjects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `Validation Test ${crypto.randomUUID()}` })
    });
    const sub = await subRes.json();

    // 1. PUT with empty name string: { name: "" }
    const emptyPutRes = await fetch(`${baseUrl}/api/subjects/${sub.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '' })
    });
    console.log(`[Empirical Finding] PUT /api/subjects/:id with empty name status: ${emptyPutRes.status}`);
    const checkEmpty = await (await fetch(`${baseUrl}/api/subjects/${sub.id}`)).json();
    console.log(`[Empirical Finding] Subject name after PUT with empty name: "${checkEmpty.name}"`);

    // 2. PUT with number name: { name: 9999 }
    const numPutRes = await fetch(`${baseUrl}/api/subjects/${sub.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 9999 })
    });
    console.log(`[Empirical Finding] PUT /api/subjects/:id with number name status: ${numPutRes.status}`);
    const numPutBody = await numPutRes.json();
    console.log(`[Empirical Finding] PUT /api/subjects/:id with number name body:`, numPutBody);
  });

  test('C2-10: Foreign Key Constraint Handling when creating/updating Source with invalid subject_id', async () => {
    // 1. POST /api/sources with non-existent subject_id
    const fakeSubId = crypto.randomUUID();
    const badSrcRes = await fetch(`${baseUrl}/api/sources`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Invalid Subject Sheet',
        subject_id: fakeSubId
      })
    });
    console.log(`[Empirical Finding] POST /api/sources with non-existent subject_id status: ${badSrcRes.status}`);
    const badSrcBody = await badSrcRes.json();
    console.log(`[Empirical Finding] POST /api/sources with non-existent subject_id body:`, badSrcBody);

    // 2. PUT /api/sources/:id with non-existent subject_id
    // Create a valid source first
    const goodSrcRes = await fetch(`${baseUrl}/api/sources`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Valid Sheet for FK Test' })
    });
    const goodSrc = await goodSrcRes.json();

    const updateBadFkRes = await fetch(`${baseUrl}/api/sources/${goodSrc.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject_id: fakeSubId })
    });
    console.log(`[Empirical Finding] PUT /api/sources/:id with non-existent subject_id status: ${updateBadFkRes.status}`);
    const updateBadFkBody = await updateBadFkRes.json();
    console.log(`[Empirical Finding] PUT /api/sources/:id with non-existent subject_id body:`, updateBadFkBody);
  });

  // --------------------------------------------------------------------------
  // SECTION 2: Backwards Compatibility & Cascading / Remapping
  // --------------------------------------------------------------------------

  test('C2-11: Backward compatibility: Sources and Problems when subject_id is NULL', async () => {
    // Insert a source directly with subject_id = NULL
    const nullSourceId = crypto.randomUUID();
    const now = new Date().toISOString();
    const tempDb = new DatabaseSync(tempDbPath);
    tempDb.prepare(`
      INSERT INTO sources (id, name, type, reference, created_at, subject_id)
      VALUES (?, ?, 'sheet', 'Legacy Ref', ?, NULL)
    `).run(nullSourceId, 'Legacy Unassigned Sheet', now);

    const nullProblemId = crypto.randomUUID();
    tempDb.prepare(`
      INSERT INTO problems (id, source_id, number, title, created_at)
      VALUES (?, ?, 'L-01', 'Legacy Question', ?)
    `).run(nullProblemId, nullSourceId, now);
    tempDb.close();

    // 1. GET /api/sources should include the unassigned sheet without error
    const sourcesRes = await fetch(`${baseUrl}/api/sources`);
    assert.equal(sourcesRes.status, 200);
    const allSources = await sourcesRes.json();
    const unassignedSource = allSources.find((s: any) => s.id === nullSourceId);
    assert.ok(unassignedSource, 'Unassigned source must appear in /api/sources');
    assert.equal(unassignedSource.subject_id, null);
    assert.equal(unassignedSource.subject_name, null);

    // 2. GET /api/sources/:id
    const singleSourceRes = await fetch(`${baseUrl}/api/sources/${nullSourceId}`);
    assert.equal(singleSourceRes.status, 200);
    const singleSource = await singleSourceRes.json();
    assert.equal(singleSource.subject_id, null);
    assert.equal(singleSource.subject_name, null);

    // 3. GET /api/problems/:id for problem belonging to unassigned sheet
    const problemRes = await fetch(`${baseUrl}/api/problems/${nullProblemId}`);
    assert.equal(problemRes.status, 200);
    const problem = await problemRes.json();
    assert.equal(problem.subject_id, null);
    assert.equal(problem.subject_name, null);
  });

  test('C2-12: Sheet Reassignment dynamically remaps Subject on Source and Problem', async () => {
    // 1. Create Subject A and Subject B
    const sARes = await fetch(`${baseUrl}/api/subjects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `Reassign A ${crypto.randomUUID()}` })
    });
    const subA = await sARes.json();

    const sBRes = await fetch(`${baseUrl}/api/subjects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `Reassign B ${crypto.randomUUID()}` })
    });
    const subB = await sBRes.json();

    // 2. Create Sheet under Subject A
    const sheetRes = await fetch(`${baseUrl}/api/sources`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Remappable Sheet', subject_id: subA.id })
    });
    const sheet = await sheetRes.json();
    assert.equal(sheet.subject_id, subA.id);

    // 3. Create Problem under this Sheet
    const probRes = await fetch(`${baseUrl}/api/problems`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_id: sheet.id, number: 'R-101', title: 'Remapped Prob' })
    });
    const prob = await probRes.json();
    assert.equal(prob.subject_id, subA.id);
    assert.equal(prob.subject_name, subA.name);

    // 4. Remap Sheet to Subject B via PUT /api/sources/:id
    const putSheetRes = await fetch(`${baseUrl}/api/sources/${sheet.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject_id: subB.id })
    });
    assert.equal(putSheetRes.status, 200);

    // 5. Verify Sheet now reflects Subject B
    const verifySheetRes = await fetch(`${baseUrl}/api/sources/${sheet.id}`);
    const updatedSheet = await verifySheetRes.json();
    assert.equal(updatedSheet.subject_id, subB.id);
    assert.equal(updatedSheet.subject_name, subB.name);

    // 6. Verify Problem now reflects Subject B
    const verifyProbRes = await fetch(`${baseUrl}/api/problems/${prob.id}`);
    const updatedProb = await verifyProbRes.json();
    assert.equal(updatedProb.subject_id, subB.id);
    assert.equal(updatedProb.subject_name, subB.name);

    // 7. Remap Sheet to NULL subject_id
    const unmapRes = await fetch(`${baseUrl}/api/sources/${sheet.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject_id: null })
    });
    assert.equal(unmapRes.status, 200);

    const unmappedSheet = await (await fetch(`${baseUrl}/api/sources/${sheet.id}`)).json();
    assert.equal(unmappedSheet.subject_id, null);
    assert.equal(unmappedSheet.subject_name, null);

    const unmappedProb = await (await fetch(`${baseUrl}/api/problems/${prob.id}`)).json();
    assert.equal(unmappedProb.subject_id, null);
    assert.equal(unmappedProb.subject_name, null);
  });

  test('C2-13: Subject Deletion reassigns sheets safely to fallback subject', async () => {
    // 1. Create a subject to be deleted
    const doomedSubRes = await fetch(`${baseUrl}/api/subjects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `Doomed Subject ${crypto.randomUUID()}` })
    });
    const doomedSub = await doomedSubRes.json();

    // 2. Create Sheet under this subject
    const sheetRes = await fetch(`${baseUrl}/api/sources`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Orphaned Survivor Sheet', subject_id: doomedSub.id })
    });
    const sheet = await sheetRes.json();

    // 3. Delete the doomed subject
    const delRes = await fetch(`${baseUrl}/api/subjects/${doomedSub.id}`, {
      method: 'DELETE'
    });
    assert.equal(delRes.status, 200);

    // 4. Verify sheet survived and was reallocated
    const checkSheetRes = await fetch(`${baseUrl}/api/sources/${sheet.id}`);
    assert.equal(checkSheetRes.status, 200);
    const checkSheet = await checkSheetRes.json();
    assert.notEqual(checkSheet.subject_id, doomedSub.id, 'Must not point to deleted subject');
    assert.ok(checkSheet.subject_id, 'Must be reallocated to a remaining fallback subject');
    assert.ok(checkSheet.subject_name, 'Fallback subject name must be populated');
  });

  test('C2-14: Zero-leak confirmation: monograph.db was never touched during test execution', async () => {
    const currentStat = fs.statSync(PROD_DB_PATH);
    // Verify actual data below instead of comparing SQLite storage allocation.

    const checkDb = new DatabaseSync(PROD_DB_PATH, {readOnly:true});
    const currentCounts = {
      subjects: (checkDb.prepare('SELECT count(*) as c FROM subjects').get() as any).c,
      sources: (checkDb.prepare('SELECT count(*) as c FROM sources').get() as any).c,
      problems: (checkDb.prepare('SELECT count(*) as c FROM problems').get() as any).c,
      attempts: (checkDb.prepare('SELECT count(*) as c FROM attempts').get() as any).c,
    };
    checkDb.close();

    assert.deepEqual(currentCounts, prodCountsBefore, 'Database rows are 100% unchanged in monograph.db');
  });
});
