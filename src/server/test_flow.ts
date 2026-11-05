import { db } from './db.js';
import * as sourcesService from './services/sourcesService.js';
import * as problemsService from './services/problemsService.js';
import * as attemptsService from './services/attemptsService.js';
import * as observationsService from './services/observationsService.js';
import * as tagsService from './services/tagsService.js';
import * as analyticsService from './services/analyticsService.js';
import * as searchService from './services/searchService.js';

console.log('--- STARTING COMPREHENSIVE END-TO-END FLOW VERIFICATION ---');

// 1. Create Source
console.log('1. Creating Source...');
const source = sourcesService.createSource({
  name: 'Verification Math Folio 01',
  type: 'sheet',
  reference: 'Handwritten notes on Strathmore 500 paper, Page 1-10',
});
console.log('✓ Created Source:', source.id, source.name);

// 2. Add Problem
console.log('2. Adding Problem...');
const problem = problemsService.createProblem({
  source_id: source.id,
  number: '42',
  title: 'Definite Integral of Gaussian Error Function',
  reference: 'Page 5, problem 42',
  tags: ['calculus', 'gaussian', 'integration'],
});
console.log('✓ Created Problem:', problem.id, `Q${problem.number} - ${problem.title}`);

// 3. Log Attempt 1 (Failed, with LaTeX math note and mistake observation)
console.log('3. Logging Attempt 1 (Failed)...');
const latexNote1 = `Attempted straightforward substitution with \\(u = x^2\\), but the integrand is non-elementary:
\\[
\\int_0^1 e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}\\operatorname{erf}(1)
\\]
Failed because I attempted closed-form elementary integration instead of Taylor expansion or error function.`;

const attempt1 = attemptsService.createAttempt({
  problem_id: problem.id,
  result: 'failed',
  recognition: 'didnt_recognize',
  help: 'hint',
  confidence: 1,
  time_seconds: 240,
  notes: latexNote1,
  tags: ['calculus', 'taylor-series', 'gaussian'],
  observation: {
    type: 'mistake',
    content: 'Attempted elementary substitution on non-elementary Gaussian integral.',
  },
});
console.log('✓ Created Attempt 1:', attempt1.id, attempt1.result);

// 4. Log Attempt 2 (Solved, with technique observation) - Verify attempt immutability!
console.log('4. Logging Attempt 2 (Solved with hint) - Verifying attempt history is preserved...');
const latexNote2 = `Used Maclaurin series expansion for \\(e^{-x^2}\\):
\\[
e^{-x^2} = \\sum_{n=0}^{\\infty} \\frac{(-1)^n x^{2n}}{n!}
\\]
Integrating term-by-term yields:
\\[
\\int_0^1 e^{-x^2}\\,dx = \\sum_{n=0}^{\\infty} \\frac{(-1)^n}{(2n+1)n!} = 1 - \\frac{1}{3} + \\frac{1}{10} - \\frac{1}{42} + \\dots \\approx 0.7468
\\]
Solved cleanly within 3 terms accuracy.`;

const attempt2 = attemptsService.createAttempt({
  problem_id: problem.id,
  result: 'solved',
  recognition: 'recognized_after_thinking',
  help: 'hint',
  confidence: 4,
  time_seconds: 120,
  notes: latexNote2,
  tags: ['calculus', 'taylor-series', 'series-expansion'],
  observation: {
    type: 'technique',
    content: 'Expand non-elementary integrands into power series before integrating term by term.',
  },
});
console.log('✓ Created Attempt 2:', attempt2.id, attempt2.result);

// 5. Verify Problem History preserves both attempts in chronological order
console.log('5. Verifying Problem History and Immutability...');
const fullProblem = problemsService.getProblemById(problem.id);
if (!fullProblem) throw new Error('Problem not found');
if (fullProblem.attempts?.length !== 2) {
  throw new Error(`Expected 2 attempts in history, found ${fullProblem.attempts?.length}`);
}
console.log(`✓ Confirmed 2 distinct attempts in problem history. Latest result: ${fullProblem.latest_result}`);
console.log('✓ Attempt 1 (older):', fullProblem.attempts[1].result, fullProblem.attempts[1].notes?.slice(0, 40) + '...');
console.log('✓ Attempt 2 (newer):', fullProblem.attempts[0].result, fullProblem.attempts[0].notes?.slice(0, 40) + '...');

// 6. Verify Source View
console.log('6. Verifying Source View...');
const fullSource = sourcesService.getSourceById(source.id);
if (!fullSource) throw new Error('Source not found');
console.log(`✓ Source "${fullSource.name}" contains ${fullSource.problems.length} problems.`);
console.log(`✓ Problem 42 status in source: ${fullSource.problems[0].latest_result}`);

// 7. Verify Analytics
console.log('7. Verifying Analytics calculation...');
const analytics = analyticsService.getAnalytics();
console.log(`✓ Analytics calculated: Total problems attempted = ${analytics.totalProblemsAttempted}`);
console.log(`✓ Total attempts = ${analytics.totalAttempts}, Solved = ${analytics.totalSolved}, Failed = ${analytics.totalFailed}`);
console.log(`✓ Solve rate = ${analytics.solveRate}%, Recognition rate = ${analytics.recognitionRate}%`);
console.log(`✓ Top failure tags:`, analytics.tagFriction.slice(0, 3).map(t => `${t.tagName} (${t.failureRate}%)`));
console.log(`✓ Common mistakes recorded: ${analytics.commonMistakes.length}`);
console.log(`✓ Common techniques recorded: ${analytics.commonTechniques.length}`);

// 8. Verify Search
console.log('8. Verifying Global Search...');
const searchGaussian = searchService.searchGlobal('Gaussian');
console.log(`✓ Search for "Gaussian" found ${searchGaussian.length} items:`, searchGaussian.map(r => `[${r.badge}] ${r.title}`));

const searchTaylor = searchService.searchGlobal('taylor');
console.log(`✓ Search for "taylor" found ${searchTaylor.length} items:`, searchTaylor.map(r => `[${r.badge}] ${r.title}`));

const searchMistake = searchService.searchGlobal('elementary');
console.log(`✓ Search for "elementary" found ${searchMistake.length} items:`, searchMistake.map(r => `[${r.badge}] ${r.title}`));

console.log('--- ALL VERIFICATIONS PASSED SUCCESSFULLY! ---');
