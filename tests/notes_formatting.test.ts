import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Helper mirroring formatSelection logic from MathEditor
function formatSelection(
  text: string,
  start: number,
  end: number,
  prefix: string,
  suffix: string = prefix
) {
  const selected = text.substring(start, end);
  const pLen = prefix.length;
  const sLen = suffix.length;

  if (start === end) {
    const updated = text.substring(0, start) + prefix + suffix + text.substring(end);
    return {
      updated,
      newStart: start + pLen,
      newEnd: start + pLen,
    };
  }

  let isInnerWrapped =
    selected.startsWith(prefix) &&
    selected.endsWith(suffix) &&
    selected.length >= pLen + sLen;

  if (isInnerWrapped && prefix === '*') {
    if (selected.startsWith('**') && selected.endsWith('**')) {
      isInnerWrapped = false;
    }
  }

  if (isInnerWrapped) {
    const unwrapped = selected.substring(pLen, selected.length - sLen);
    const updated = text.substring(0, start) + unwrapped + text.substring(end);
    return {
      updated,
      newStart: start,
      newEnd: start + unwrapped.length,
    };
  }

  const beforePrefix = text.substring(start - pLen, start);
  const afterSuffix = text.substring(end, end + sLen);

  let isOuterWrapped = beforePrefix === prefix && afterSuffix === suffix;
  if (isOuterWrapped && prefix === '*') {
    const charBeforeBefore = start > pLen ? text[start - pLen - 1] : '';
    const charAfterAfter = end + sLen < text.length ? text[end + sLen] : '';
    if (charBeforeBefore === '*' || charAfterAfter === '*') {
      isOuterWrapped = false;
    }
  }

  if (isOuterWrapped) {
    const updated = text.substring(0, start - pLen) + selected + text.substring(end + sLen);
    return {
      updated,
      newStart: start - pLen,
      newEnd: start - pLen + selected.length,
    };
  }

  const updated = text.substring(0, start) + prefix + selected + suffix + text.substring(end);
  return {
    updated,
    newStart: start + pLen,
    newEnd: end + pLen,
  };
}

