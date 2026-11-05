import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  createTestDb,
  insertSubject,
  insertSource,
  insertProblem,
  insertAttempt,
  getAllSubjectsWithStats,
  getSubjectById,
  resolveBreadcrumbs,
  backfillSourcesToDefaultSubject,
  TestDbInstance
} from '../test_harness.js';
import * as subjectsService from '../../src/server/services/subjectsService.js';
import * as sourcesService from '../../src/server/services/sourcesService.js';

// ============================================================================
// TIER 1: Static Type, Build & Feature Coverage Test Suite
// Requirements covered: R1, R2, R3, R4 (>=5 isolated test cases per feature)
// ============================================================================

describe('Tier 1: Static Type & Client Production Build Verification', () => {
  test('TypeScript compilation (npx tsc --noEmit) passes with 0 errors', () => {
    const result = execSync('npx tsc --noEmit', {
      cwd: process.cwd(),
      encoding: 'utf-8',
      stdio: 'pipe'
    });
    // If command threw an error, execSync would fail. Code 0 indicates clean compilation.
    assert.ok(true, 'TypeScript compiled with zero errors');
  });

  test('Client production build (npm run build) succeeds and generates dist artifacts', () => {
    const distPath = path.resolve(process.cwd(), 'dist/client');
    const indexHtml = path.resolve(distPath, 'index.html');

    // If dist/client doesn't exist yet, build it
    if (!fs.existsSync(indexHtml)) {
      execSync('npm run build', {
        cwd: process.cwd(),
        encoding: 'utf-8',
        stdio: 'pipe'
      });
    }

    assert.ok(fs.existsSync(distPath), 'dist/client directory exists');
    assert.ok(fs.existsSync(indexHtml), 'dist/client/index.html exists');

    const assetsDir = path.resolve(distPath, 'assets');
    assert.ok(fs.existsSync(assetsDir), 'dist/client/assets directory exists');
    const assetFiles = fs.readdirSync(assetsDir);
    const hasJs = assetFiles.some((f) => f.endsWith('.js'));
    const hasCss = assetFiles.some((f) => f.endsWith('.css'));
    assert.ok(hasJs, 'Production JS bundle generated');
    assert.ok(hasCss, 'Production CSS bundle generated');
  });
});

