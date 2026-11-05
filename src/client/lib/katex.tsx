import React from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

interface MathViewProps {
  content?: string | null;
  className?: string;
}

export const MathView: React.FC<MathViewProps> = ({ content, className = '' }) => {
  if (!content || !content.trim()) {
    return <span className="text-outline/60 italic text-sm">No notes recorded.</span>;
  }

  try {
    const renderedElements = parseMarkdownWithMath(content);
    return (
      <div className={`prose-sm leading-relaxed text-on-surface select-text ${className}`}>
        {renderedElements}
      </div>
    );
  } catch (e) {
    // Fallback: render plain text so the screen never goes blank from a renderer crash
    return (
      <div className={`prose-sm leading-relaxed text-on-surface select-text whitespace-pre-wrap ${className}`}>
        {content}
      </div>
    );
  }
};

export const KATEX_ACADEMIC_MACROS: Record<string, string> = {
  '\\R': '\\mathbb{R}',
  '\\Z': '\\mathbb{Z}',
  '\\N': '\\mathbb{N}',
  '\\Q': '\\mathbb{Q}',
  '\\C': '\\mathbb{C}',
  '\\P': '\\mathbb{P}',
  '\\E': '\\mathbb{E}',
  '\\lcm': '\\operatorname{lcm}',
  '\\gcd': '\\operatorname{gcd}',
  '\\deg': '\\operatorname{deg}',
  '\\dim': '\\operatorname{dim}',
  '\\ker': '\\operatorname{ker}',
  '\\rank': '\\operatorname{rank}',
  '\\tr': '\\operatorname{tr}',
  '\\det': '\\operatorname{det}',
  '\\mod': '\\operatorname{mod}',
  '\\eps': '\\varepsilon',
  '\\abs': '\\left|#1\\right|',
  '\\norm': '\\left\\|#1\\right\\|',
  '\\diff': '\\mathrm{d}',
  '\\sgn': '\\operatorname{sgn}',
};

export function renderMathSafely(math: string, displayMode: boolean, extraMacros?: Record<string, string>): string {
  try {
    let clean = math.trim();
    // If math contains & alignment operator and isn't already inside an aligned or matrix environment, wrap in aligned
    if (clean.includes('&') && !/\\begin\{(aligned|matrix|bmatrix|pmatrix|vmatrix|cases|array)\}/.test(clean)) {
      clean = `\\begin{aligned}\n${clean}\n\\end{aligned}`;
    }
    // Convert align* or align to aligned (KaTeX does not support top-level align outside display)
    clean = clean
      .replace(/\\begin\{align\*?\}/g, '\\begin{aligned}')
      .replace(/\\end\{align\*?\}/g, '\\end{aligned}')
      .replace(/\\label\{[^}]*\}/g, '')
      .replace(/\\tag\{[^}]*\}/g, '')
      .replace(/\\nonumber/g, '');

    return katex.renderToString(clean, {
      displayMode,
      throwOnError: false,
      strict: false,
      trust: false,
      macros: { ...KATEX_ACADEMIC_MACROS, ...extraMacros },
    });
  } catch (e: any) {
    return `<span class="text-error font-mono text-xs">[Math Error: ${escapeHtml(e.message || math)}]</span>`;
  }
}