describe('Notes Formatting: Bold, Italic & Highlight Engine', () => {
  describe('Selection Wrapping and Unwrapping', () => {
    it('handles empty selection by inserting markers with cursor placed between', () => {
      const boldEmpty = formatSelection('Draft note', 5, 5, '**');
      assert.equal(boldEmpty.updated, 'Draft**** note');
      assert.equal(boldEmpty.newStart, 7);
      assert.equal(boldEmpty.newEnd, 7);

      const italicEmpty = formatSelection('Draft note', 5, 5, '*');
      assert.equal(italicEmpty.updated, 'Draft** note');
      assert.equal(italicEmpty.newStart, 6);
      assert.equal(italicEmpty.newEnd, 6);

      const highlightEmpty = formatSelection('Draft note', 5, 5, '==');
      assert.equal(highlightEmpty.updated, 'Draft==== note');
      assert.equal(highlightEmpty.newStart, 7);
      assert.equal(highlightEmpty.newEnd, 7);
    });

    it('wraps selected text in bold, italic, and highlight formatting', () => {
      const original = 'Pay attention to integration constant C';
      // select "integration constant C"
      const start = original.indexOf('integration');
      const end = original.length;

      const boldRes = formatSelection(original, start, end, '**');
      assert.equal(boldRes.updated, 'Pay attention to **integration constant C**');
      assert.equal(boldRes.newStart, start + 2);
      assert.equal(boldRes.newEnd, end + 2);

      const italicRes = formatSelection(original, start, end, '*');
      assert.equal(italicRes.updated, 'Pay attention to *integration constant C*');

      const highlightRes = formatSelection(original, start, end, '==');
      assert.equal(highlightRes.updated, 'Pay attention to ==integration constant C==');
    });

    it('toggles/unwraps text when already wrapped', () => {
      const boldText = 'Check **boundary conditions** carefully';
      const start = boldText.indexOf('**boundary conditions**');
      const end = start + '**boundary conditions**'.length;

      // Inner selection unwrap
      const unwrappedInner = formatSelection(boldText, start, end, '**');
      assert.equal(unwrappedInner.updated, 'Check boundary conditions carefully');

      // Outer wrapper unwrap (selection is just "boundary conditions")
      const textOnlyStart = start + 2;
      const textOnlyEnd = end - 2;
      const unwrappedOuter = formatSelection(boldText, textOnlyStart, textOnlyEnd, '**');
      assert.equal(unwrappedOuter.updated, 'Check boundary conditions carefully');

      // Highlight unwrap
      const hlText = 'Check ==trap in option D== carefully';
      const hlStart = hlText.indexOf('==trap in option D==');
      const hlEnd = hlStart + '==trap in option D=='.length;
      const unwrappedHl = formatSelection(hlText, hlStart, hlEnd, '==');
      assert.equal(unwrappedHl.updated, 'Check trap in option D carefully');
    });

    it('supports combining bold, italic, and highlight without collisions', () => {
      let text = 'Important step';
      // 1. Highlight
      const step1 = formatSelection(text, 0, text.length, '==');
      assert.equal(step1.updated, '==Important step==');

      // 2. Bold the whole thing
      const step2 = formatSelection(step1.updated, 0, step1.updated.length, '**');
      assert.equal(step2.updated, '**==Important step==**');
    });
  });

  describe('Inline Markdown & LaTeX Tokenization', () => {
    const inlineMathRegex = /(==(?:(?!==)[^\n])+==|<mark>[\s\S]*?<\/mark>|\*\*(?:(?!\*\*)[^\n])+\*\*|__(?:(?!__)[^\n])+__|\\\([\s\S]*?\\\)|(?<!\\)\$[^$\n]+?(?<!\\)\$|(?<!\*)\*[^*\s\n](?:[^\n]*?[^*\s\n])?\*(?!\*)|(?<![a-zA-Z0-9])_[^_\s\n](?:[^\n]*?[^_\s\n])?_(?![a-zA-Z0-9])|`[^`\n]+`|\\[a-zA-Z]+(?:(?:_[^{\s\n]+|\_{[^}]*})|(?:\^[^{\s\n]+|\^{[^}]*}))*(?:\[[^\]]*\])?(?:\{[^}]*\})*)/g;

    it('identifies highlight, bold, and italic chunks cleanly', () => {
      const input = 'Notes: **bold**, *italic*, and ==highlighted== text!';
      const tokens = input.split(inlineMathRegex).filter(Boolean);

      assert.deepEqual(tokens, [
        'Notes: ',
        '**bold**',
        ', ',
        '*italic*',
        ', and ',
        '==highlighted==',
        ' text!',
      ]);
    });

    it('correctly isolates nested bold inside highlight', () => {
      const input = 'Key formula: ==**critical invariant**== in problem 4';
      const tokens = input.split(inlineMathRegex).filter(Boolean);

      assert.deepEqual(tokens, [
        'Key formula: ',
        '==**critical invariant**==',
        ' in problem 4',
      ]);

      // Inner tokenization of the highlight chunk
      const inner = tokens[1].slice(2, -2);
      assert.equal(inner, '**critical invariant**');
      const innerTokens = inner.split(inlineMathRegex).filter(Boolean);
      assert.deepEqual(innerTokens, ['**critical invariant**']);
    });

    it('supports math inside highlighted text', () => {
      const input = 'Remember ==$\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1$== for this question';
      const tokens = input.split(inlineMathRegex).filter(Boolean);

      assert.equal(tokens[1], '==$\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1$==');
    });

    it('recognizes universal LaTeX commands and Greek letters without whitelist restriction', () => {
      const input = 'Formulas: \\sin(\\theta) + \\cos(\\theta) = 1 and \\partial f/\\partial x with \\Delta x \\to 0.';
      const tokens = input.split(inlineMathRegex).filter(Boolean);

      assert.ok(tokens.includes('\\sin'));
      assert.ok(tokens.includes('\\theta'));
      assert.ok(tokens.includes('\\cos'));
      assert.ok(tokens.includes('\\partial'));
      assert.ok(tokens.includes('\\Delta'));
      assert.ok(tokens.includes('\\to'));
    });

    it('distinguishes markdown italics from intra-word underscores safely', () => {
      const input = 'Here is _italic note_ and user_variable_id with \\sigma_x^2';
      const tokens = input.split(inlineMathRegex).filter(Boolean);

      assert.ok(tokens.includes('_italic note_'));
      assert.ok(tokens.includes('\\sigma_x^2'));
      assert.ok(tokens.some((t) => t.includes('user_variable_id')));
    });
  });

  describe('Notion-Style Forward Slash Commands & Submenu Engine', () => {
    // Import filter function directly from client module
    it('filters commands cleanly by ID, label, and keywords', async () => {
      const { filterSlashCommands } = await import('../src/client/lib/mathCommands.js');

      // Empty query returns all items
      const all = filterSlashCommands('');
      assert.ok(all.length >= 40);

      // "int" prioritizes Integral
      const intResults = filterSlashCommands('int');
      assert.equal(intResults[0].id, 'int');
      assert.equal(intResults[0].label, 'Integral');

      // "pi" finds Pi
      const piResults = filterSlashCommands('pi');
      assert.equal(piResults[0].id, 'pi');
      assert.equal(piResults[0].glyph, 'π');

      // "bold" finds Bold
      const boldResults = filterSlashCommands('bold');
      assert.equal(boldResults[0].id, 'bold');

      // "high" finds Highlight
      const highResults = filterSlashCommands('high');
      assert.equal(highResults[0].id, 'highlight');

      // "diff" finds Derivative
      const diffResults = filterSlashCommands('diff');
      assert.equal(diffResults[0].id, 'diff');

      // "sin" finds Sine
      const sinResults = filterSlashCommands('sin');
      assert.equal(sinResults[0].id, 'sin');
    });

    it('correctly calculates insertion replacement range and cursor selection', () => {
      function insertSlashCmd(
        currentVal: string,
        slashIndex: number,
        queryLength: number,
        template: string,
        selectRange?: [number, number]
      ) {
        const before = currentVal.substring(0, slashIndex);
        const after = currentVal.substring(slashIndex + 1 + queryLength);
        const newVal = before + template + after;

        let selStart: number, selEnd: number;
        if (selectRange) {
          selStart = slashIndex + selectRange[0];
          selEnd = slashIndex + selectRange[1];
        } else {
          selStart = slashIndex + template.length;
          selEnd = selStart;
        }

        return {
          newVal,
          selStart,
          selEnd,
          selectedText: newVal.substring(selStart, selEnd),
        };
      }

      // 1. Integral with limits
      const intRes = insertSlashCmd('Step 1: /int', 8, 3, '\\int_{a}^{b} ', [6, 7]);
      assert.equal(intRes.newVal, 'Step 1: \\int_{a}^{b} ');
      assert.equal(intRes.selectedText, 'a');

      // 2. Limit notation with bounds (ensuring closing brace } is not selected or erased)
      const limRes = insertSlashCmd('/lim', 0, 3, '\\lim_{x \\to 0} ', [6, 13]);
      assert.equal(limRes.newVal, '\\lim_{x \\to 0} ');
      assert.equal(limRes.selectedText, 'x \\to 0');
      // Character at index 13 must be the closing brace
      assert.equal(limRes.newVal[13], '}');

      // 3. Bold template
      const boldRes = insertSlashCmd('Notice /bold here', 7, 4, '**text**', [2, 6]);
      assert.equal(boldRes.newVal, 'Notice **text** here');
      assert.equal(boldRes.selectedText, 'text');

      // 4. Greek Pi symbol (no range selection, cursor at end)
      const piRes = insertSlashCmd('Area = /pi', 7, 2, '\\pi ');
      assert.equal(piRes.newVal, 'Area = \\pi ');
      assert.equal(piRes.selStart, piRes.newVal.length);
      assert.equal(piRes.selectedText, '');
    });

    it('implements container-only scroll calculation preventing page jumps', () => {
      // Test the container-only scroll algorithm without scrollIntoView
      function computeNewScrollTop(
        containerTop: number,
        containerBottom: number,
        currentScrollTop: number,
        itemTop: number,
        itemBottom: number
      ): number {
        if (itemTop < containerTop) {
          return currentScrollTop - (containerTop - itemTop);
        } else if (itemBottom > containerBottom) {
          return currentScrollTop + (itemBottom - containerBottom);
        }
        return currentScrollTop;
      }

      // Item partially below container bottom (e.g. at Y=460 with container bottom at Y=400)
      const scrollDown = computeNewScrollTop(100, 400, 50, 360, 460);
      assert.equal(scrollDown, 110); // Adjusts by exactly 60px downwards

      // Item partially above container top (e.g. at Y=80 with container top at Y=100)
      const scrollUp = computeNewScrollTop(100, 400, 110, 80, 140);
      assert.equal(scrollUp, 90); // Adjusts by exactly 20px upwards

      // Item fully visible within viewport (e.g. item from 150 to 200 within 100 to 400)
      const noScroll = computeNewScrollTop(100, 400, 90, 150, 200);
      assert.equal(noScroll, 90); // No adjustment needed
    });

    it('ensures Arrow key navigation preserves selection unless query text changes', () => {
      let selectedIndex = 0;
      let prevQuery = '';

      function simulateCheckSlash(query: string) {
        if (prevQuery !== query) {
          selectedIndex = 0;
          prevQuery = query;
        }
      }

      function simulateArrowDown(totalItems: number) {
        selectedIndex = (selectedIndex + 1) % totalItems;
      }

      function simulateArrowUp(totalItems: number) {
        selectedIndex = (selectedIndex - 1 + totalItems) % totalItems;
      }

      // User types /
      simulateCheckSlash('');
      assert.equal(selectedIndex, 0);

      // User navigates down with arrow key
      simulateArrowDown(10);
      assert.equal(selectedIndex, 1);
      simulateArrowDown(10);
      assert.equal(selectedIndex, 2);

      // Releasing arrow key or re-evaluating unchanged query must NOT reset selectedIndex!
      simulateCheckSlash('');
      assert.equal(selectedIndex, 2);

      // User navigates up with arrow key
      simulateArrowUp(10);
      assert.equal(selectedIndex, 1);

      // Circular wrap backwards
      simulateArrowUp(10);
      assert.equal(selectedIndex, 0);
      simulateArrowUp(10);
      assert.equal(selectedIndex, 9);

      // Query change DOES reset index to 0
      simulateCheckSlash('int');
      assert.equal(selectedIndex, 0);
    });
  });

  describe('Plain English Safety (No Shorthand Conflicts)', () => {
    // Regex matching inline math and LaTeX tokens from katex.tsx (multiline safe)
    const inlineMathRegex = /(==(?:(?!==)[\s\S])+?==|<mark>[\s\S]*?<\/mark>|\*\*(?:(?!\*\*)[\s\S])+?\*\*|__(?:(?!__)[\s\S])+?__|\\\([\s\S]*?\\\)|(?<!\\)\$(?!\s)[^$]+?(?<!\s)(?<!\\)\$|(?<!\*)\*[^*\s](?:[\s\S]*?[^*\s])?\*(?!\*)|(?<![a-zA-Z0-9])_[^_\s](?:[\s\S]*?[^_\s])?_(?![a-zA-Z0-9])|`[^`]+`|\\[a-zA-Z]+(?:(?:_[^{\s\n]+|\_{[^}]*})|(?:\^[^{\s\n]+|\^{[^}]*}))*(?:\[[^\]]*\])?(?:\{[^}]*\})*)/g;

    it('leaves plain English words like "in", "to", "diff", "sin", "pi" untouched', () => {
      const sentence = 'Check in problem 4 and go to step 2. Find the diff of sin and cos, not pi.';
      const matches = sentence.match(inlineMathRegex);

      // None of the words without backslashes should match the LaTeX / math token regex
      assert.equal(matches, null);
    });

    it('only converts commands that explicitly start with a backslash', () => {
      const mixed = 'We know that x \\in A and f(x) \\to \\infty where \\pi is constant.';
      const matches = mixed.match(inlineMathRegex);

      assert.deepEqual(matches, ['\\in', '\\to', '\\infty', '\\pi']);
    });
  });

  describe('Multi-Line Formatting Engine (Highlight, Bold, Italic, Math, Blockquotes)', () => {
    const inlineMathRegex = /(==(?:(?!==)[\s\S])+?==|<mark>[\s\S]*?<\/mark>|\*\*(?:(?!\*\*)[\s\S])+?\*\*|__(?:(?!__)[\s\S])+?__|\\\([\s\S]*?\\\)|(?<!\\)\$(?!\s)[^$]+?(?<!\s)(?<!\\)\$|(?<!\*)\*[^*\s](?:[\s\S]*?[^*\s])?\*(?!\*)|(?<![a-zA-Z0-9])_[^_\s](?:[\s\S]*?[^_\s])?_(?![a-zA-Z0-9])|`[^`]+`|\\[a-zA-Z]+(?:(?:_[^{\s\n]+|\_{[^}]*})|(?:\^[^{\s\n]+|\^{[^}]*}))*(?:\[[^\]]*\])?(?:\{[^}]*\})*)/g;

    it('matches multi-line highlight across 5 continuous lines (user reported bug)', () => {
      const text = `apparent tentacles in the Chinese and American fossils are actually ctenophore comb rows. ==If the
fossils are so poorly preserved that they
cannot be conclusively identified as either organism, neither the claim that they are jellyfish nor, as
Caron claims, that they are ctenophores
would be supported.==`;

      const parts = text.split(inlineMathRegex);
      // parts should contain: [prefix text, highlighted chunk, suffix text]
      assert.equal(parts.length, 3);
      assert.ok(parts[1].startsWith('==If the'));
      assert.ok(parts[1].endsWith('would be supported.=='));
      assert.ok(parts[1].includes('\n'));
    });

    it('matches multi-line bold text spanning multiple lines', () => {
      const text = 'Note that **this is critical\nevidence across\nthree lines** in the solution.';
      const parts = text.split(inlineMathRegex);
      assert.equal(parts.length, 3);
      assert.equal(parts[1], '**this is critical\nevidence across\nthree lines**');
    });

    it('matches multi-line italic text spanning multiple lines', () => {
      const text = 'Notice *this emphasized observation\nthat spans across lines* in the reading.';
      const parts = text.split(inlineMathRegex);
      assert.equal(parts.length, 3);
      assert.equal(parts[1], '*this emphasized observation\nthat spans across lines*');
    });

    it('matches multi-line inline code', () => {
      const text = 'Run `npm run build\n&& npm test` in the terminal.';
      const parts = text.split(inlineMathRegex);
      assert.equal(parts.length, 3);
      assert.equal(parts[1], '`npm run build\n&& npm test`');
    });

    it('matches multi-line inline math', () => {
      const text = 'The formula $\\int_0^1 f(x)dx\n= F(1) - F(0)$ holds.';
      const parts = text.split(inlineMathRegex);
      assert.equal(parts.length, 3);
      assert.equal(parts[1], '$\\int_0^1 f(x)dx\n= F(1) - F(0)$');
    });

    it('supports nested bold and math inside multi-line highlight', () => {
      const text = '==Here is a multi-line highlight\nwith **nested bold** and $\\alpha + \\beta$\ninside it==';
      const parts = text.split(inlineMathRegex);
      assert.equal(parts.length, 3);
      const highlightedChunk = parts[1];
      assert.ok(highlightedChunk.startsWith('=='));
      assert.ok(highlightedChunk.endsWith('=='));

      // Inner content when recursively tokenized
      const inner = highlightedChunk.slice(2, -2);
      const innerParts = inner.split(inlineMathRegex);
      assert.ok(innerParts.includes('**nested bold**'));
      assert.ok(innerParts.includes('$\\alpha + \\beta$'));
    });

    it('matches multiple independent highlights within the same paragraph', () => {
      const text = '==First highlight\nacross lines== and normal text and ==Second highlight\nacross lines==.';
      const parts = text.split(inlineMathRegex);
      const highlights = parts.filter((p) => p.startsWith('==') && p.endsWith('=='));
      assert.equal(highlights.length, 2);
      assert.equal(highlights[0], '==First highlight\nacross lines==');
      assert.equal(highlights[1], '==Second highlight\nacross lines==');
    });

    it('preserves multi-paragraph highlights across empty lines', () => {
      // Simulates block collector behavior with unclosed highlight
      const rawLines = [
        '==First paragraph line 1',
        'First paragraph line 2',
        '',
        'Second paragraph line 1',
        'Second paragraph line 2=='
      ];

      const paraLines: string[] = [];
      let i = 0;
      while (i < rawLines.length) {
        const curLine = rawLines[i];
        const curTrimmed = curLine.trim();

        if (!curTrimmed) {
          const accumulated = paraLines.join('\n');
          const hasUnclosedHighlight = (accumulated.match(/==/g) || []).length % 2 === 1;
          if (hasUnclosedHighlight) {
            paraLines.push(curLine);
            i++;
            continue;
          }
          break;
        }
        paraLines.push(curLine);
        i++;
      }

      const fullText = paraLines.join('\n');
      const parts = fullText.split(inlineMathRegex);
      const highlights = parts.filter((p) => p.startsWith('==') && p.endsWith('=='));
      assert.equal(highlights.length, 1);
      assert.ok(highlights[0].includes('First paragraph'));
      assert.ok(highlights[0].includes('Second paragraph'));
    });
  });

  describe('List Auto-Continuation, Indentation & Clean Exit Engine', () => {
    // Simulates Enter key behavior from MathEditor
    function simulateEnter(currentText: string, cursor: number) {
      const beforeCursor = currentText.substring(0, cursor);
      const lineStart = beforeCursor.lastIndexOf('\n') + 1;
      const afterCursor = currentText.substring(cursor);
      const nextNewline = afterCursor.indexOf('\n');
      const lineEnd = nextNewline === -1 ? currentText.length : cursor + nextNewline;
      const lineBeforeCursor = currentText.substring(lineStart, cursor);
      const lineAfterCursor = currentText.substring(cursor, lineEnd);

      // Bullet list
      const bulletMatch = lineBeforeCursor.match(/^(\s*)([-*+])\s+(.*)$/);
      if (bulletMatch) {
        const indent = bulletMatch[1];
        const marker = bulletMatch[2];
        const textBefore = bulletMatch[3];
        const hasContent = (textBefore + lineAfterCursor).trim().length > 0;

        if (!hasContent) {
          if (indent.length >= 2) {
            const newIndent = indent.slice(2);
            return {
              text: currentText.substring(0, lineStart) + newIndent + marker + ' ' + currentText.substring(lineEnd),
              cursor: lineStart + newIndent.length + marker.length + 1,
            };
          }
          return {
            text: currentText.substring(0, lineStart) + currentText.substring(lineEnd),
            cursor: lineStart,
          };
        }

        const nextPrefix = `\n${indent}${marker} `;
        return {
          text: currentText.substring(0, cursor) + nextPrefix + currentText.substring(cursor),
          cursor: cursor + nextPrefix.length,
        };
      }

      // Numbered list
      const numMatch = lineBeforeCursor.match(/^(\s*)(\d+)([\.\)])\s+(.*)$/);
      if (numMatch) {
        const indent = numMatch[1];
        const currentNum = parseInt(numMatch[2], 10);
        const delim = numMatch[3];
        const textBefore = numMatch[4];
        const hasContent = (textBefore + lineAfterCursor).trim().length > 0;

        if (!hasContent) {
          if (indent.length >= 2) {
            const newIndent = indent.slice(2);
            return {
              text: currentText.substring(0, lineStart) + newIndent + `${currentNum}${delim} ` + currentText.substring(lineEnd),
              cursor: lineStart + newIndent.length + `${currentNum}${delim} `.length,
            };
          }
          return {
            text: currentText.substring(0, lineStart) + currentText.substring(lineEnd),
            cursor: lineStart,
          };
        }

        const nextNum = currentNum + 1;
        const nextPrefix = `\n${indent}${nextNum}${delim} `;
        return {
          text: currentText.substring(0, cursor) + nextPrefix + currentText.substring(cursor),
          cursor: cursor + nextPrefix.length,
        };
      }

      // Blockquote
      const quoteMatch = lineBeforeCursor.match(/^(\s*)(>+)\s*(.*)$/);
      if (quoteMatch) {
        const indent = quoteMatch[1];
        const marker = quoteMatch[2];
        const textBefore = quoteMatch[3];
        const hasContent = (textBefore + lineAfterCursor).trim().length > 0;

        if (!hasContent) {
          return {
            text: currentText.substring(0, lineStart) + currentText.substring(lineEnd),
            cursor: lineStart,
          };
        }

        const nextPrefix = `\n${indent}${marker} `;
        return {
          text: currentText.substring(0, cursor) + nextPrefix + currentText.substring(cursor),
          cursor: cursor + nextPrefix.length,
        };
      }

      return {
        text: currentText.substring(0, cursor) + '\n' + currentText.substring(cursor),
        cursor: cursor + 1,
      };
    }

    // Simulates Backspace on empty marker
    function simulateBackspace(currentText: string, cursor: number) {
      const beforeCursor = currentText.substring(0, cursor);
      const lineStart = beforeCursor.lastIndexOf('\n') + 1;
      const afterCursor = currentText.substring(cursor);
      const nextNewline = afterCursor.indexOf('\n');
      const lineEnd = nextNewline === -1 ? currentText.length : cursor + nextNewline;
      const lineBeforeCursor = currentText.substring(lineStart, cursor);
      const lineAfterCursor = currentText.substring(cursor, lineEnd);

      const emptyMarkerMatch = lineBeforeCursor.match(/^(\s*)([-*+]|\d+[\.\)]|>+)\s*$/);
      if (emptyMarkerMatch && lineAfterCursor === '') {
        const indent = emptyMarkerMatch[1];
        const marker = emptyMarkerMatch[2];

        if (indent.length >= 2) {
          const newIndent = indent.slice(2);
          return {
            text: currentText.substring(0, lineStart) + newIndent + marker + ' ' + currentText.substring(lineEnd),
            cursor: lineStart + newIndent.length + marker.length + 1,
          };
        }
        return {
          text: currentText.substring(0, lineStart) + currentText.substring(lineEnd),
          cursor: lineStart,
        };
      }

      return {
        text: currentText.substring(0, cursor - 1) + currentText.substring(cursor),
        cursor: cursor - 1,
      };
    }

    // Simulates Tab / Shift+Tab indent/outdent
    function simulateTab(currentText: string, cursor: number, shift: boolean) {
      const beforeCursor = currentText.substring(0, cursor);
      const lineStart = beforeCursor.lastIndexOf('\n') + 1;
      const afterCursor = currentText.substring(cursor);
      const nextNewline = afterCursor.indexOf('\n');
      const lineEnd = nextNewline === -1 ? currentText.length : cursor + nextNewline;
      const currentLine = currentText.substring(lineStart, lineEnd);

      const isListLine = /^(\s*)([-*+]|\d+[\.\)]|>+)\s+/.test(currentLine);
      if (isListLine) {
        if (shift) {
          if (currentLine.startsWith('  ')) {
            const updatedLine = currentLine.slice(2);
            return {
              text: currentText.substring(0, lineStart) + updatedLine + currentText.substring(lineEnd),
              cursor: Math.max(lineStart, cursor - 2),
            };
          }
          return { text: currentText, cursor };
        } else {
          const updatedLine = '  ' + currentLine;
          return {
            text: currentText.substring(0, lineStart) + updatedLine + currentText.substring(lineEnd),
            cursor: cursor + 2,
          };
        }
      }

      return { text: currentText, cursor };
    }

    it('continues bullet list on Enter when content is present', () => {
      const initial = '- First observation';
      const res = simulateEnter(initial, initial.length);
      assert.equal(res.text, '- First observation\n- ');
      assert.equal(res.cursor, res.text.length);
    });

    it('cleans up and exits bullet list when Enter is pressed on empty bullet', () => {
      const initial = '- First observation\n- ';
      const res = simulateEnter(initial, initial.length);
      assert.equal(res.text, '- First observation\n');
      assert.equal(res.cursor, initial.indexOf('\n') + 1);
    });

    it('continues numbered list with incremented numbers on Enter', () => {
      const step1 = '1. Identify the substitution u = x^2';
      const res1 = simulateEnter(step1, step1.length);
      assert.equal(res1.text, '1. Identify the substitution u = x^2\n2. ');

      const step2 = res1.text + 'Differentiate to get du = 2x dx';
      const res2 = simulateEnter(step2, step2.length);
      assert.equal(res2.text, '1. Identify the substitution u = x^2\n2. Differentiate to get du = 2x dx\n3. ');
    });

    it('handles multidigit numbers correctly (e.g. 9. -> 10.)', () => {
      const step9 = '9. Previous item';
      const res = simulateEnter(step9, step9.length);
      assert.equal(res.text, '9. Previous item\n10. ');
    });

    it('cleans up and exits numbered list on empty numbered item', () => {
      const text = '1. First step\n2. ';
      const res = simulateEnter(text, text.length);
      assert.equal(res.text, '1. First step\n');
      assert.equal(res.cursor, text.indexOf('\n') + 1);
    });

    it('continues blockquotes on Enter', () => {
      const quote = '> Theorem 1: Energy is strictly conserved';
      const res = simulateEnter(quote, quote.length);
      assert.equal(res.text, '> Theorem 1: Energy is strictly conserved\n> ');
    });

    it('exits blockquote on empty blockquote line', () => {
      const quote = '> Important note\n> ';
      const res = simulateEnter(quote, quote.length);
      assert.equal(res.text, '> Important note\n');
    });

    it('supports indentation and un-indentation with Tab and Shift+Tab', () => {
      const item = '- Main topic';
      const indented = simulateTab(item, 5, false);
      assert.equal(indented.text, '  - Main topic');

      const outdented = simulateTab(indented.text, 7, true);
      assert.equal(outdented.text, '- Main topic');
    });

    it('un-indents nested list item when Enter is pressed on empty indented bullet', () => {
      const nested = '  - ';
      const res = simulateEnter(nested, nested.length);
      assert.equal(res.text, '- ');
    });

    it('smart backspace deletes empty bullet marker completely', () => {
      const item = '- ';
      const res = simulateBackspace(item, item.length);
      assert.equal(res.text, '');
      assert.equal(res.cursor, 0);
    });

    it('smart backspace un-indents empty nested bullet', () => {
      const item = '  - ';
      const res = simulateBackspace(item, item.length);
      assert.equal(res.text, '- ');
    });
  });
});