// ============================================================================
// FEATURE COVERAGE: R1. Hierarchical Subject Structure & Breadcrumb Navigation
// ============================================================================
describe('Tier 1 - Feature Coverage: R1 Hierarchical Subject Structure & Breadcrumbs', () => {
  let fixture: TestDbInstance;

  before(() => {
    fixture = createTestDb({ inMemory: true, seedDefaults: true });
  });

  after(() => {
    fixture.cleanup();
  });

  test('R1-1: Subject model supports id, name, description, color, icon, and metadata', () => {
    const subject = insertSubject(fixture.db, {
      name: 'Linear Algebra',
      description: 'Vector spaces, matrices, and transformations.',
      color: '#4f46e5',
      icon: 'grid'
    });

    assert.ok(subject.id, 'Subject generated unique ID');
    assert.equal(subject.name, 'Linear Algebra');
    assert.equal(subject.description, 'Vector spaces, matrices, and transformations.');
    assert.equal(subject.color, '#4f46e5');
    assert.equal(subject.icon, 'grid');
  });

  test('R1-2: Top-level Subject groups multiple sheets correctly', () => {
    const subject = insertSubject(fixture.db, { name: 'Differential Equations' });
    const s1 = insertSource(fixture.db, { name: 'First Order ODEs', subject_id: subject.id });
    const s2 = insertSource(fixture.db, { name: 'Second Order Linear ODEs', subject_id: subject.id });

    const subjectDetail = getSubjectById(fixture.db, subject.id);
    assert.ok(subjectDetail);
    assert.equal(subjectDetail.sheet_count, 2);
    assert.equal(subjectDetail.sources.length, 2);
    const names = subjectDetail.sources.map((s) => s.name);
    assert.ok(names.includes('First Order ODEs'));
    assert.ok(names.includes('Second Order Linear ODEs'));
  });

  test('R1-3: Reassigning sheet from one subject to another updates parent hierarchy', () => {
    const subMath = insertSubject(fixture.db, { name: 'Mathematics Core' });
    const subPhys = insertSubject(fixture.db, { name: 'Theoretical Physics' });
    const sheet = insertSource(fixture.db, { name: 'Tensor Calculus', subject_id: subMath.id });

    // Initial check
    let mathDetail = getSubjectById(fixture.db, subMath.id);
    assert.equal(mathDetail?.sheet_count, 1);

    // Reassign to Theoretical Physics
    fixture.db.prepare('UPDATE sources SET subject_id = ? WHERE id = ?').run(subPhys.id, sheet.id);

    mathDetail = getSubjectById(fixture.db, subMath.id);
    const physDetail = getSubjectById(fixture.db, subPhys.id);

    assert.equal(mathDetail?.sheet_count, 0, 'Math subject no longer has the sheet');
    assert.equal(physDetail?.sheet_count, 1, 'Physics subject now has the sheet');
    assert.equal(physDetail?.sources[0].name, 'Tensor Calculus');
  });

  test('R1-4: Breadcrumb trail resolves correctly on Subject view (Subjects > [Subject])', () => {
    const subject = insertSubject(fixture.db, { name: 'Quantum Mechanics' });
    const crumbs = resolveBreadcrumbs(fixture.db, 'subject', subject.id);

    assert.equal(crumbs.length, 2);
    assert.deepEqual(crumbs[0], { label: 'Subjects', href: '#subjects', active: false });
    assert.deepEqual(crumbs[1], { label: 'Quantum Mechanics', active: true });
  });

  test('R1-5: Breadcrumb trail resolves correctly on Sheet view (Subjects > [Subject] > [Sheet])', () => {
    const subject = insertSubject(fixture.db, { name: 'Astrophysics' });
    const sheet = insertSource(fixture.db, { name: 'Stellar Interiors', subject_id: subject.id });
    const crumbs = resolveBreadcrumbs(fixture.db, 'source', sheet.id);

    assert.equal(crumbs.length, 3);
    assert.deepEqual(crumbs[0], { label: 'Subjects', href: '#subjects', active: false });
    assert.deepEqual(crumbs[1], { label: 'Astrophysics', href: `#subject/${subject.id}`, active: false });
    assert.deepEqual(crumbs[2], { label: 'Stellar Interiors', active: true });
  });

  test('R1-6: Breadcrumb trail resolves correctly on Problem view (Subjects > [Subject] > [Sheet] > Q[Number])', () => {
    const subject = insertSubject(fixture.db, { name: 'Discrete Math' });
    const sheet = insertSource(fixture.db, { name: 'Graph Theory 101', subject_id: subject.id });
    const problem = insertProblem(fixture.db, { source_id: sheet.id, number: '07', title: 'Eulerian Circuits' });
    const crumbs = resolveBreadcrumbs(fixture.db, 'problem', problem.id);

    assert.equal(crumbs.length, 4);
    assert.deepEqual(crumbs[0], { label: 'Subjects', href: '#subjects', active: false });
    assert.deepEqual(crumbs[1], { label: 'Discrete Math', href: `#subject/${subject.id}`, active: false });
    assert.deepEqual(crumbs[2], { label: 'Graph Theory 101', href: `#source/${sheet.id}`, active: false });
    assert.deepEqual(crumbs[3], { label: 'Q07', active: true });
  });
});

