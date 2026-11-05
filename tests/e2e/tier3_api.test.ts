import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTestDb,
  createTestApp,
  startTestServer,
  TestDbInstance
} from '../test_harness.js';
import { app } from '../../src/server/server.js';
import * as subjectsService from '../../src/server/services/subjectsService.js';

// ============================================================================
// TIER 3: Cross-Feature Combinations & REST API Contracts Test Suite
// Scope: Pairwise interactions, cross-resource consistency, breadcrumb resolution,
// collapsible metadata contracts, and scoped query filtering via HTTP.
// ============================================================================

describe('Tier 3: Cross-Feature Combinations & REST API Contracts', () => {
  let fixture: TestDbInstance;
  let serverInfo: { baseUrl: string; close: () => Promise<void> };

  before(async () => {
    fixture = createTestDb({ inMemory: true, seedDefaults: true });
    const app = createTestApp(fixture.db);
    serverInfo = await startTestServer(app);
  });

  after(async () => {
    await serverInfo.close();
    fixture.cleanup();
  });

  test('T3-01: Health check endpoint confirms test server isolation', async () => {
    const res = await fetch(`${serverInfo.baseUrl}/api/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'ok');
    assert.equal(body.isolated, true);
  });

  test('T3-02: Subject Creation -> Sheet Assignment -> Batch Problems -> Attempt Logging -> Subject Analytics', async () => {
    // 1. Create Subject
    const subRes = await fetch(`${serverInfo.baseUrl}/api/subjects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Computational Complexity',
        description: 'P vs NP, Turing machines, and reductions.',
        color: '#8b5cf6'
      })
    });
    assert.equal(subRes.status, 201);
    const sub = await subRes.json();
    assert.ok(sub.id);
    assert.equal(sub.name, 'Computational Complexity');

    // 2. Create Sheet under this Subject
    const sheetRes = await fetch(`${serverInfo.baseUrl}/api/sources`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'NP-Completeness Reductions',
        subject_id: sub.id
      })
    });
    assert.equal(sheetRes.status, 201);
    const sheet = await sheetRes.json();
    assert.equal(sheet.subject_id, sub.id);

    // 3. Batch generate 4 problems
    const batchRes = await fetch(`${serverInfo.baseUrl}/api/problems/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_id: sheet.id,
        count: 4,
        prefix: 'CC-'
      })
    });
    assert.equal(batchRes.status, 201);
    const batch = await batchRes.json();
    assert.equal(batch.created, 4);

    // 4. Log attempts: 2 solved, 1 failed, 1 partial
    const pIds = batch.problems.map((p: any) => p.id);
    await fetch(`${serverInfo.baseUrl}/api/attempts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ problem_id: pIds[0], result: 'solved', time_seconds: 300 })
    });
    await fetch(`${serverInfo.baseUrl}/api/attempts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ problem_id: pIds[1], result: 'solved', time_seconds: 400 })
    });
    await fetch(`${serverInfo.baseUrl}/api/attempts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ problem_id: pIds[2], result: 'failed', time_seconds: 500 })
    });
    await fetch(`${serverInfo.baseUrl}/api/attempts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ problem_id: pIds[3], result: 'partial', time_seconds: 600 })
    });

    // 5. Query Subject-filtered Analytics
    const analyticsRes = await fetch(`${serverInfo.baseUrl}/api/analytics?subjectId=${sub.id}`);
    assert.equal(analyticsRes.status, 200);
    const analytics = await analyticsRes.json();

    assert.equal(analytics.totalProblemsAttempted, 4);
    assert.equal(analytics.totalAttempts, 4);
    assert.equal(analytics.totalSolved, 2);
    assert.equal(analytics.totalFailed, 1);
    assert.equal(analytics.totalPartial, 1);
    assert.equal(analytics.solveRate, 50, 'Solve rate = 2/4 = 50%');
    assert.equal(analytics.averageTimeSeconds, 450);
  });

  test('T3-03: Sheet Reassignment dynamically reflects in Breadcrumb resolution', async () => {
    // 1. Create two subjects
    const s1Res = await fetch(`${serverInfo.baseUrl}/api/subjects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Breadcrumb Domain A' })
    });
    const subA = await s1Res.json();

    const s2Res = await fetch(`${serverInfo.baseUrl}/api/subjects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Breadcrumb Domain B' })
    });
    const subB = await s2Res.json();

    // 2. Create sheet under Domain A
    const sheetRes = await fetch(`${serverInfo.baseUrl}/api/sources`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Traveling Sheet', subject_id: subA.id })
    });
    const sheet = await sheetRes.json();

    // 3. Create problem under sheet
    const probRes = await fetch(`${serverInfo.baseUrl}/api/problems`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_id: sheet.id, number: '42', title: 'Answer to Life' })
    });
    const problem = await probRes.json();

    // 4. Check initial breadcrumbs -> Domain A
    const bcRes1 = await fetch(`${serverInfo.baseUrl}/api/breadcrumbs?type=problem&id=${problem.id}`);
    assert.equal(bcRes1.status, 200);
    const bc1 = await bcRes1.json();
    assert.equal(bc1[1].label, 'Breadcrumb Domain A');
    assert.equal(bc1[1].href, `#subject/${subA.id}`);
    assert.equal(bc1[2].label, 'Traveling Sheet');
    assert.equal(bc1[3].label, 'Q42');

    // 5. Reassign sheet to Domain B
    const updateRes = await fetch(`${serverInfo.baseUrl}/api/sources/${sheet.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject_id: subB.id })
    });
    assert.equal(updateRes.status, 200);

    // 6. Check updated breadcrumbs -> Domain B
    const bcRes2 = await fetch(`${serverInfo.baseUrl}/api/breadcrumbs?type=problem&id=${problem.id}`);
    assert.equal(bcRes2.status, 200);
    const bc2 = await bcRes2.json();
    assert.equal(bc2[1].label, 'Breadcrumb Domain B', 'Breadcrumb updated to new parent subject');
    assert.equal(bc2[1].href, `#subject/${subB.id}`);
    assert.equal(bc2[2].label, 'Traveling Sheet');
    assert.equal(bc2[3].label, 'Q42');
  });

  test('T3-04: Collapsible State Toggle Contract - Primary card is minimal, nested attempts carry rich diagnostics', async () => {
    // Create sheet & problem
    const sheetRes = await fetch(`${serverInfo.baseUrl}/api/sources`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Collapsible Contract Sheet' })
    });
    const sheet = await sheetRes.json();

    const probRes = await fetch(`${serverInfo.baseUrl}/api/problems`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_id: sheet.id, number: '01', title: 'Residue Calculus' })
    });
    const prob = await probRes.json();

    // Submit attempt with verbose secondary metadata
    await fetch(`${serverInfo.baseUrl}/api/attempts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        problem_id: prob.id,
        result: 'failed',
        notes: 'Residue at pole $z=i$ was computed with wrong sign: $\\text{Res}(f, i) = -1/2i$.',
        recognition: 'pattern-matched',
        help: 'hint-viewed',
        confidence: 2,
        time_seconds: 480,
        heuristic_tags: ['complex-pole-order-mismatch', 'sign-flip'],
        meta_tags: JSON.stringify({ category: 'contour-integration', contest: 'Putnam' })
      })
    });

    // Query problem endpoint
    const fetchedRes = await fetch(`${serverInfo.baseUrl}/api/problems/${prob.id}`);
    assert.equal(fetchedRes.status, 200);
    const pDetail = await fetchedRes.json();

    // Primary card level assertions: concise identifiers
    assert.equal(pDetail.number, '01');
    assert.equal(pDetail.title, 'Residue Calculus');
    assert.ok(pDetail.source_name);

    // Collapsible drawer level assertions: full secondary diagnostics payload
    assert.equal(pDetail.attempts.length, 1);
    const att = pDetail.attempts[0];
    assert.equal(att.result, 'failed');
    assert.equal(att.recognition, 'pattern-matched');
    assert.equal(att.help, 'hint-viewed');
    assert.equal(att.confidence, 2);
    assert.equal(att.time_seconds, 480);
    assert.deepEqual([...att.heuristic_tags].sort(), ['complex-pole-order-mismatch', 'sign-flip'].sort());
    // The API returns decoded JSON; older clients received a JSON string.
    const meta = typeof att.meta_tags === 'string' ? JSON.parse(att.meta_tags) : att.meta_tags;
    assert.equal(meta.category, 'contour-integration');
    assert.equal(meta.contest, 'Putnam');
  });

  test('T3-05: Deleting a subject reassigns its sheets to the default fallback subject', async () => {
    // 1. Create temporary subject
    const subRes = await fetch(`${serverInfo.baseUrl}/api/subjects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Subject to be Deleted' })
    });
    const sub = await subRes.json();

    // 2. Create sheet under this subject
    const sheetRes = await fetch(`${serverInfo.baseUrl}/api/sources`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Surviving Reallocated Sheet', subject_id: sub.id })
    });
    const sheet = await sheetRes.json();

    // 3. Delete the subject
    const delRes = await fetch(`${serverInfo.baseUrl}/api/subjects/${sub.id}`, {
      method: 'DELETE'
    });
    assert.equal(delRes.status, 200);
    const delResult = await delRes.json();
    assert.ok(delResult.success);

    // 4. Verify subject is gone
    const checkSub = await fetch(`${serverInfo.baseUrl}/api/subjects/${sub.id}`);
    assert.equal(checkSub.status, 404);

    // 5. Verify sheet survived and was reallocated
    const checkSheet = await fetch(`${serverInfo.baseUrl}/api/sources/${sheet.id}`);
    assert.equal(checkSheet.status, 200);
    const sheetData = await checkSheet.json();
    assert.notEqual(sheetData.subject_id, sub.id, 'No longer assigned to deleted subject');
    assert.ok(sheetData.subject_id, 'Reassigned to default fallback subject');
  });

  test('T3-06: Scoped Analytics Query Isolation (Subject A vs Subject B vs Global)', async () => {
    // Create Subject A and Subject B
    const aRes = await fetch(`${serverInfo.baseUrl}/api/subjects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Analytics Scope A' })
    });
    const subA = await aRes.json();

    const bRes = await fetch(`${serverInfo.baseUrl}/api/subjects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Analytics Scope B' })
    });
    const subB = await bRes.json();

    // Sheet A -> 2 solved attempts
    const sheetARes = await fetch(`${serverInfo.baseUrl}/api/sources`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Sheet A', subject_id: subA.id })
    });
    const sheetA = await sheetARes.json();
    const probARes = await fetch(`${serverInfo.baseUrl}/api/problems`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_id: sheetA.id, number: '01' })
    });
    const probA = await probARes.json();
    await fetch(`${serverInfo.baseUrl}/api/attempts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ problem_id: probA.id, result: 'solved' })
    });
    await fetch(`${serverInfo.baseUrl}/api/attempts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ problem_id: probA.id, result: 'solved' })
    });

    // Sheet B -> 2 failed attempts
    const sheetBRes = await fetch(`${serverInfo.baseUrl}/api/sources`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Sheet B', subject_id: subB.id })
    });
    const sheetB = await sheetBRes.json();
    const probBRes = await fetch(`${serverInfo.baseUrl}/api/problems`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_id: sheetB.id, number: '01' })
    });
    const probB = await probBRes.json();
    await fetch(`${serverInfo.baseUrl}/api/attempts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ problem_id: probB.id, result: 'failed' })
    });
    await fetch(`${serverInfo.baseUrl}/api/attempts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ problem_id: probB.id, result: 'failed' })
    });

    // Scoped Analytics checks
    const resA = await fetch(`${serverInfo.baseUrl}/api/analytics?subjectId=${subA.id}`);
    const dataA = await resA.json();
    assert.equal(dataA.totalAttempts, 2);
    assert.equal(dataA.totalSolved, 2);
    assert.equal(dataA.solveRate, 100);

    const resB = await fetch(`${serverInfo.baseUrl}/api/analytics?subjectId=${subB.id}`);
    const dataB = await resB.json();
    assert.equal(dataB.totalAttempts, 2);
    assert.equal(dataB.totalFailed, 2);
    assert.equal(dataB.solveRate, 0);
  });

  test('T3-07: REST API error handling & status code contracts', async () => {
    // 1. Missing name in POST /api/subjects -> 400
    const badSub = await fetch(`${serverInfo.baseUrl}/api/subjects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '   ' })
    });
    assert.equal(badSub.status, 400);

    // 2. Duplicate name in POST /api/subjects -> 409
    const dupName = 'Duplicate Subject ' + Math.random();
    await fetch(`${serverInfo.baseUrl}/api/subjects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: dupName })
    });
    const dupRes = await fetch(`${serverInfo.baseUrl}/api/subjects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: dupName })
    });
    assert.equal(dupRes.status, 409);

    // 3. GET non-existent subject -> 404
    const notFoundSub = await fetch(`${serverInfo.baseUrl}/api/subjects/non-existent-id-12345`);
    assert.equal(notFoundSub.status, 404);

    // 4. Missing name in POST /api/sources -> 400
    const badSource = await fetch(`${serverInfo.baseUrl}/api/sources`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert.equal(badSource.status, 400);

    // 5. Missing required fields in POST /api/attempts -> 400
    const badAttempt = await fetch(`${serverInfo.baseUrl}/api/attempts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ result: 'solved' }) // missing problem_id
    });
    assert.equal(badAttempt.status, 400);
  });
});