function escapeHtml(str: string) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function parseMarkdownWithMath(text: string): React.ReactNode[] {
  // Normalize line breaks
  const normalized = text.replace(/\r\n/g, '\n');

  // Split text by display math blocks first: \[ ... \] or $$ ... $$
  const displayRegex = /(\\\[[\s\S]*?\\\]|\$\$[\s\S]*?\$\$)/g;
  const parts = normalized.split(displayRegex);

  const nodes: React.ReactNode[] = [];

  parts.forEach((part, idx) => {
    if (!part) return;

    // Check if display math
    if (part.startsWith('\\[') && part.endsWith('\\]')) {
      const math = part.slice(2, -2);
      const html = renderMathSafely(math, true);
      nodes.push(
        <div
          key={`display-${idx}`}
          className="my-3 overflow-x-auto text-center py-1"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    } else if (part.startsWith('$$') && part.endsWith('$$') && part.length >= 4) {
      const math = part.slice(2, -2);
      const html = renderMathSafely(math, true);
      nodes.push(
        <div
          key={`display-dollar-${idx}`}
          className="my-3 overflow-x-auto text-center py-1"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    } else {
      // Regular text/markdown that may contain lists, headers, quotes, inline math
      const blockParsed = parseBlockMarkdown(part, idx);
      nodes.push(<React.Fragment key={`text-block-${idx}`}>{blockParsed}</React.Fragment>);
    }
  });

  return nodes;
}

/**
 * Robust line-by-line block lexer for Markdown documents.
 * Correctly groups consecutive list items into <ul> or <ol>,
 * consecutive blockquote lines into <blockquote>, headings into <h2-h4>,
 * and paragraphs with single newline <br> support.
 */
function parseBlockMarkdown(text: string, blockKey: number): React.ReactNode[] {
  const rawLines = text.split('\n');
  const elements: React.ReactNode[] = [];

  let i = 0;
  let elementIdx = 0;

  while (i < rawLines.length) {
    const line = rawLines[i];
    const trimmed = line.trim();

    // 1. Skip empty lines
    if (!trimmed) {
      i++;
      continue;
    }

    // 2. Headings (#, ##, ###)
    if (/^#{1,3}\s+/.test(trimmed)) {
      if (trimmed.startsWith('### ')) {
        elements.push(
          <h4 key={`h4-${blockKey}-${elementIdx++}`} className="font-serif font-medium text-base text-on-surface mt-3 mb-1">
            {renderInlineSpans(trimmed.slice(4), `h4-${blockKey}-${elementIdx}`)}
          </h4>
        );
      } else if (trimmed.startsWith('## ')) {
        elements.push(
          <h3 key={`h3-${blockKey}-${elementIdx++}`} className="font-serif font-medium text-lg text-on-surface mt-3 mb-1">
            {renderInlineSpans(trimmed.slice(3), `h3-${blockKey}-${elementIdx}`)}
          </h3>
        );
      } else if (trimmed.startsWith('# ')) {
        elements.push(
          <h2 key={`h2-${blockKey}-${elementIdx++}`} className="font-serif font-medium text-xl text-on-surface mt-4 mb-2">
            {renderInlineSpans(trimmed.slice(2), `h2-${blockKey}-${elementIdx}`)}
          </h2>
        );
      }
      i++;
      continue;
    }

    // 3. Blockquotes (> line)
    if (/^>\s*/.test(trimmed)) {
      const quoteLines: string[] = [];
      while (i < rawLines.length && /^>\s*/.test(rawLines[i].trim())) {
        quoteLines.push(rawLines[i].trim().replace(/^>\s*/, ''));
        i++;
      }
      const quoteText = quoteLines.join('\n');
      elements.push(
        <blockquote
          key={`bq-${blockKey}-${elementIdx++}`}
          className="border-l-2 border-primary/40 pl-3 my-2 text-on-surface-variant italic leading-relaxed space-y-0.5"
        >
          {renderInlineSpans(quoteText, `bq-${blockKey}-${elementIdx++}`)}
        </blockquote>
      );
      continue;
    }

    // 4. Unordered list (- item, * item, + item)
    if (/^[\*\-+]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < rawLines.length) {
        const curTrimmed = rawLines[i].trim();
        if (/^[\*\-+]\s+/.test(curTrimmed)) {
          items.push(curTrimmed.replace(/^[\*\-+]\s+/, ''));
          i++;
        } else if (items.length > 0 && /^\s{2,}\S/.test(rawLines[i])) {
          items[items.length - 1] += '\n' + curTrimmed;
          i++;
        } else {
          break;
        }
      }
      elements.push(
        <ul key={`ul-${blockKey}-${elementIdx++}`} className="list-disc list-inside space-y-1 my-2">
          {items.map((itemText, itIdx) => (
            <li key={`uli-${itIdx}`} className="text-on-surface">
              {renderInlineSpans(itemText, `uli-${blockKey}-${elementIdx}-${itIdx}`)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // 5. Ordered list (1. item, 2. item)
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < rawLines.length) {
        const curTrimmed = rawLines[i].trim();
        if (/^\d+\.\s+/.test(curTrimmed)) {
          items.push(curTrimmed.replace(/^\d+\.\s+/, ''));
          i++;
        } else if (items.length > 0 && /^\s{2,}\S/.test(rawLines[i])) {
          items[items.length - 1] += '\n' + curTrimmed;
          i++;
        } else {
          break;
        }
      }
      elements.push(
        <ol key={`ol-${blockKey}-${elementIdx++}`} className="list-decimal list-inside space-y-1 my-2">
          {items.map((itemText, itIdx) => (
            <li key={`oli-${itIdx}`} className="text-on-surface">
              {renderInlineSpans(itemText, `oli-${blockKey}-${elementIdx}-${itIdx}`)}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // 6. Paragraph: collect lines until a block marker or paragraph boundary
    const paraLines: string[] = [];
    while (i < rawLines.length) {
      const curLine = rawLines[i];
      const curTrimmed = curLine.trim();

      // Check if we hit an empty line
      if (!curTrimmed) {
        // If we are currently inside an unclosed formatting delimiter (like == or **),
        // include the empty line so multi-paragraph highlights/bolds are preserved intact!
        const accumulated = paraLines.join('\n');
        const hasUnclosedHighlight = (accumulated.match(/==/g) || []).length % 2 === 1;
        const hasUnclosedBold = (accumulated.match(/\*\*/g) || []).length % 2 === 1;
        if (hasUnclosedHighlight || hasUnclosedBold) {
          paraLines.push(curLine);
          i++;
          continue;
        }
        break;
      }

      // Check if line is a block element (heading, quote, list)
      if (
        /^#{1,3}\s+/.test(curTrimmed) ||
        /^>\s*/.test(curTrimmed) ||
        /^[\*\-+]\s+/.test(curTrimmed) ||
        /^\d+\.\s+/.test(curTrimmed)
      ) {
        // Only break if not inside an unclosed highlight
        const accumulated = paraLines.join('\n');
        const hasUnclosedHighlight = (accumulated.match(/==/g) || []).length % 2 === 1;
        if (!hasUnclosedHighlight) {
          break;
        }
      }

      paraLines.push(curLine);
      i++;
    }

    if (paraLines.length > 0) {
      const paraText = paraLines.join('\n');
      elements.push(
        <p key={`p-${blockKey}-${elementIdx++}`} className="my-1.5 leading-relaxed">
          {renderInlineSpans(paraText, `p-${blockKey}-${elementIdx}`)}
        </p>
      );
    }
  }

  return elements;
}

function renderInlineSpans(text: string, parentKey: string): React.ReactNode[] {
  // Use matchAll + gap tracking instead of split(regex).
  // split() with a capturing-group regex injects `undefined` for each unmatched
  // sub-group into the result array → .startsWith() throws TypeError → blank screen.
  const inlineMathRegex = /(==(?:(?!==)[\s\S])+?==|<mark(?:\s+[^>]*)?>[\s\S]*?<\/mark>|<u>[\s\S]*?<\/u>|~~(?:(?!~~)[\s\S])+?~~|\*\*(?:(?!\*\*)[\s\S])+?\*\*|__(?:(?!__)[\s\S])+?__|\\\([\s\S]*?\\\)|(?<!\\)\$(?!\s)[^$]+?(?<!\s)(?<!\\)\$|(?<!\*)\*[^*\s](?:[\s\S]*?[^*\s])?\*(?!\*)|(?<![a-zA-Z0-9])_[^_\s](?:[\s\S]*?[^_\s])?_(?![a-zA-Z0-9])|`[^`]+`|\\[a-zA-Z]+(?:(?:_[^{\s\n]+|\_{[^}]*})|(?:\^[^{\s\n]+|\^{[^}]*}))*(?:\[[^\]]*\])?(?:\{[^}]*\})*)/g;

  const spans: React.ReactNode[] = [];
  let lastIndex = 0;
  let spanIdx = 0;

  const pushPlainText = (raw: string) => {
    if (!raw) return;
    const subLines = raw.split('\n');
    subLines.forEach((line, lIdx) => {
      if (lIdx > 0) spans.push(<br key={`${parentKey}-br-${spanIdx++}`} />);
      if (line) spans.push(line);
    });
  };

  for (const match of text.matchAll(inlineMathRegex)) {
    const chunk = match[0];
    const matchStart = match.index!;

    // Push any plain text that appears before this match
    if (matchStart > lastIndex) {
      pushPlainText(text.slice(lastIndex, matchStart));
    }
    lastIndex = matchStart + chunk.length;

    const key = `${parentKey}-${spanIdx++}`;

    // Inline \( ... \)
    if (chunk.startsWith('\\(') && chunk.endsWith('\\)')) {
      const html = renderMathSafely(chunk.slice(2, -2), false);
      spans.push(
        <span key={key} className="inline-math px-0.5" dangerouslySetInnerHTML={{ __html: html }} />
      );
    }
    // Inline $ ... $
    else if (chunk.startsWith('$') && chunk.endsWith('$') && chunk.length >= 2) {
      const html = renderMathSafely(chunk.slice(1, -1), false);
      spans.push(
        <span key={key} className="inline-math px-0.5" dangerouslySetInnerHTML={{ __html: html }} />
      );
    }
    // Bare LaTeX command: \int_{0}^{1}, \sqrt{x}, \pi etc.
    else if (chunk.startsWith('\\') && /^\\[a-zA-Z]/.test(chunk)) {
      const html = renderMathSafely(chunk, false);
      spans.push(
        <span key={key} className="inline-math px-0.5" dangerouslySetInnerHTML={{ __html: html }} />
      );
    }
    // Highlight ==...== or <mark ...>...</mark>
    else if (
      (chunk.startsWith('==') && chunk.endsWith('==') && chunk.length >= 4) ||
      chunk.startsWith('<mark')
    ) {
      let inner = '';
      let color = 'yellow';
      if (chunk.startsWith('==')) {
        inner = chunk.slice(2, -2);
      } else {
        const colorMatch = chunk.match(/data-color="([^"]+)"/i);
        if (colorMatch) color = colorMatch[1].toLowerCase();
        inner = chunk.replace(/^<mark(?:\s+[^>]*)?>/i, '').replace(/<\/mark>$/i, '');
      }

      let colorClass = 'bg-amber-300/35 dark:bg-amber-400/25 border-b border-amber-400/40 text-inherit';
      if (color === 'green' || color === 'emerald') {
        colorClass = 'bg-emerald-300/35 dark:bg-emerald-400/25 border-b border-emerald-400/40 text-inherit';
      } else if (color === 'pink' || color === 'rose') {
        colorClass = 'bg-pink-300/35 dark:bg-pink-400/25 border-b border-pink-400/40 text-inherit';
      } else if (color === 'blue' || color === 'sky') {
        colorClass = 'bg-sky-300/35 dark:bg-sky-400/25 border-b border-sky-400/40 text-inherit';
      } else if (color === 'purple' || color === 'violet') {
        colorClass = 'bg-purple-300/35 dark:bg-purple-400/25 border-b border-purple-400/40 text-inherit';
      }

      spans.push(
        <mark
          key={key}
          className={`${colorClass} px-1 py-0.5 rounded font-medium select-text box-decoration-clone`}
        >
          {renderInlineSpans(inner, `${key}-inner`)}
        </mark>
      );
    }
    // Underline <u>...</u>
    else if (chunk.startsWith('<u>') && chunk.endsWith('</u>')) {
      const inner = chunk.slice(3, -4);
      spans.push(
        <u key={key} className="underline decoration-primary/60 underline-offset-2 select-text">
          {renderInlineSpans(inner, `${key}-inner`)}
        </u>
      );
    }
    // Strikethrough ~~...~~
    else if (chunk.startsWith('~~') && chunk.endsWith('~~') && chunk.length >= 4) {
      const inner = chunk.slice(2, -2);
      spans.push(
        <del key={key} className="line-through opacity-70 select-text">
          {renderInlineSpans(inner, `${key}-inner`)}
        </del>
      );
    }
    // Inline code `...`
    else if (chunk.startsWith('`') && chunk.endsWith('`')) {
      spans.push(
        <code key={key} className="font-mono text-[0.88em] bg-surface-container-high px-1.5 py-0.5 rounded text-primary">
          {chunk.slice(1, -1)}
        </code>
      );
    }
    // Bold **...** or __...__
    else if (
      (chunk.startsWith('**') && chunk.endsWith('**') && chunk.length >= 4) ||
      (chunk.startsWith('__') && chunk.endsWith('__') && chunk.length >= 4)
    ) {
      spans.push(
        <strong key={key} className="font-semibold text-on-surface select-text">
          {renderInlineSpans(chunk.slice(2, -2), `${key}-inner`)}
        </strong>
      );
    }
    // Italic *...* or _..._
    else if (
      (chunk.startsWith('*') && chunk.endsWith('*') && chunk.length >= 2) ||
      (chunk.startsWith('_') && chunk.endsWith('_') && chunk.length >= 2)
    ) {
      spans.push(
        <em key={key} className="italic select-text">
          {renderInlineSpans(chunk.slice(1, -1), `${key}-inner`)}
        </em>
      );
    }
    // Anything else matched (shouldn't happen, but treat as plain text)
    else {
      pushPlainText(chunk);
    }
  }

  // Push any trailing plain text after the last match
  if (lastIndex < text.length) {
    pushPlainText(text.slice(lastIndex));
  }

  return spans;
}