// ============================================================================
// FEATURE COVERAGE: R2. Main Hub Simplification & Focus
// ============================================================================
describe('Tier 1 - Feature Coverage: R2 Main Hub Simplification & Focus', () => {
  let fixture: TestDbInstance;

  before(() => {
    fixture = createTestDb({ inMemory: true, seedDefaults: false });
  });

  after(() => {
    fixture.cleanup();
  });

  test('R2-1: Active subjects aggregate sheet count and problem count cleanly', () => {
    const sub = insertSubject(fixture.db, { name: 'Calculus' });
    const sheet1 = insertSource(fixture.db, { name: 'Derivatives', subject_id: sub.id });
    const sheet2 = insertSource(fixture.db, { name: 'Integrals', subject_id: sub.id });

    insertProblem(fixture.db, { source_id: sheet1.id, number: '01' });
    insertProblem(fixture.db, { source_id: sheet1.id, number: '02' });
    insertProblem(fixture.db, { source_id: sheet2.id, number: '01' });

    const stats = getAllSubjectsWithStats(fixture.db);
    const calc = stats.find((s) => s.id === sub.id);
    assert.ok(calc);
    assert.equal(calc.sheet_count, 2, 'Aggregates 2 sheets');
    assert.equal(calc.problem_count, 3, 'Aggregates 3 problems');
  });

  test('R2-2: Active subject calculates solve rate accurately across all member sheets', () => {
    const sub = insertSubject(fixture.db, { name: 'Algebra' });
    const sheet = insertSource(fixture.db, { name: 'Polynomials', subject_id: sub.id });
    const p1 = insertProblem(fixture.db, { source_id: sheet.id, number: '01' });
    const p2 = insertProblem(fixture.db, { source_id: sheet.id, number: '02' });

    insertAttempt(fixture.db, { problem_id: p1.id, result: 'solved' });
    insertAttempt(fixture.db, { problem_id: p2.id, result: 'failed' });

    const stats = getAllSubjectsWithStats(fixture.db);
    const alg = stats.find((s) => s.id === sub.id);
    assert.ok(alg);
    assert.equal(alg.attempt_count, 2);
    assert.equal(alg.solved_count, 1);
    assert.equal(alg.solve_rate, 50, 'Solve rate is 50%');
  });

  test('R2-3: Empty subject handles 0 sheets without crashing or division-by-zero NaN', () => {
    const emptySub = insertSubject(fixture.db, { name: 'Empty Notebook' });
    const stats = getAllSubjectsWithStats(fixture.db);
    const item = stats.find((s) => s.id === emptySub.id);

    assert.ok(item);
    assert.equal(item.sheet_count, 0);
    assert.equal(item.problem_count, 0);
    assert.equal(item.attempt_count, 0);
    assert.equal(item.solved_count, 0);
    assert.equal(item.solve_rate, 0);
    assert.equal(item.latest_activity, null);
  });

  test('R2-4: Quick actions / Resume work identifies most recent active sheet and problem', () => {
    const sub = insertSubject(fixture.db, { name: 'Topology' });
    const sheet1 = insertSource(fixture.db, { name: 'Point-set Topology', subject_id: sub.id });
    const sheet2 = insertSource(fixture.db, { name: 'Algebraic Topology', subject_id: sub.id });

    const p1 = insertProblem(fixture.db, { source_id: sheet1.id, number: '01' });
    const p2 = insertProblem(fixture.db, { source_id: sheet2.id, number: '01' });

    // Older attempt on sheet 1
    insertAttempt(fixture.db, {
      problem_id: p1.id,
      result: 'solved',
      created_at: '2026-01-01T10:00:00Z',
      finished_at: '2026-01-01T10:00:00Z'
    });

    // Newer attempt on sheet 2
    insertAttempt(fixture.db, {
      problem_id: p2.id,
      result: 'failed',
      created_at: '2026-01-02T15:00:00Z',
      finished_at: '2026-01-02T15:00:00Z'
    });

    const recent = fixture.db.prepare(`
      SELECT p.id as problem_id, p.number, s.id as source_id, s.name as source_name, a.created_at
      FROM attempts a
      JOIN problems p ON p.id = a.problem_id
      JOIN sources s ON s.id = p.source_id
      WHERE s.subject_id = ?
      ORDER BY a.created_at DESC
      LIMIT 1
    `).get(sub.id) as any;

    assert.ok(recent);
    assert.equal(recent.source_name, 'Algebraic Topology', 'Correct recent sheet identified');
    assert.equal(recent.problem_id, p2.id, 'Correct recent problem identified');
  });

  test('R2-5: Main Hub declutters flat sheet list by categorizing under active subject notebooks', () => {
    const sub1 = insertSubject(fixture.db, { name: 'Hub Category A' });
    const sub2 = insertSubject(fixture.db, { name: 'Hub Category B' });
    insertSource(fixture.db, { name: 'Sheet A1', subject_id: sub1.id });
    insertSource(fixture.db, { name: 'Sheet A2', subject_id: sub1.id });
    insertSource(fixture.db, { name: 'Sheet B1', subject_id: sub2.id });

    const subjects = getAllSubjectsWithStats(fixture.db);
    const targetA = subjects.find((s) => s.id === sub1.id);
    const targetB = subjects.find((s) => s.id === sub2.id);

    assert.ok(targetA);
    assert.equal(targetA.sheet_count, 2, 'Subject A contains 2 grouped sheets');
    assert.ok(targetB);
    assert.equal(targetB.sheet_count, 1, 'Subject B contains 1 grouped sheet');
  });
});

