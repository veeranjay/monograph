import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { initDatabase, setDb, closeDatabase } from '../src/server/db.js';
import * as subjectsService from '../src/server/services/subjectsService.js';
import * as sourcesService from '../src/server/services/sourcesService.js';
import * as problemsService from '../src/server/services/problemsService.js';
import * as attemptsService from '../src/server/services/attemptsService.js';
import * as breadcrumbsService from '../src/server/services/breadcrumbsService.js';

describe('UI Hierarchy & Subject Drill-down Verification', () => {
  let tempDir: string;
  let tempDbPath: string;
  let testDb: DatabaseSync;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'monograph-ui-test-'));
    tempDbPath = path.join(tempDir, 'test.db');
    testDb = initDatabase(tempDbPath);
    setDb(testDb);
  });

  after(() => {
    closeDatabase();
    setDb(null);
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('verifies subjects table starts clean and unpopulated', () => {
    const subjects = subjectsService.getAllSubjects();
    assert.equal(subjects.length, 0, 'Starts unpopulated without mock subjects');
  });

  it('supports creating a subject notebook and adding sheets to it', () => {
    const subName = 'Organic Chemistry ' + crypto.randomUUID().slice(0, 6);
    const newSub = subjectsService.createSubject({
      name: subName,
      description: 'Reaction mechanisms and synthesis',
      color: 'emerald',
    });
    assert.ok(newSub.id);

    const sheet1 = sourcesService.createSource({
      name: 'Mechanisms Sheet 1',
      subject_id: newSub.id,
      type: 'sheet',
    });
    assert.strictEqual(sheet1.subject_id, newSub.id);

    const subjectSheets = sourcesService.getAllSources(newSub.id);
    assert.strictEqual(subjectSheets.length, 1);
    assert.strictEqual(subjectSheets[0].name, 'Mechanisms Sheet 1');
  });

  it('generates spatial breadcrumb context across Subject > Sheet > Problem', () => {
    const subName = 'Algebra Test ' + crypto.randomUUID().slice(0, 6);
    const sub = subjectsService.createSubject({
      name: subName,
    });
    const sheet = sourcesService.createSource({
      name: 'Linear Equations',
      subject_id: sub.id,
    });
    const prob = problemsService.createProblem({
      source_id: sheet.id,
      number: '12',
      title: 'Gauss-Jordan elimination',
    });

    const crumbs = breadcrumbsService.resolveBreadcrumbs('problem', prob.id);
    assert.strictEqual(crumbs.length, 4, 'Breadcrumb should contain: Subjects root, Subject, Sheet, Problem');
    assert.strictEqual(crumbs[0].label, 'Subjects');
    assert.strictEqual(crumbs[1].label, sub.name);
    assert.strictEqual(crumbs[2].label, sheet.name);
    assert.strictEqual(crumbs[3].label, 'Q12');
  });

  it('allows reassigning sheets between subjects seamlessly', () => {
    const sub1 = subjectsService.createSubject({ name: 'Sub A ' + crypto.randomUUID().slice(0, 6) });
    const sub2 = subjectsService.createSubject({ name: 'Sub B ' + crypto.randomUUID().slice(0, 6) });

    const sheet = sourcesService.createSource({
      name: 'Movable Sheet',
      subject_id: sub1.id,
    });
    assert.strictEqual(sheet.subject_id, sub1.id);

    sourcesService.updateSource(sheet.id, { subject_id: sub2.id });
    const updated = sourcesService.getSourceById(sheet.id);
    assert.strictEqual(updated?.subject_id, sub2.id);
    assert.strictEqual(updated?.subject_name, sub2.name);
  });

  it('records attempt with notes and tags cleanly linked to problem and sheet', () => {
    const sub = subjectsService.createSubject({ name: 'Analysis ' + crypto.randomUUID().slice(0, 6) });
    const sheet = sourcesService.createSource({ name: 'Epsilon Delta', subject_id: sub.id });
    const prob = problemsService.createProblem({ source_id: sheet.id, number: '01' });

    const attempt = attemptsService.createAttempt({
      problem_id: prob.id,
      result: 'solved',
      notes: 'Used Archimedean property: $\\epsilon > 0$',
      heuristic_tags: ['Boundary Check', 'Inequality'],
      problem_tags: ['Limits', 'Analysis'],
    });

    assert.strictEqual(attempt.result, 'solved');
    assert.strictEqual(attempt.notes, 'Used Archimedean property: $\\epsilon > 0$');

    const recent = attemptsService.getRecentAttempts(5);
    const found = recent.find((a) => a.id === attempt.id);
    assert.ok(found, 'Attempt found in recent stream');
    assert.strictEqual(found?.problem_number, '01');
    assert.strictEqual(found?.source_name, 'Epsilon Delta');
  });
});
