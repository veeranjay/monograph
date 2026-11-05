import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTestDb,
  insertSubject,
  insertSource,
  insertProblem,
  insertAttempt,
  getAllSubjectsWithStats,
  getSubjectById,
  TestDbInstance
} from '../test_harness.js';
import * as subjectsService from '../../src/server/services/subjectsService.js';
import * as sourcesService from '../../src/server/services/sourcesService.js';

// ============================================================================
// TIER 2: Boundary & Corner Cases Test Suite
// Scope: Edge cases, constraint invariants, unicode, extreme lengths,
// cascading, orphaned records, and backward compatibility.
// ============================================================================

describe('Tier 2: Boundary & Corner Cases', () => {
  let fixture: TestDbInstance;

  before(() => {
    fixture = createTestDb({ inMemory: true, seedDefaults: true });
  });

  after(() => {
    fixture.cleanup();
  });

  test('T2-01: Empty subjects handle 0 sheets and 0 problems without division-by-zero or null errors', () => {
    const empty = insertSubject(fixture.db, {
      name: 'Empty Subject Boundary',
      description: 'Contains no sheets or problems'
    });

    const retrieved = getSubjectById(fixture.db, empty.id);
    assert.ok(retrieved);
    assert.equal(retrieved.sheet_count, 0);
    assert.equal(retrieved.problem_count, 0);
    assert.equal(retrieved.attempt_count, 0);
    assert.equal(retrieved.solved_count, 0);
    assert.equal(retrieved.solve_rate, 0);
    assert.deepEqual(retrieved.sources, []);
  });

  test('T2-02: Subject names with extreme lengths (1000+ chars) persist and retrieve intact', () => {
    const longName = 'Mathematics: ' + 'Abstract Algebra & Homological Conjectures '.repeat(25);
    const longDesc = 'A'.repeat(2048);

    const subject = insertSubject(fixture.db, {
      name: longName,
      description: longDesc
    });

    const fetched = getSubjectById(fixture.db, subject.id);
    assert.ok(fetched);
    assert.equal(fetched.name, longName);
    assert.equal(fetched.description, longDesc);
  });

  test('T2-03: Subject names with Unicode, Greek, Math symbols, and Emojis store with full fidelity', () => {
    const unicodeName = '📐 Математика & 物理 (Physics) · $\\mathbb{R}^n \\to \\mathbb{C}$ 🚀';
    const unicodeDesc = 'Vector bundles $\\mathcal{E} \\otimes \\mathcal{F}$ over Riemann surfaces $\\Sigma_g$.';

    const subject = insertSubject(fixture.db, {
      name: unicodeName,
      description: unicodeDesc,
      icon: 'sparkles'
    });

    const fetched = getSubjectById(fixture.db, subject.id);
    assert.ok(fetched);
    assert.equal(fetched.name, unicodeName);
    assert.equal(fetched.description, unicodeDesc);
    assert.equal(fetched.icon, 'sparkles');
  });

  test('T2-04: SQL injection and escape sequence attempts in names and notes are safely neutralized by parameters', () => {
    const maliciousName = `Advanced Calculus'; DROP TABLE subjects; SELECT * FROM sources WHERE ''='`;
    const maliciousNotes = `<script>alert("XSS")</script> -- \\' OR 1=1;`;

    const subject = insertSubject(fixture.db, { name: maliciousName });
    const sheet = insertSource(fixture.db, { name: 'Escape Test Sheet', subject_id: subject.id });
    const problem = insertProblem(fixture.db, { source_id: sheet.id, number: '01' });
    const attempt = insertAttempt(fixture.db, {
      problem_id: problem.id,
      result: 'solved',
      notes: maliciousNotes
    });

    // Ensure subjects table was NOT dropped
    const tableCheck = fixture.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='subjects'").get() as any;
    assert.ok(tableCheck, 'subjects table exists unscathed');

    const fetchedSub = getSubjectById(fixture.db, subject.id);
    assert.equal(fetchedSub?.name, maliciousName);

    const fetchedAttempt = fixture.db.prepare('SELECT notes FROM attempts WHERE id = ?').get(attempt.id) as any;
    assert.equal(fetchedAttempt?.notes, maliciousNotes);
  });

  test('T2-05: Unique constraint violation prevents duplicate subject names', () => {
    const uniqueName = 'Unique Topic ' + Math.random();
    insertSubject(fixture.db, { name: uniqueName });

    assert.throws(() => {
      insertSubject(fixture.db, { name: uniqueName });
    }, /UNIQUE constraint failed: subjects\.name/);
  });

  test('T2-06: Sheets with 0 problems compute 0% solve rate and empty problem lists safely', () => {
    const sub = insertSubject(fixture.db, { name: 'Zero Problems Subject' });
    const emptySheet = insertSource(fixture.db, { name: 'Freshly Created Sheet', subject_id: sub.id });

    const sources = fixture.db.prepare(`
      SELECT s.*, 
        COUNT(DISTINCT p.id) as problem_count,
        COUNT(a.id) as attempt_count,
        SUM(CASE WHEN a.result = 'solved' THEN 1 ELSE 0 END) as solved_count
      FROM sources s
      LEFT JOIN problems p ON p.source_id = s.id
      LEFT JOIN attempts a ON a.problem_id = p.id
      WHERE s.id = ?
      GROUP BY s.id
    `).get(emptySheet.id) as any;

    assert.equal(sources.problem_count, 0);
    assert.equal(sources.attempt_count, 0);
    assert.equal(sources.solved_count, 0);
  });

  test('T2-07: Deleting a subject preserves child sheets by updating subject_id to fallback default', () => {
    const tempSub = insertSubject(fixture.db, { name: 'Deletable Subject' });
    const fallbackSub = insertSubject(fixture.db, { name: 'Fallback Subject' });
    assert.ok(fallbackSub, 'Fallback subject exists');

    const sheet1 = insertSource(fixture.db, { name: 'Orphan Candidate 1', subject_id: tempSub.id });
    const sheet2 = insertSource(fixture.db, { name: 'Orphan Candidate 2', subject_id: tempSub.id });
    const prob = insertProblem(fixture.db, { source_id: sheet1.id, number: '01' });
    insertAttempt(fixture.db, { problem_id: prob.id, result: 'solved' });

    // Safe deletion workflow: reassign sheets to fallback subject, then delete subject
    fixture.db.prepare('UPDATE sources SET subject_id = ? WHERE subject_id = ?').run(fallbackSub.id, tempSub.id);
    fixture.db.prepare('DELETE FROM subjects WHERE id = ?').run(tempSub.id);

    // Verify sheets survive
    const s1 = fixture.db.prepare('SELECT subject_id FROM sources WHERE id = ?').get(sheet1.id) as any;
    const s2 = fixture.db.prepare('SELECT subject_id FROM sources WHERE id = ?').get(sheet2.id) as any;
    assert.equal(s1.subject_id, fallbackSub.id);
    assert.equal(s2.subject_id, fallbackSub.id);

    // Verify problem and attempts survive
    const p = fixture.db.prepare('SELECT * FROM problems WHERE id = ?').get(prob.id) as any;
    assert.ok(p, 'Problem preserved');
    const a = fixture.db.prepare('SELECT * FROM attempts WHERE problem_id = ?').all(prob.id) as any[];
    assert.equal(a.length, 1, 'Attempt preserved');
  });

  test('T2-08: Deleting a sheet cascades to delete problems and attempts (ON DELETE CASCADE)', () => {
    const sub = insertSubject(fixture.db, { name: 'Cascade Subject' });
    const sheet = insertSource(fixture.db, { name: 'Cascade Sheet', subject_id: sub.id });
    const p1 = insertProblem(fixture.db, { source_id: sheet.id, number: '01' });
    const p2 = insertProblem(fixture.db, { source_id: sheet.id, number: '02' });

    insertAttempt(fixture.db, { problem_id: p1.id, result: 'failed' });
    insertAttempt(fixture.db, { problem_id: p1.id, result: 'solved' });
    insertAttempt(fixture.db, { problem_id: p2.id, result: 'solved' });

    // Delete the sheet
    fixture.db.prepare('DELETE FROM sources WHERE id = ?').run(sheet.id);

    const remainingProblems = fixture.db.prepare('SELECT * FROM problems WHERE source_id = ?').all(sheet.id) as any[];
    assert.equal(remainingProblems.length, 0, 'All problems cascaded');

    const remainingAttempts = fixture.db.prepare('SELECT * FROM attempts WHERE problem_id IN (?, ?)').all(p1.id, p2.id) as any[];
    assert.equal(remainingAttempts.length, 0, 'All attempts cascaded');
  });

  test('T2-09: Reassigning sheets between subjects immediately shifts problem count and solve rate', () => {
    const subA = insertSubject(fixture.db, { name: 'Subject Alpha' });
    const subB = insertSubject(fixture.db, { name: 'Subject Beta' });

    const sheet = insertSource(fixture.db, { name: 'Migrating Sheet', subject_id: subA.id });
    const p1 = insertProblem(fixture.db, { source_id: sheet.id, number: '01' });
    const p2 = insertProblem(fixture.db, { source_id: sheet.id, number: '02' });
    insertAttempt(fixture.db, { problem_id: p1.id, result: 'solved' });
    insertAttempt(fixture.db, { problem_id: p2.id, result: 'solved' });

    // Initial stats
    let statsA = getSubjectById(fixture.db, subA.id);
    let statsB = getSubjectById(fixture.db, subB.id);
    assert.equal(statsA?.problem_count, 2);
    assert.equal(statsA?.solve_rate, 100);
    assert.equal(statsB?.problem_count, 0);

    // Reassign sheet to Subject Beta
    fixture.db.prepare('UPDATE sources SET subject_id = ? WHERE id = ?').run(subB.id, sheet.id);

    statsA = getSubjectById(fixture.db, subA.id);
    statsB = getSubjectById(fixture.db, subB.id);
    assert.equal(statsA?.problem_count, 0, 'Subject A lost problems');
    assert.equal(statsA?.solve_rate, 0, 'Subject A solve rate reset to 0');
    assert.equal(statsB?.problem_count, 2, 'Subject B gained problems');
    assert.equal(statsB?.solve_rate, 100, 'Subject B gained 100% solve rate');
  });

  test('T2-10: Complex LaTeX math formulas in attempt notes preserve formatting without distortion', () => {
    const latexNotes = `
      Let $f(z) = \\sum_{n=0}^\\infty a_n z^n$ with radius of convergence $R > 0$.
      By Cauchy's Integral Formula:
      $$f^{(k)}(z_0) = \\frac{k!}{2\\pi i} \\oint_\\gamma \\frac{f(z)}{(z - z_0)^{k+1}} dz$$
      Substitution: $u = \\tan(\\theta/2)$, $dx = \\frac{2 du}{1 + u^2}$.
    `.trim();

    const sheet = insertSource(fixture.db, { name: 'Complex Analysis Sheet' });
    const prob = insertProblem(fixture.db, { source_id: sheet.id, number: '09' });
    const attempt = insertAttempt(fixture.db, {
      problem_id: prob.id,
      result: 'solved',
      notes: latexNotes
    });

    const retrieved = fixture.db.prepare('SELECT notes FROM attempts WHERE id = ?').get(attempt.id) as any;
    assert.equal(retrieved.notes, latexNotes, 'LaTeX string preserved verbatim');
  });

  test('T2-11: Nullable fields in Subject, Source, and Attempt records handle undefined/null without error', () => {
    // Subject with only required name
    const sub = insertSubject(fixture.db, {
      name: 'Barebones Subject',
      description: undefined,
      color: undefined,
      icon: undefined
    });

    // Source with only required name
    const src = insertSource(fixture.db, {
      name: 'Barebones Sheet',
      subject_id: sub.id,
      reference: undefined,
      metadata: undefined
    });

    // Problem with only required fields
    const prob = insertProblem(fixture.db, {
      source_id: src.id,
      number: '99',
      title: undefined,
      reference: undefined
    });

    // Attempt with only required fields
    const att = insertAttempt(fixture.db, {
      problem_id: prob.id,
      result: 'skipped',
      confidence: undefined,
      time_seconds: undefined,
      notes: undefined,
      recognition: undefined,
      help: undefined
    });

    const fetched = fixture.db.prepare(`
      SELECT 
        sub.description as sub_desc,
        s.reference as s_ref,
        p.title as p_title,
        a.notes as a_notes,
        a.confidence as a_conf
      FROM attempts a
      JOIN problems p ON p.id = a.problem_id
      JOIN sources s ON s.id = p.source_id
      JOIN subjects sub ON sub.id = s.subject_id
      WHERE a.id = ?
    `).get(att.id) as any;

    assert.equal(fetched.sub_desc, null);
    assert.equal(fetched.s_ref, null);
    assert.equal(fetched.p_title, null);
    assert.equal(fetched.a_notes, null);
    assert.equal(fetched.a_conf, null);
  });
});
