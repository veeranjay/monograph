import { db } from './db.js';
import crypto from 'node:crypto';
import { createSource } from './services/sourcesService.js';
import { createProblem } from './services/problemsService.js';
import { createAttempt } from './services/attemptsService.js';
import { createObservation } from './services/observationsService.js';
import { createCollection, addProblemToCollection } from './services/collectionsService.js';

export function seedDatabase() {
  if (process.env.ALLOW_SEED !== 'true') {
    // Seeding is disabled by default to keep database clean and unpopulated
    return;
  }

  // Check if database is already seeded
  const countSources = db.prepare('SELECT COUNT(*) as count FROM sources').get() as any;
  if (countSources && countSources.count > 0) {
    console.log('Database already seeded. Skipping seed.');
    return;
  }

  console.log('Seeding database with authentic mathematical problem sets...');

  // 1. Create Sources
  const sheet07 = createSource({
    name: 'Integration Sheet 07',
    type: 'sheet',
    reference: 'MIT 18.01 Single Variable Calculus · Autumn Problem Set (Page 3-5)',
  });

  const limitsPractice = createSource({
    name: 'Limits & Continuity Practice',
    type: 'sheet',
    reference: 'Stewart Calculus Chapter 2 & Spivak Exercises',
  });

  const jeeAdvanced = createSource({
    name: 'JEE Advanced 2025 Paper',
    type: 'exam',
    reference: 'Paper 1 Mathematics Section, Physical Booklet Code B',
  });

  // 2. Create Collections
  const reviewCollection = createCollection('Problems to review', 'High priority questions that required multiple attempts or hints.');
  const calculusCollection = createCollection('Calculus', 'Core calculus problems across single variable integration and limits.');

  // 3. Seed Integration Sheet 07 Problems
  const sheet07ProblemsData = [
    { num: '01', title: 'Power Rule and Polynomial Expansion', tags: ['calculus', 'integration', 'algebra'], result: 'solved', rec: 'recognized_immediately', help: 'none', time: 65, note: 'Simple polynomial expansion before integrating:\n\\[\n\\int (3x^2 - 2x + 5)\\,dx = x^3 - x^2 + 5x + C\n\\]' },
    { num: '02', title: 'Exponential and Trigonometric Linear Combination', tags: ['calculus', 'integration'], result: 'solved', rec: 'recognized_immediately', help: 'none', time: 80, note: 'Direct antiderivative:\n\\[\n\\int (e^{2x} + \\sin 3x)\\,dx = \\frac{1}{2}e^{2x} - \\frac{1}{3}\\cos 3x + C\n\\]' },
    { num: '03', title: 'Rational Function with Monomial Denominator', tags: ['calculus', 'integration', 'algebra'], result: 'solved', rec: 'recognized_immediately', help: 'none', time: 95, note: 'Split into individual fractions first:\n\\[\n\\int \\frac{x^3 + 2x^2 + 1}{x}\\,dx = \\int (x^2 + 2x + x^{-1})\\,dx = \\frac{x^3}{3} + x^2 + \\ln|x| + C\n\\]' },
    { num: '04', title: 'Basic U-Substitution with Radical', tags: ['calculus', 'integration', 'substitution'], result: 'partial', rec: 'recognized_after_thinking', help: 'hint', time: 240, note: 'Used substitution $u = 1 - 4x^2$, $du = -8x\\,dx$. Forgot the negative sign factor initially.' },
    { num: '05', title: 'Trigonometric Identity Simplification', tags: ['calculus', 'integration', 'trigonometry'], result: 'solved', rec: 'recognized_immediately', help: 'none', time: 110, note: 'Used half-angle formula:\n\\[\n\\int \\sin^2 x\\,dx = \\int \\frac{1 - \\cos 2x}{2}\\,dx = \\frac{x}{2} - \\frac{\\sin 2x}{4} + C\n\\]' },
    { num: '06', title: 'Integration by Parts: Polynomial × Exponential', tags: ['calculus', 'integration', 'by-parts'], result: 'solved', rec: 'recognized_after_thinking', help: 'none', time: 180, note: 'Tabular method works best for $\\int x^2 e^x\\,dx$:\n\\[\n\\int x^2 e^x\\,dx = (x^2 - 2x + 2)e^x + C\n\\]' },
    { num: '07', title: 'Secant and Tangent Reduction', tags: ['calculus', 'integration', 'trigonometry'], result: 'failed', rec: 'didnt_recognize', help: 'solution', time: 320, note: 'Could not see how to handle $\\int \\sec^3 x\\,dx$. The trick is integration by parts with $u = \\sec x, dv = \\sec^2 x\\,dx$.' },
    { num: '08', title: 'Definite Integral with Symmetric Interval', tags: ['calculus', 'integration', 'symmetry'], result: 'solved', rec: 'recognized_immediately', help: 'none', time: 55, note: 'Integrand is odd function over symmetric interval $[-a, a]$, so integral is identically $0$.' },
    { num: '09', title: 'Partial Fractions with Linear Factors', tags: ['calculus', 'integration', 'partial-fractions', 'algebra'], result: 'solved', rec: 'recognized_after_thinking', help: 'none', time: 210, note: 'Decomposition:\n\\[\n\\frac{1}{x^2 - 5x + 6} = \\frac{1}{(x-2)(x-3)} = \\frac{-1}{x-2} + \\frac{1}{x-3}\n\\]' },
    { num: '10', title: 'Partial Fractions with Irreducible Quadratic', tags: ['calculus', 'integration', 'partial-fractions'], result: 'partial', rec: 'recognized_after_thinking', help: 'hint', time: 290, note: 'Form required $\\frac{Ax+B}{x^2+1} + \\frac{C}{x-1}$. Algebra got messy with equating coefficients.' },
    { num: '11', title: 'Inverse Trigonometric Substitution', tags: ['calculus', 'integration', 'trigonometry', 'substitution'], result: 'solved', rec: 'recognized_after_thinking', help: 'none', time: 190, note: 'Let $x = 3\\sin\\theta$, then $\\sqrt{9 - x^2} = 3\\cos\\theta$.' },
    { num: '12', title: 'Definite Integral: Gaussian Tail Comparison', tags: ['calculus', 'integration'], result: 'skipped', rec: 'not_sure', help: 'none', time: 40, note: 'Skipped to focus on core substitution problems first.' },
    { num: '13', title: 'Weierstrass Half-Angle Substitution', tags: ['calculus', 'integration', 'trigonometry', 'substitution'], result: 'failed', rec: 'didnt_recognize', help: 'solution', time: 360, note: 'Could not integrate $\\int \\frac{1}{2 + \\cos x}\\,dx$. Must use $t = \\tan(x/2)$ substitution.' },
    { num: '14', title: 'Logarithmic Integration by Parts', tags: ['calculus', 'integration', 'by-parts'], result: 'solved', rec: 'recognized_immediately', help: 'none', time: 115, note: 'Set $u = \\ln x, dv = x\\,dx$. Simple and standard.' },
    { num: '15', title: 'Root of Rational Function', tags: ['calculus', 'integration', 'algebra'], result: 'solved', rec: 'recognized_after_thinking', help: 'none', time: 140, note: 'Complete the square inside the radical under denominator.' },
    { num: '16', title: 'Euler Substitution First Kind', tags: ['calculus', 'integration', 'substitution'], result: 'failed', rec: 'didnt_recognize', help: 'hint', time: 410, note: 'Did not recognize algebraic transformation $\\sqrt{x^2+c} = t - x$.' },
    { num: '17', title: 'Definite Integral with Rational Roots', tags: ['calculus', 'integration', 'substitution'], result: 'special_q17', rec: 'multiple', help: 'multiple', time: 250, note: 'See multi-attempt history.' },
    { num: '18', title: 'Trigonometric Integral with Odd Sine Powers', tags: ['calculus', 'integration', 'trigonometry', 'substitution'], result: 'solved', rec: 'recognized_immediately', help: 'none', time: 95, note: 'Factor out $\\sin x\\,dx$ and substitute $u = \\cos x$:\n\\[\n\\int \\sin^3 x\\cos^2 x\\,dx = \\int (1-\\cos^2 x)\\cos^2 x \\sin x\\,dx = -\\int (u^2 - u^4)\\,du\n\\]' },
    { num: '19', title: 'Arc Length Integral Formulation', tags: ['calculus', 'integration'], result: 'solved', rec: 'recognized_after_thinking', help: 'none', time: 175, note: 'Formulated arc length $L = \\int_a^b \\sqrt{1 + [f\'(x)]^2}\\,dx$, perfectly completed square inside root.' },
    { num: '20', title: 'Improper Integral with Discontinuity at Origin', tags: ['calculus', 'integration', 'limits'], result: 'partial', rec: 'recognized_after_thinking', help: 'hint', time: 220, note: 'Split interval at 0: $\\int_{-1}^1 \\frac{1}{x^{2/3}}\\,dx = \\lim_{t \\to 0^-}\\int_{-1}^t + \\lim_{t \\to 0^+}\\int_t^1$.' },
  ];

  for (const item of sheet07ProblemsData) {
    const prob = createProblem({
      source_id: sheet07.id,
      number: item.num,
      title: item.title,
      tags: item.tags,
    });

    if (item.num === '17') {
      // Q17 has multi-attempt history illustrating the core user journey!
      // Attempt 1: Failed on Sep 17
      const att1 = createAttempt({
        problem_id: prob.id,
        result: 'failed',
        recognition: 'didnt_recognize',
        help: 'none',
        confidence: 1,
        time_seconds: 310,
        notes: 'Tried integration by parts on $\\int \\frac{2x}{x^2+1}\\,dx$, which led to circular terms and algebraic drift.\n\nFailed to spot that the numerator is the exact derivative of the denominator.',
        tags: ['calculus', 'integration', 'substitution'],
        observation: {
          type: 'mistake',
          content: 'Failed to recognize simple derivative relationship between numerator and denominator before starting by-parts.',
        },
      });
      // Backdate att1
      db.prepare('UPDATE attempts SET created_at = ?, finished_at = ? WHERE id = ?')
        .run('2026-09-17T09:15:00.000Z', '2026-09-17T09:20:10.000Z', att1.id);

      // Attempt 2: Solved with hint on Sep 20
      const att2 = createAttempt({
        problem_id: prob.id,
        result: 'partial',
        recognition: 'recognized_after_thinking',
        help: 'hint',
        confidence: 3,
        time_seconds: 180,
        notes: 'Hint suggested setting $u = x^2+1$. Then $du = 2x\\,dx$.\n\nSubstitution gives:\n\\[\n\\int \\frac{2x}{x^2+1}\\,dx = \\int \\frac{1}{u}\\,du = \\ln|u| + C = \\ln(x^2+1) + C\n\\]\nWorked smoothly once the substitution was pointed out.',
        tags: ['calculus', 'integration', 'substitution'],
        observation: {
          type: 'technique',
          content: 'Look for $u = g(x)$ whenever $g\'(x)$ is present as a multiplicative factor in the integrand.',
        },
      });
      db.prepare('UPDATE attempts SET created_at = ?, finished_at = ? WHERE id = ?')
        .run('2026-09-20T14:30:00.000Z', '2026-09-20T14:33:00.000Z', att2.id);

      // Attempt 3: Solved independently on Sep 24
      const att3 = createAttempt({
        problem_id: prob.id,
        result: 'solved',
        recognition: 'recognized_immediately',
        help: 'none',
        confidence: 5,
        time_seconds: 45,
        notes: 'Immediate recognition of $\\frac{g\'(x)}{g(x)}$ form.\n\\[\n\\int \\frac{2x}{x^2+1}\\,dx = \\ln(x^2+1) + C\n\\]\nCompleted cleanly in under a minute without reference.',
        tags: ['calculus', 'integration', 'substitution'],
        observation: {
          type: 'insight',
          content: 'Whenever numerator is the derivative of the denominator, the antiderivative is simply $\\ln|\\text{denominator}|$.',
        },
      });
      db.prepare('UPDATE attempts SET created_at = ?, finished_at = ? WHERE id = ?')
        .run('2026-09-24T16:00:00.000Z', '2026-09-24T16:00:45.000Z', att3.id);

      // Add Q17 to "Problems to review"
      addProblemToCollection(reviewCollection.id, prob.id);
      addProblemToCollection(calculusCollection.id, prob.id);
    } else {
      // Normal single attempt for this problem
      createAttempt({
        problem_id: prob.id,
        result: item.result as any,
        recognition: item.rec as any,
        help: item.help as any,
        confidence: item.result === 'solved' ? 4 : (item.result === 'partial' ? 2 : 1),
        time_seconds: item.time,
        notes: item.note,
        tags: item.tags,
      });

      if (item.result === 'failed' || item.result === 'partial') {
        addProblemToCollection(reviewCollection.id, prob.id);
      }
      addProblemToCollection(calculusCollection.id, prob.id);
    }
  }

  // 4. Seed Limits Practice Problems (10 problems)
  const limitsProblems = [
    { num: '01', title: 'Standard Polynomial Factorization Limit', tags: ['limits', 'algebra'], result: 'solved', rec: 'recognized_immediately', help: 'none', time: 45, note: 'Cancel $(x-2)$ factor:\n\\[\n\\lim_{x \\to 2} \\frac{x^2 - 4}{x - 2} = \\lim_{x \\to 2} (x+2) = 4\n\\]' },
    { num: '02', title: 'Conjugate Radical Simplification', tags: ['limits', 'algebra'], result: 'solved', rec: 'recognized_immediately', help: 'none', time: 70, note: 'Multiply top and bottom by conjugate $(\\sqrt{x+4} + 2)$.' },
    { num: '03', title: 'Fundamental Trigonometric Limit', tags: ['limits', 'trigonometry'], result: 'solved', rec: 'recognized_immediately', help: 'none', time: 40, note: 'Direct use of $\\lim_{x \\to 0} \\frac{\\sin ax}{bx} = \\frac{a}{b}$.' },
    { num: '04', title: 'Squeeze Theorem with Oscillating Sine', tags: ['limits'], result: 'solved', rec: 'recognized_after_thinking', help: 'none', time: 120, note: 'Bounded $-1 \\le \\sin(1/x) \\le 1$, so $-x^2 \\le x^2\\sin(1/x) \\le x^2$. By squeeze theorem, limit is $0$.' },
    { num: '05', title: 'Limit at Infinity with Dominant Degree', tags: ['limits', 'algebra'], result: 'solved', rec: 'recognized_immediately', help: 'none', time: 50, note: 'Ratio of leading coefficients gives $3/5$.' },
    { num: '06', title: 'Indeterminate Form 0/0 Requiring L’Hopital', tags: ['limits', 'calculus'], result: 'solved', rec: 'recognized_after_thinking', help: 'none', time: 130, note: 'Differentiate numerator and denominator:\n\\[\n\\lim_{x \\to 0} \\frac{e^x - 1 - x}{x^2} = \\lim_{x \\to 0} \\frac{e^x - 1}{2x} = \\lim_{x \\to 0} \\frac{e^x}{2} = \\frac{1}{2}\n\\]' },
    { num: '07', title: 'Indeterminate Exponential Form 1^∞', tags: ['limits', 'algebra'], result: 'failed', rec: 'didnt_recognize', help: 'solution', time: 260, note: 'Failed to take the natural logarithm first:\n\\[\ny = \\lim_{x \\to 0} (1 + 2x)^{1/x} \\implies \\ln y = \\lim_{x \\to 0} \\frac{\\ln(1+2x)}{x} = 2 \\implies y = e^2\n\\]' },
    { num: '08', title: 'Piecewise Continuity at Boundary', tags: ['limits', 'algebra'], result: 'partial', rec: 'recognized_after_thinking', help: 'hint', time: 160, note: 'Left hand limit and right hand limit must match $f(c)$. Solved for parameter $k=3$.' },
  ];

  for (const lp of limitsProblems) {
    const prob = createProblem({
      source_id: limitsPractice.id,
      number: lp.num,
      title: lp.title,
      tags: lp.tags,
    });
    createAttempt({
      problem_id: prob.id,
      result: lp.result as any,
      recognition: lp.rec as any,
      help: lp.help as any,
      confidence: lp.result === 'solved' ? 4 : 2,
      time_seconds: lp.time,
      notes: lp.note,
      tags: lp.tags,
    });
    if (lp.result === 'failed') {
      createObservation({
        problem_id: prob.id,
        type: 'mistake',
        content: 'Forgot to take natural logarithm on indeterminate power $1^\\infty$ before evaluating limit.',
      });
      addProblemToCollection(reviewCollection.id, prob.id);
    }
  }

  // 5. Seed JEE Advanced 2025 Paper Problems (6 problems)
  const jeeProblems = [
    { num: '01', title: 'Definite Integral with King\'s Property', tags: ['integration', 'calculus', 'trigonometry'], result: 'solved', rec: 'recognized_immediately', help: 'none', time: 140, note: 'King\'s property:\n\\[\n\\int_a^b f(x)\\,dx = \\int_a^b f(a+b-x)\\,dx\n\\]\nAdding the two expressions eliminates the $\\sin x + \\cos x$ denominator.' },
    { num: '02', title: 'Functional Equation and Derivative Definition', tags: ['calculus', 'algebra'], result: 'partial', rec: 'recognized_after_thinking', help: 'hint', time: 290, note: 'Formulated $f\'(x) = \\lim_{h \\to 0} \\frac{f(x+h) - f(x)}{h}$. Differential equation $f\'(x) = 2f(x)$ yields $f(x) = C e^{2x}$.' },
    { num: '03', title: 'Matrix Eigenvalues and Orthogonal Transformation', tags: ['algebra'], result: 'failed', rec: 'didnt_recognize', help: 'solution', time: 380, note: 'Calculation error during characteristic polynomial expansion $\\det(A - \\lambda I) = 0$.' },
    { num: '04', title: 'Area Enclosed by Parabolas with Oblique Axis', tags: ['calculus', 'integration', 'algebra'], result: 'solved', rec: 'recognized_after_thinking', help: 'none', time: 210, note: 'Rotate coordinates by $\\pi/4$ to align axes, then standard $\\int (y_1 - y_2)\\,dx$.' },
  ];

  for (const jp of jeeProblems) {
    const prob = createProblem({
      source_id: jeeAdvanced.id,
      number: jp.num,
      title: jp.title,
      tags: jp.tags,
    });
    createAttempt({
      problem_id: prob.id,
      result: jp.result as any,
      recognition: jp.rec as any,
      help: jp.help as any,
      confidence: jp.result === 'solved' ? 4 : 1,
      time_seconds: jp.time,
      notes: jp.note,
      tags: jp.tags,
    });
    if (jp.result === 'solved') {
      createObservation({
        problem_id: prob.id,
        type: 'technique',
        content: 'Use King\'s rule $\\int_a^b f(x)dx = \\int_a^b f(a+b-x)dx$ for symmetric trigonometric fractions.',
      });
    } else if (jp.result === 'failed') {
      createObservation({
        problem_id: prob.id,
        type: 'mistake',
        content: 'Lost negative sign when expanding $3 \\times 3$ determinant along second row.',
      });
      addProblemToCollection(reviewCollection.id, prob.id);
    }
  }

  console.log('Seed completed successfully!');
}

// If executed directly
if (process.argv[1]?.endsWith('seed.ts')) {
  seedDatabase();
  process.exit(0);
}
