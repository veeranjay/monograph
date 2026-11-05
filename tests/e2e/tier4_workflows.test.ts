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
// TIER 4: Real-World Workloads & End-to-End User Workflows
// Scope: Realistic complete user journeys covering Subjects, Sheets, Problems,
// Multi-attempt progression, Breadcrumb drill-down, Collapsible diagnostics,
// and HomeScreen active subject cards.
// ============================================================================

describe('Tier 4: Real-World Workloads & End-to-End User Journeys', () => {
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

  test('Workflow 1: Complete New Curriculum Lifecycle (CS -> Algorithms -> Problems -> Progression -> Analytics)', async () => {
    // 1. Create "Theoretical Computer Science" Subject
    const subRes = await fetch(`${serverInfo.baseUrl}/api/subjects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Theoretical Computer Science',
        description: 'Algorithms, data structures, and discrete mathematics.',
        color: '#d97706',
        icon: 'binary'
      })
    });
    assert.equal(subRes.status, 201);
    const sub = await subRes.json();
    assert.ok(sub.id);

    // 2. Create Sheet "Graph Algorithms"
    const sheetRes = await fetch(`${serverInfo.baseUrl}/api/sources`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Graph Algorithms & Shortest Paths',
        subject_id: sub.id,
        reference: 'CLRS Chapter 24'
      })
    });
    assert.equal(sheetRes.status, 201);
    const sheet = await sheetRes.json();
    assert.ok(sheet.id);

    // 3. Create 5 Problems (Q01-Q05)
    const problems = [
      { number: '01', title: 'Dijkstra Algorithm' },
      { number: '02', title: 'Bellman-Ford Algorithm' },
      { number: '03', title: 'Floyd-Warshall Algorithm' },
      { number: '04', title: 'A* Heuristic Search' },
      { number: '05', title: 'Johnson Algorithm for Sparse Graphs' }
    ];

    const createdProblems: any[] = [];
    for (const p of problems) {
      const pRes = await fetch(`${serverInfo.baseUrl}/api/problems`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_id: sheet.id,
          number: p.number,
          title: p.title
        })
      });
      assert.equal(pRes.status, 201);
      createdProblems.push(await pRes.json());
    }
    assert.equal(createdProblems.length, 5);

    const q01 = createdProblems[0];
    const q02 = createdProblems[1];

    // 4. Student Journey on Q01 (Dijkstra): Failed -> Partial -> Solved
    // Attempt 1: Failed
    const att1Res = await fetch(`${serverInfo.baseUrl}/api/attempts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        problem_id: q01.id,
        result: 'failed',
        notes: 'Dense matrix brute force $\\mathcal{O}(V^2)$ exceeded time limit on graph with $|V|=10^5$.',
        heuristic_tags: ['time-limit-exceeded', 'suboptimal-data-structure'],
        time_seconds: 420
      })
    });
    assert.equal(att1Res.status, 201);

    // Attempt 2: Partial
    const att2Res = await fetch(`${serverInfo.baseUrl}/api/attempts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        problem_id: q01.id,
        result: 'partial',
        notes: 'Implemented binary heap $\\mathcal{O}((V + E) \\log V)$, but failed edge case with negative weights.',
        heuristic_tags: ['negative-edge-unhandled'],
        time_seconds: 310
      })
    });
    assert.equal(att2Res.status, 201);

    // Attempt 3: Solved
    const att3Res = await fetch(`${serverInfo.baseUrl}/api/attempts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        problem_id: q01.id,
        result: 'solved',
        notes: 'Added non-negative weight assertion, optimal solution accepted with time $\\mathcal{O}(E \\log V)$.',
        time_seconds: 195,
        confidence: 5
      })
    });
    assert.equal(att3Res.status, 201);

    // Solve Q02 in 1 attempt
    await fetch(`${serverInfo.baseUrl}/api/attempts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        problem_id: q02.id,
        result: 'solved',
        notes: 'Relaxation loop runs $|V|-1$ times. Clean implementation.',
        time_seconds: 240
      })
    });

    // 5. Verify Breadcrumb Navigation Trail
    const bcRes = await fetch(`${serverInfo.baseUrl}/api/breadcrumbs?type=problem&id=${q01.id}`);
    assert.equal(bcRes.status, 200);
    const crumbs = await bcRes.json();

    assert.equal(crumbs.length, 4);
    assert.deepEqual(crumbs[0], { label: 'Subjects', href: '#subjects', active: false });
    assert.deepEqual(crumbs[1], { label: 'Theoretical Computer Science', href: `#subject/${sub.id}`, active: false });
    assert.deepEqual(crumbs[2], { label: 'Graph Algorithms & Shortest Paths', href: `#source/${sheet.id}`, active: false });
    assert.deepEqual(crumbs[3], { label: 'Q01', active: true });

    // 6. Verify Problem History Immutability & Collapsible Drawer Payload
    const q01DetailRes = await fetch(`${serverInfo.baseUrl}/api/problems/${q01.id}`);
    assert.equal(q01DetailRes.status, 200);
    const q01Detail = await q01DetailRes.json();

    assert.equal(q01Detail.attempts.length, 3, 'All 3 attempts preserved in problem history');
    assert.equal(q01Detail.attempts[0].result, 'solved', 'Latest attempt is solved');
    assert.equal(q01Detail.attempts[1].result, 'partial');
    assert.equal(q01Detail.attempts[2].result, 'failed');

    // 7. Verify Subject Card Metrics on HomeScreen & Detail
    const subDetailRes = await fetch(`${serverInfo.baseUrl}/api/subjects/${sub.id}`);
    assert.equal(subDetailRes.status, 200);
    const subDetail = await subDetailRes.json();

    assert.equal(subDetail.sheet_count, 1);
    assert.equal(subDetail.problem_count, 5);
    assert.equal(subDetail.attempt_count, 4);
    assert.equal(subDetail.solved_count, 2);
    assert.equal(subDetail.solve_rate, 50, 'Solve rate is 50% (2 solved / 4 attempts)');
  });

  test('Workflow 2: Curriculum Reorganization & Migration (Reassigning Sheets with Full History Preservation)', async () => {
    // 1. Create "Physics Mechanics" and "Applied Mathematics" subjects
    const physRes = await fetch(`${serverInfo.baseUrl}/api/subjects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Physics Mechanics' })
    });
    const phys = await physRes.json();

    const mathRes = await fetch(`${serverInfo.baseUrl}/api/subjects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Applied Mathematics' })
    });
    const math = await mathRes.json();

    // 2. Create Sheet under Applied Mathematics
    const sheetRes = await fetch(`${serverInfo.baseUrl}/api/sources`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Lagrangian & Hamiltonian Dynamics', subject_id: math.id })
    });
    const sheet = await sheetRes.json();

    // 3. Add 2 problems and log attempts
    const p1Res = await fetch(`${serverInfo.baseUrl}/api/problems`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_id: sheet.id, number: '01', title: 'Euler-Lagrange Equation' })
    });
    const p1 = await p1Res.json();
    await fetch(`${serverInfo.baseUrl}/api/attempts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ problem_id: p1.id, result: 'solved' })
    });

    // Verify initial association
    let mathCheck = await (await fetch(`${serverInfo.baseUrl}/api/subjects/${math.id}`)).json();
    let physCheck = await (await fetch(`${serverInfo.baseUrl}/api/subjects/${phys.id}`)).json();
    assert.equal(mathCheck.sheet_count, 1);
    assert.equal(physCheck.sheet_count, 0);

    // 4. Reassign sheet to Physics Mechanics
    const reassignRes = await fetch(`${serverInfo.baseUrl}/api/sources/${sheet.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject_id: phys.id })
    });
    assert.equal(reassignRes.status, 200);

    // 5. Verify stats shifted
    mathCheck = await (await fetch(`${serverInfo.baseUrl}/api/subjects/${math.id}`)).json();
    physCheck = await (await fetch(`${serverInfo.baseUrl}/api/subjects/${phys.id}`)).json();
    assert.equal(mathCheck.sheet_count, 0, 'Math lost the sheet');
    assert.equal(physCheck.sheet_count, 1, 'Physics gained the sheet');
    assert.equal(physCheck.solved_count, 1, 'Attempt stats transitioned cleanly');

    // 6. Verify breadcrumb dynamically reflects new parent
    const bcRes = await fetch(`${serverInfo.baseUrl}/api/breadcrumbs?type=problem&id=${p1.id}`);
    const crumbs = await bcRes.json();
    assert.equal(crumbs[1].label, 'Physics Mechanics', 'Breadcrumb points to new subject');
    assert.equal(crumbs[1].href, `#subject/${phys.id}`);
  });

  test('Workflow 3: Focused Log Screen Workflow with Collapsible Secondary Diagnostics', async () => {
    // 1. Create sheet & problem
    const sheetRes = await fetch(`${serverInfo.baseUrl}/api/sources`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Special Relativity' })
    });
    const sheet = await sheetRes.json();

    const pRes = await fetch(`${serverInfo.baseUrl}/api/problems`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_id: sheet.id, number: '04', title: 'Lorentz Transformation' })
    });
    const problem = await pRes.json();

    // 2. User logs attempt with primary result and secondary collapsible diagnostics
    const attemptPayload = {
      problem_id: problem.id,
      result: 'solved',
      confidence: 5,
      time_seconds: 165,
      recognition: 'formulaic',
      help: 'none',
      notes: 'Used rapidity $\\theta = \\tanh^{-1}(v/c)$ to compose boosts collinear along x-axis.',
      heuristic_tags: ['rapidity-composition', 'hyperbolic-geometry'],
      meta_tags: JSON.stringify({ difficulty: 'olympiad', chapter: 'spacetime-physics' })
    };

    const logRes = await fetch(`${serverInfo.baseUrl}/api/attempts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(attemptPayload)
    });
    assert.equal(logRes.status, 201);

    // 3. User checks problem view: ensure base problem entity remains decluttered
    const fetched = await (await fetch(`${serverInfo.baseUrl}/api/problems/${problem.id}`)).json();
    assert.equal(fetched.number, '04');
    assert.equal(fetched.title, 'Lorentz Transformation');

    // 4. Secondary diagnostics are fully populated in attempt
    const recordedAttempt = fetched.attempts[0];
    assert.equal(recordedAttempt.result, 'solved');
    assert.equal(recordedAttempt.confidence, 5);
    assert.equal(recordedAttempt.time_seconds, 165);
    assert.ok(recordedAttempt.notes.includes('rapidity'));
    assert.ok(recordedAttempt.heuristic_tags.includes('rapidity-composition'));
    const meta = JSON.parse(recordedAttempt.meta_tags);
    assert.equal(meta.difficulty, 'olympiad');
  });

  test('Workflow 4: Active Subjects Dashboard & Quick Action Resume Work', async () => {
    // Query subjects for Main Hub
    const hubRes = await fetch(`${serverInfo.baseUrl}/api/subjects`);
    assert.equal(hubRes.status, 200);
    const subjects = await hubRes.json();

    // Assert subjects have computed metrics for Active Subject cards
    assert.ok(Array.isArray(subjects));
    for (const sub of subjects) {
      assert.ok('sheet_count' in sub || 'sources_count' in sub);
      assert.ok('problem_count' in sub);
      assert.ok('solve_rate' in sub);
      assert.ok('attempt_count' in sub);
    }

    // Query recent activity stream for "Resume Work" hero action
    const recentRes = await fetch(`${serverInfo.baseUrl}/api/attempts/recent?limit=1`);
    assert.equal(recentRes.status, 200);
    const recentList = await recentRes.json();
    assert.ok(recentList.length > 0);

    const latest = recentList[0];
    assert.ok(latest.problem_number, 'Has problem number');
    assert.ok(latest.source_name, 'Has sheet name');
    assert.ok(latest.subject_name, 'Has subject name');
    // Enables the hero button: "Resume [Problem] in [Sheet] ([Subject])"
  });
});
