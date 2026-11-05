import { Problem, Attempt } from '../types/index.js';

/**
 * Copies a string of text to the system clipboard, with fallback for environments
 * without standard clipboard API access.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    textArea.setAttribute('readonly', '');
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch (err) {
    console.error('Failed to copy to clipboard:', err);
    return false;
  }
}

/**
 * Formats a single problem's title/question and latest attempt's notes.
 */
export function formatSingleProblem(problem: {
  number?: string;
  title?: string | null;
  attempts?: Array<{ notes?: string | null; result?: string | null }>;
  latest_notes?: string | null;
  latest_result?: string | null;
}): string {
  const num = (problem.number || '').trim();
  const title = (problem.title || '').trim();

  // Format the header nicely
  let header = '';
  if (num && title) {
    // Avoid duplicate prefixes like "Q1: Q1: ..." or "Q1: Question 1: ..."
    const pattern = new RegExp(`^Q(uestion)?\\s*${num}[:.]?\\s*`, 'i');
    if (pattern.test(title)) {
      header = title;
    } else {
      header = `Q${num}: ${title}`;
    }
  } else if (title) {
    header = title;
  } else if (num) {
    header = `Q${num}`;
  } else {
    header = 'Question';
  }

  // Get latest attempt's notes
  const notes = (problem.attempts?.[0]?.notes ?? problem.latest_notes ?? '').trim();

  if (notes) {
    return `${header}\n\nNotes:\n${notes}`;
  }

  return header;
}

/**
 * Formats multiple problems for bulk copying (e.g. all problems in a sheet).
 */
export function formatBulkProblems(
  source: { name: string; reference?: string | null; subject_name?: string | null },
  problems: Problem[]
): string {
  const lines: string[] = [];

  // Sheet Title
  lines.push(`# ${source.name}`);
  if (source.subject_name) {
    lines.push(`Notebook: ${source.subject_name}`);
  }
  if (source.reference) {
    lines.push(`Reference: ${source.reference}`);
  }
  lines.push('');

  // Individual Problems
  const problemBlocks = problems.map((prob) => {
    const num = (prob.number || '').trim();
    const title = (prob.title || '').trim();

    let heading = '';
    if (num && title) {
      const pattern = new RegExp(`^Q(uestion)?\\s*${num}[:.]?\\s*`, 'i');
      if (pattern.test(title)) {
        heading = `### ${title}`;
      } else {
        heading = `### Q${num}: ${title}`;
      }
    } else if (title) {
      heading = `### ${title}`;
    } else if (num) {
      heading = `### Q${num}`;
    } else {
      heading = `### Question`;
    }

    const blockLines = [heading];

    const result = prob.attempts?.[0]?.result ?? prob.latest_result;
    if (result) {
      const capitalized = result.charAt(0).toUpperCase() + result.slice(1);
      blockLines.push(`Result: ${capitalized}`);
    }

    const notes = (prob.attempts?.[0]?.notes ?? prob.latest_notes ?? '').trim();
    if (notes) {
      blockLines.push('Notes:');
      blockLines.push(notes);
    }

    return blockLines.join('\n');
  });

  lines.push(problemBlocks.join('\n\n---\n\n'));

  return lines.join('\n').trim();
}