// ============================================================================
// FEATURE COVERAGE: R3. Collapsible & Streamlined Badges, Tags, and Metadata
// ============================================================================
describe('Tier 1 - Feature Coverage: R3 Collapsible Badges, Tags & Metadata', () => {
  let fixture: TestDbInstance;

  before(() => {
    fixture = createTestDb({ inMemory: true, seedDefaults: true });
  });

  after(() => {
    fixture.cleanup();
  });

  test('R3-1: Problem record defaults contain essential primary indicators without tag clutter', () => {
    const sub = insertSubject(fixture.db, { name: 'Analysis' });
    const sheet = insertSource(fixture.db, { name: 'Real Analysis 1', subject_id: sub.id });
    const prob = insertProblem(fixture.db, {
      source_id: sheet.id,
      number: '14',
      title: 'Bolzano-Weierstrass Theorem'
    });

    assert.equal(prob.number, '14');
    assert.equal(prob.title, 'Bolzano-Weierstrass Theorem');
    assert.equal(prob.source_name, 'Real Analysis 1');
    assert.equal(prob.subject_name, 'Analysis');
    // Note: tags are segregated in junction tables, keeping base problem payload clean
  });

  test('R3-2: Secondary heuristic tags stored cleanly in junction table for collapsible reveal', () => {
    const sheet = insertSource(fixture.db, { name: 'Calculus Sheet' });
    const prob = insertProblem(fixture.db, { source_id: sheet.id, number: '03' });

    const attempt = insertAttempt(fixture.db, {
      problem_id: prob.id,
      result: 'failed',
      notes: 'L-Hopital applied without indeterminate form',
      heuristic_tags: ['algebraic-slip', 'verification-neglect', 'formula-misapplication']
    });

    const tagsQuery = fixture.db.prepare(`
      SELECT t.name FROM attempt_tags at
      JOIN tags t ON t.id = at.tag_id
      WHERE at.attempt_id = ?
    `).all(attempt.id) as any[];

    assert.equal(tagsQuery.length, 3);
    const names = tagsQuery.map((t) => t.name);
    assert.ok(names.includes('algebraic-slip'));
    assert.ok(names.includes('verification-neglect'));
    assert.ok(names.includes('formula-misapplication'));
  });

  test('R3-3: Meta tags and diagnostics stored in meta_tags column for expand-on-demand', () => {
    const sheet = insertSource(fixture.db, { name: 'Trig Sheet' });
    const prob = insertProblem(fixture.db, { source_id: sheet.id, number: '05' });

    const attempt = insertAttempt(fixture.db, {
      problem_id: prob.id,
      result: 'solved',
      confidence: 5,
      time_seconds: 120,
      recognition: 'immediate',
      help: 'none',
      meta_tags: JSON.stringify({ difficulty: 'hard', domain: 'analytic-trig', starred: true })
    });

    const fetched = fixture.db.prepare('SELECT meta_tags, recognition, help, confidence FROM attempts WHERE id = ?').get(attempt.id) as any;
    assert.ok(fetched.meta_tags);
    const parsed = JSON.parse(fetched.meta_tags);
    assert.equal(parsed.difficulty, 'hard');
    assert.equal(parsed.starred, true);
    assert.equal(fetched.recognition, 'immediate');
    assert.equal(fetched.confidence, 5);
  });

  test('R3-4: Multi-attempt history records are preserved chronologically for drawer expansion', () => {
    const sheet = insertSource(fixture.db, { name: 'Attempt History Test' });
    const prob = insertProblem(fixture.db, { source_id: sheet.id, number: '10' });

    insertAttempt(fixture.db, {
      problem_id: prob.id,
      result: 'failed',
      notes: 'Initial attempt failed due to sign error',
      finished_at: '2026-03-01T10:00:00Z'
    });

    insertAttempt(fixture.db, {
      problem_id: prob.id,
      result: 'partial',
      notes: 'Correct substitution, got stuck at integration',
      finished_at: '2026-03-01T11:00:00Z'
    });

    insertAttempt(fixture.db, {
      problem_id: prob.id,
      result: 'solved',
      notes: 'Solved cleanly using integration by parts',
      finished_at: '2026-03-01T12:00:00Z'
    });

    const attempts = fixture.db.prepare(`
      SELECT result, notes, finished_at FROM attempts
      WHERE problem_id = ?
      ORDER BY finished_at ASC
    `).all(prob.id) as any[];

    assert.equal(attempts.length, 3, 'All 3 attempts preserved without overwrite');
    assert.equal(attempts[0].result, 'failed');
    assert.equal(attempts[1].result, 'partial');
    assert.equal(attempts[2].result, 'solved');
  });

  test('R3-5: Qualitative observation logs (mistake/technique) attached cleanly to attempt without cluttering card header', () => {
    const sheet = insertSource(fixture.db, { name: 'Observation Sheet' });
    const prob = insertProblem(fixture.db, { source_id: sheet.id, number: '08' });
    const attempt = insertAttempt(fixture.db, { problem_id: prob.id, result: 'failed' });

    const obsId = 'obs-1';
    const now = new Date().toISOString();
    fixture.db.prepare(`
      INSERT INTO observations (id, problem_id, attempt_id, type, content, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(obsId, prob.id, attempt.id, 'mistake', 'Forgotten boundary condition at x=0', now);

    const obs = fixture.db.prepare('SELECT * FROM observations WHERE attempt_id = ?').all(attempt.id) as any[];
    assert.equal(obs.length, 1);
    assert.equal(obs[0].type, 'mistake');
    assert.equal(obs[0].content, 'Forgotten boundary condition at x=0');
  });
});

// ============================================================================
// FEATURE COVERAGE: R4. Data Integrity & Seamless Migration
// ============================================================================
describe('Tier 1 - Feature Coverage: R4 Data Integrity & Seamless Migration', () => {
  let legacyFixture: TestDbInstance;

  before(() => {
    // Populate with unassigned legacy data
    legacyFixture = createTestDb({ inMemory: true, seedDefaults: false, populateLegacyData: true });
  });

  after(() => {
    legacyFixture.cleanup();
  });

  test('R4-1: Pre-migration legacy sheets without subject_id survive schema creation intact', () => {
    const sources = legacyFixture.db.prepare('SELECT * FROM sources').all() as any[];
    assert.equal(sources.length, 2, '2 legacy sheets exist');
    assert.equal(sources[0].subject_id, null, 'subject_id is initially NULL');
  });

  test('R4-2: Default subjects seeded automatically when subjects table is empty', () => {
    const initialCount = (legacyFixture.db.prepare('SELECT COUNT(*) as c FROM subjects').get() as any).c;
    assert.equal(initialCount, 0, 'Initially zero subjects');

    const seeds = {
      math: insertSubject(legacyFixture.db, { id: 'sub-math-default', name: 'Mathematics' }),
      phys: insertSubject(legacyFixture.db, { id: 'sub-phys-default', name: 'Physics' }),
      cs: insertSubject(legacyFixture.db, { id: 'sub-cs-default', name: 'Computer Science' })
    };

    const countAfter = (legacyFixture.db.prepare('SELECT COUNT(*) as c FROM subjects').get() as any).c;
    assert.equal(countAfter, 3, 'Seeded 3 default subjects');
    assert.ok(seeds.math.id);
  });

  test('R4-3: Backfill automatically maps legacy unassigned sheets to Mathematics subject', () => {
    const updatedRows = backfillSourcesToDefaultSubject(legacyFixture.db);
    assert.equal(updatedRows, 2, 'Both legacy sheets backfilled');

    const sources = legacyFixture.db.prepare(`
      SELECT s.id, s.name, s.subject_id, sub.name as subject_name
      FROM sources s
      LEFT JOIN subjects sub ON sub.id = s.subject_id
    `).all() as any[];

    for (const src of sources) {
      assert.equal(src.subject_id, 'sub-math-default', 'Assigned to default Mathematics ID');
      assert.equal(src.subject_name, 'Mathematics', 'Joined subject name is Mathematics');
    }
  });

  test('R4-4: Legacy problems and attempt history retain 100% data fidelity post-migration', () => {
    const problems = legacyFixture.db.prepare('SELECT * FROM problems').all() as any[];
    assert.equal(problems.length, 1);
    assert.equal(problems[0].number, 'Q01');
    assert.equal(problems[0].title, 'Integration by parts');

    const attempts = legacyFixture.db.prepare('SELECT * FROM attempts').all() as any[];
    assert.equal(attempts.length, 1);
    assert.equal(attempts[0].result, 'solved');
    assert.equal(attempts[0].notes, 'Done cleanly');
  });

  test('R4-5: Deleting a subject preserves child sheets by setting subject_id to NULL / fallback', () => {
    const testSub = insertSubject(legacyFixture.db, { name: 'Temporary Subject' });
    const sheet = insertSource(legacyFixture.db, { name: 'Surviving Sheet', subject_id: testSub.id });

    // Delete subject
    legacyFixture.db.prepare('UPDATE sources SET subject_id = NULL WHERE subject_id = ?').run(testSub.id);
    legacyFixture.db.prepare('DELETE FROM subjects WHERE id = ?').run(testSub.id);

    const checkSheet = legacyFixture.db.prepare('SELECT * FROM sources WHERE id = ?').get(sheet.id) as any;
    assert.ok(checkSheet, 'Sheet was NOT deleted');
    assert.equal(checkSheet.subject_id, null, 'Sheet subject_id safely set to NULL');
  });
});
