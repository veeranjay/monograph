import { db } from '../db.js';

export interface AnalyticsSummary {
  totalProblemsAttempted: number;
  totalAttempts: number;
  totalSolved: number;
  totalPartial: number;
  totalFailed: number;
  totalSkipped: number;
  solveRate: number; // percentage
  recognitionRate: number; // percentage
  independentSolveRate: number; // percentage
  averageTimeSeconds: number;
  resultBreakdown: {
    solved: number;
    partial: number;
    failed: number;
    skipped: number;
  };
  recognitionBreakdown: {
    immediately: number;
    after_thinking: number;
    didnt_recognize: number;
    not_sure: number;
  };
  helpBreakdown: {
    none: number;
    hint: number;
    solution: number;
    someone_helped: number;
  };
  tagFriction: {
    tagId: string;
    tagName: string;
    totalAttempts: number;
    failedAttempts: number;
    failureRate: number;
  }[];
  commonMistakes: {
    content: string;
    count: number;
    latestProblemNumber?: string;
    latestSourceName?: string;
  }[];
  commonTechniques: {
    content: string;
    count: number;
    latestProblemNumber?: string;
    latestSourceName?: string;
  }[];
  mostUsedTags: {
    id: string;
    name: string;
    count: number;
  }[];
}

export function getAnalytics(sourceId?: string, subjectId?: string): AnalyticsSummary {
  let attemptsQuery = `
    SELECT a.*, p.source_id, p.number as problem_number, s.name as source_name, s.subject_id
    FROM attempts a
    JOIN problems p ON p.id = a.problem_id
    JOIN sources s ON s.id = p.source_id
  `;
  const params: any[] = [];
  if (sourceId) {
    attemptsQuery += ' WHERE p.source_id = ?';
    params.push(sourceId);
  } else if (subjectId) {
    attemptsQuery += ' WHERE s.subject_id = ?';
    params.push(subjectId);
  }

  const attempts = db.prepare(attemptsQuery).all(...params) as any[];

  // Distinct problems attempted
  const uniqueProblemIds = new Set(attempts.map(a => a.problem_id));
  const totalProblemsAttempted = uniqueProblemIds.size;
  const totalAttempts = attempts.length;

  let totalSolved = 0;
  let totalPartial = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  let recognizedCount = 0;
  let recognitionRecordedCount = 0;
  let immediatelyCount = 0;
  let afterThinkingCount = 0;
  let didntRecognizeCount = 0;
  let notSureCount = 0;

  let independentSolvedCount = 0;
  let helpNone = 0;
  let helpHint = 0;
  let helpSolution = 0;
  let helpSomeone = 0;

  let totalTime = 0;
  let timeCount = 0;

  for (const a of attempts) {
    if (a.result === 'solved') totalSolved++;
    else if (a.result === 'partial') totalPartial++;
    else if (a.result === 'failed') totalFailed++;
    else if (a.result === 'skipped') totalSkipped++;

    if (a.recognition) {
      recognitionRecordedCount++;
      if (a.recognition === 'recognized_immediately') {
        immediatelyCount++;
        recognizedCount++;
      } else if (a.recognition === 'recognized_after_thinking') {
        afterThinkingCount++;
        recognizedCount++;
      } else if (a.recognition === 'didnt_recognize') {
        didntRecognizeCount++;
      } else if (a.recognition === 'not_sure') {
        notSureCount++;
      }
    }

    if (a.help) {
      if (a.help === 'none') helpNone++;
      else if (a.help === 'hint') helpHint++;
      else if (a.help === 'solution') helpSolution++;
      else if (a.help === 'someone_helped') helpSomeone++;
    }

    if (a.result === 'solved' && (!a.help || a.help === 'none')) {
      independentSolvedCount++;
    }

    if (a.time_seconds && a.time_seconds > 0) {
      totalTime += a.time_seconds;
      timeCount++;
    }
  }

  const completedAttempts = totalSolved + totalPartial + totalFailed;
  const solveRate = completedAttempts > 0 ? Math.round((totalSolved / completedAttempts) * 100) : 0;
  const recognitionRate = recognitionRecordedCount > 0 ? Math.round((recognizedCount / recognitionRecordedCount) * 100) : 0;
  const independentSolveRate = totalSolved > 0 ? Math.round((independentSolvedCount / totalSolved) * 100) : 0;
  const averageTimeSeconds = timeCount > 0 ? Math.round(totalTime / timeCount) : 0;

  // Tag failure breakdown
  // Find all tags associated with problems/attempts and compute failure rates
  const tagFilter = sourceId ? 'WHERE p.source_id = ?' : (subjectId ? 'WHERE s.subject_id = ?' : '');
  const tagParams = sourceId ? [sourceId] : (subjectId ? [subjectId] : []);

  const tagStatsQuery = `
    SELECT 
      t.id as tagId, 
      t.name as tagName, 
      COUNT(a.id) as totalAttempts,
      SUM(CASE WHEN a.result = 'failed' THEN 1 ELSE 0 END) as failedAttempts
    FROM tags t
    JOIN (
      SELECT pt.tag_id, pt.problem_id, NULL as attempt_id FROM problem_tags pt
      UNION ALL
      SELECT at.tag_id, a.problem_id, at.attempt_id FROM attempt_tags at JOIN attempts a ON a.id = at.attempt_id
    ) combined ON combined.tag_id = t.id
    JOIN problems p ON p.id = combined.problem_id
    JOIN sources s ON s.id = p.source_id
    JOIN attempts a ON a.problem_id = p.id AND (combined.attempt_id IS NULL OR combined.attempt_id = a.id)
    ${tagFilter}
    GROUP BY t.id, t.name
    HAVING totalAttempts >= 1
    ORDER BY failedAttempts DESC, totalAttempts DESC
  `;
  const tagStatsRows = db.prepare(tagStatsQuery).all(...tagParams) as any[];
  const tagFriction = tagStatsRows.map(r => {
    const total = Number(r.totalAttempts || 0);
    const failed = Number(r.failedAttempts || 0);
    return {
      tagId: r.tagId,
      tagName: r.tagName,
      totalAttempts: total,
      failedAttempts: failed,
      failureRate: total > 0 ? Math.round((failed / total) * 100) : 0,
    };
  }).sort((a, b) => b.failureRate - a.failureRate);

  // Common mistakes (from observations AND attempts with Meta Tag 'Mistake')
  const itemFilter = sourceId ? 'AND p.source_id = ?' : (subjectId ? 'AND s.subject_id = ?' : '');
  const itemParam = sourceId || subjectId;
  const itemParams = itemParam ? [itemParam, itemParam] : [];

  let mistakesQuery = `
    SELECT content, COUNT(*) as count, MAX(problem_number) as latestProblemNumber, MAX(source_name) as latestSourceName
    FROM (
      SELECT o.content, p.number as problem_number, s.name as source_name
      FROM observations o
      JOIN problems p ON p.id = o.problem_id
      JOIN sources s ON s.id = p.source_id
      WHERE o.type = 'mistake'
      ${itemFilter}
      UNION ALL
      SELECT a.notes as content, p.number as problem_number, s.name as source_name
      FROM attempts a
      JOIN problems p ON p.id = a.problem_id
      JOIN sources s ON s.id = p.source_id
      WHERE a.notes IS NOT NULL AND a.notes != '' AND a.meta_tags LIKE '%Mistake%'
      ${itemFilter}
    )
    GROUP BY content
    ORDER BY count DESC
    LIMIT 10
  `;
  const commonMistakes = db.prepare(mistakesQuery).all(...itemParams) as any[];

  // Common techniques (from observations AND attempts with Meta Tag 'Technique' or 'Insight')
  let techniquesQuery = `
    SELECT content, COUNT(*) as count, MAX(problem_number) as latestProblemNumber, MAX(source_name) as latestSourceName
    FROM (
      SELECT o.content, p.number as problem_number, s.name as source_name
      FROM observations o
      JOIN problems p ON p.id = o.problem_id
      JOIN sources s ON s.id = p.source_id
      WHERE o.type = 'technique'
      ${itemFilter}
      UNION ALL
      SELECT a.notes as content, p.number as problem_number, s.name as source_name
      FROM attempts a
      JOIN problems p ON p.id = a.problem_id
      JOIN sources s ON s.id = p.source_id
      WHERE a.notes IS NOT NULL AND a.notes != '' AND (a.meta_tags LIKE '%Technique%' OR a.meta_tags LIKE '%Insight%')
      ${itemFilter}
    )
    GROUP BY content
    ORDER BY count DESC
    LIMIT 10
  `;
  const commonTechniques = db.prepare(techniquesQuery).all(...itemParams) as any[];

  // Most used tags (both problem tags and heuristic tags)
  const tagListFilter = sourceId ? 'WHERE p.source_id = ?' : (subjectId ? 'WHERE s.subject_id = ?' : '');
  const tagListParams = sourceId ? [sourceId] : (subjectId ? [subjectId] : []);
  const mostUsedTagsQuery = `
    SELECT t.id, t.name, COUNT(*) as count
    FROM tags t
    JOIN (
      SELECT pt.tag_id, pt.problem_id FROM problem_tags pt
      UNION ALL
      SELECT at.tag_id, a.problem_id FROM attempt_tags at JOIN attempts a ON a.id = at.attempt_id
    ) combined ON combined.tag_id = t.id
    JOIN problems p ON p.id = combined.problem_id
    JOIN sources s ON s.id = p.source_id
    ${tagListFilter}
    GROUP BY t.id, t.name
    ORDER BY count DESC
    LIMIT 10
  `;
  const mostUsedTags = db.prepare(mostUsedTagsQuery).all(...tagListParams) as any[];

  return {
    totalProblemsAttempted,
    totalAttempts,
    totalSolved,
    totalPartial,
    totalFailed,
    totalSkipped,
    solveRate,
    recognitionRate,
    independentSolveRate,
    averageTimeSeconds,
    resultBreakdown: {
      solved: totalSolved,
      partial: totalPartial,
      failed: totalFailed,
      skipped: totalSkipped,
    },
    recognitionBreakdown: {
      immediately: immediatelyCount,
      after_thinking: afterThinkingCount,
      didnt_recognize: didntRecognizeCount,
      not_sure: notSureCount,
    },
    helpBreakdown: {
      none: helpNone,
      hint: helpHint,
      solution: helpSolution,
      someone_helped: helpSomeone,
    },
    tagFriction,
    commonMistakes,
    commonTechniques,
    mostUsedTags,
  };
}
