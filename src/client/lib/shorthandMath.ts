/**
 * shorthandMath.ts
 *
 * Converts simplified math shorthands (like those used in Desmos, AsciiMath, and informal notes)
 * into standard LaTeX compatible with KaTeX.
 *
 * Supports:
 * - Roots: sqrt(x), cbrt(x), nthroot(n, x), nthroot(n)(x), sqrt x
 * - Powers / Exponents: x^2, x^(a+b), e^(-x), x^12
 * - Subscripts: x_1, x_(i+1), a_n, a_12
 * - Fractions: (a)/(b), (a+b)/(c+d), frac(a, b), 1/2, pi/4
 * - Absolute value & brackets: abs(x), floor(x), ceil(x), norm(x), vec(v)
 * - Greeks: pi, theta, alpha, beta, gamma, delta, Delta, lambda, infty / inf, etc.
 * - Trig & logs: sin, cos, tan, ln, log, arcsin, etc.
 * - Calculus: int, int_a^b, sum, sum_a^b, prod, lim_(x -> a), dy/dx
 * - Relations & symbols: <=, >=, !=, approx, +-, ->, =>
 */

export interface BalancedMatch {
  content: string;
  endIndex: number;
}

/**
 * Extracts balanced matching pairs (e.g. parentheses or brackets),
 * handling nested levels.
 */
export function extractBalanced(
  str: string,
  openIndex: number,
  openChar: string = '(',
  closeChar: string = ')'
): BalancedMatch | null {
  let depth = 0;
  for (let i = openIndex; i < str.length; i++) {
    const char = str[i];
    if (char === openChar) {
      depth++;
    } else if (char === closeChar) {
      depth--;
      if (depth === 0) {
        return {
          content: str.substring(openIndex + 1, i),
          endIndex: i,
        };
      }
    }
  }
  return null;
}

/**
 * Splits a string by a delimiter (e.g. comma) only at the top level
 * (not inside nested parentheses, braces, or brackets).
 */
export function splitTopLevel(str: string, separator: string = ','): string[] {
  const parts: string[] = [];
  let depth = 0;
  let lastIndex = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === '(' || char === '{' || char === '[') depth++;
    else if (char === ')' || char === '}' || char === ']') depth--;
    else if (char === separator && depth === 0) {
      parts.push(str.substring(lastIndex, i).trim());
      lastIndex = i + 1;
    }
  }
  parts.push(str.substring(lastIndex).trim());
  return parts;
}

/**
 * Converts shorthand math syntax inside a math string into clean LaTeX.
 */
export function convertShorthandToLatex(math: string): string {
  if (!math || typeof math !== 'string') return '';
  let s = math;

  // 1. nthroot(n, x) or nthroot(n)(x)
  let searchStart = 0;
  while (searchStart < s.length) {
    const sub = s.substring(searchStart);
    const match = sub.match(/(?<!\\)\bnthroot\s*\(/i);
    if (!match || match.index === undefined) break;
    const idx = searchStart + match.index;
    const parenIdx = s.indexOf('(', idx);
    const res = extractBalanced(s, parenIdx);
    if (!res) {
      searchStart = idx + 7;
      continue;
    }

    const parts = splitTopLevel(res.content, ',');
    let n = '';
    let x = '';
    let afterIdx = res.endIndex;

    if (parts.length >= 2) {
      n = convertShorthandToLatex(parts[0]);
      x = convertShorthandToLatex(parts.slice(1).join(','));
    } else {
      n = convertShorthandToLatex(parts[0]);
      const rest = s.substring(afterIdx + 1).trimStart();
      if (rest.startsWith('(')) {
        const nextParenIdx = s.indexOf('(', afterIdx + 1);
        const res2 = extractBalanced(s, nextParenIdx);
        if (res2) {
          x = convertShorthandToLatex(res2.content);
          afterIdx = res2.endIndex;
        }
      }
    }

    const replacement = x ? `\\sqrt[${n}]{${x}}` : `\\sqrt{${n}}`;
    s = s.substring(0, idx) + replacement + s.substring(afterIdx + 1);
    searchStart = idx + replacement.length;
  }

  // 2. cbrt(x)
  searchStart = 0;
  while (searchStart < s.length) {
    const sub = s.substring(searchStart);
    const match = sub.match(/(?<!\\)\bcbrt\s*\(/i);
    if (!match || match.index === undefined) break;
    const idx = searchStart + match.index;
    const parenIdx = s.indexOf('(', idx);
    const res = extractBalanced(s, parenIdx);
    if (!res) {
      searchStart = idx + 4;
      continue;
    }
    const inner = convertShorthandToLatex(res.content);
    const replacement = `\\sqrt[3]{${inner}}`;
    s = s.substring(0, idx) + replacement + s.substring(res.endIndex + 1);
    searchStart = idx + replacement.length;
  }

  // 3. sqrt(x)
  searchStart = 0;
  while (searchStart < s.length) {
    const sub = s.substring(searchStart);
    const match = sub.match(/(?<!\\)\bsqrt\s*\(/i);
    if (!match || match.index === undefined) break;
    const idx = searchStart + match.index;
    const parenIdx = s.indexOf('(', idx);
    const res = extractBalanced(s, parenIdx);
    if (!res) {
      searchStart = idx + 4;
      continue;
    }
    const inner = convertShorthandToLatex(res.content);
    const replacement = `\\sqrt{${inner}}`;
    s = s.substring(0, idx) + replacement + s.substring(res.endIndex + 1);
    searchStart = idx + replacement.length;
  }

  // Standalone sqrt / cbrt without parens: sqrt x, sqrt 2, cbrt x
  s = s.replace(/(?<!\\)\bsqrt\s+([a-zA-Z0-9]+)/gi, '\\sqrt{$1}');
  s = s.replace(/(?<!\\)\bcbrt\s+([a-zA-Z0-9]+)/gi, '\\sqrt[3]{$1}');

  // 4. abs(x) -> \left| x \right|
  searchStart = 0;
  while (searchStart < s.length) {
    const sub = s.substring(searchStart);
    const match = sub.match(/(?<!\\)\babs\s*\(/i);
    if (!match || match.index === undefined) break;
    const idx = searchStart + match.index;
    const parenIdx = s.indexOf('(', idx);
    const res = extractBalanced(s, parenIdx);
    if (!res) {
      searchStart = idx + 3;
      continue;
    }
    const inner = convertShorthandToLatex(res.content);
    const replacement = `\\left| ${inner} \\right|`;
    s = s.substring(0, idx) + replacement + s.substring(res.endIndex + 1);
    searchStart = idx + replacement.length;
  }

  // 5. Special wrapper functions: floor, ceil, norm, vec, hat, bar, frac
  const wrappers = [
    { name: 'floor', open: '\\lfloor ', close: ' \\rfloor' },
    { name: 'ceil', open: '\\lceil ', close: ' \\rceil' },
    { name: 'norm', open: '\\|', close: '\\|' },
    { name: 'vec', open: '\\vec{', close: '}' },
    { name: 'hat', open: '\\hat{', close: '}' },
    { name: 'bar', open: '\\bar{', close: '}' },
    { name: 'frac', open: '', close: '' },
  ];

  for (const w of wrappers) {
    searchStart = 0;
    while (searchStart < s.length) {
      const sub = s.substring(searchStart);
      const regex = new RegExp(`(?<!\\\\)\\b${w.name}\\s*\\(`, 'i');
      const match = sub.match(regex);
      if (!match || match.index === undefined) break;
      const idx = searchStart + match.index;
      const parenIdx = s.indexOf('(', idx);
      const res = extractBalanced(s, parenIdx);
      if (!res) {
        searchStart = idx + w.name.length;
        continue;
      }

      if (w.name === 'frac') {
        const parts = splitTopLevel(res.content, ',');
        if (parts.length >= 2) {
          const num = convertShorthandToLatex(parts[0]);
          const den = convertShorthandToLatex(parts.slice(1).join(','));
          const replacement = `\\frac{${num}}{${den}}`;
          s = s.substring(0, idx) + replacement + s.substring(res.endIndex + 1);
          searchStart = idx + replacement.length;
        } else {
          searchStart = idx + 4;
        }
      } else {
        const inner = convertShorthandToLatex(res.content);
        const replacement = `${w.open}${inner}${w.close}`;
        s = s.substring(0, idx) + replacement + s.substring(res.endIndex + 1);
        searchStart = idx + replacement.length;
      }
    }
  }

  // 6. Exponent with parentheses: ^(expr) -> ^{expr}
  searchStart = 0;
  while (searchStart < s.length) {
    const sub = s.substring(searchStart);
    const match = sub.match(/\^\(/);
    if (!match || match.index === undefined) break;
    const idx = searchStart + match.index;
    const parenIdx = idx + 1;
    const res = extractBalanced(s, parenIdx);
    if (!res) {
      searchStart = idx + 2;
      continue;
    }
    const inner = convertShorthandToLatex(res.content);
    const replacement = `^{${inner}}`;
    s = s.substring(0, idx) + replacement + s.substring(res.endIndex + 1);
    searchStart = idx + replacement.length;
  }

  // Multi-character / negative exponents: x^-1 -> x^{-1}, x^12 -> x^{12}
  s = s.replace(/\^([0-9]{2,}|-[0-9a-zA-Z]+)/g, '^{$1}');

  // 7. Subscripts with parentheses: _(expr) -> _{expr}
  searchStart = 0;
  while (searchStart < s.length) {
    const sub = s.substring(searchStart);
    const match = sub.match(/_\(/);
    if (!match || match.index === undefined) break;
    const idx = searchStart + match.index;
    const parenIdx = idx + 1;
    const res = extractBalanced(s, parenIdx);
    if (!res) {
      searchStart = idx + 2;
      continue;
    }
    const inner = convertShorthandToLatex(res.content);
    const replacement = `_{${inner}}`;
    s = s.substring(0, idx) + replacement + s.substring(res.endIndex + 1);
    searchStart = idx + replacement.length;
  }

  s = s.replace(/_([0-9]{2,}|-[0-9a-zA-Z]+)/g, '_{$1}');

  // 8. Fractions with parentheses: (a) / (b) -> \frac{a}{b}
  searchStart = 0;
  while (searchStart < s.length) {
    const sub = s.substring(searchStart);
    const divIdxInSub = sub.search(/\)\s*\/\s*\(/);
    if (divIdxInSub === -1) break;
    const divIdx = searchStart + divIdxInSub;

    let depth = 0;
    let numStart = -1;
    for (let i = divIdx; i >= 0; i--) {
      if (s[i] === ')') depth++;
      else if (s[i] === '(') {
        depth--;
        if (depth === 0) {
          numStart = i;
          break;
        }
      }
    }
    if (numStart === -1) {
      searchStart = divIdx + 2;
      continue;
    }

    const parenAfterSlash = s.indexOf('(', divIdx);
    const denRes = extractBalanced(s, parenAfterSlash);
    if (!denRes) {
      searchStart = divIdx + 2;
      continue;
    }

    const num = convertShorthandToLatex(s.substring(numStart + 1, divIdx));
    const den = convertShorthandToLatex(denRes.content);
    const replacement = `\\frac{${num}}{${den}}`;
    s = s.substring(0, numStart) + replacement + s.substring(denRes.endIndex + 1);
    searchStart = numStart + replacement.length;
  }

  // 9. Greek letters (word boundary, not preceded by backslash)
  const greekLetters = [
    'alpha', 'beta', 'gamma', 'Gamma', 'delta', 'Delta',
    'epsilon', 'varepsilon', 'zeta', 'eta', 'theta', 'Theta',
    'iota', 'kappa', 'lambda', 'Lambda', 'mu', 'nu',
    'xi', 'Xi', 'pi', 'Pi', 'rho', 'sigma', 'Sigma',
    'tau', 'upsilon', 'phi', 'Phi', 'chi', 'psi', 'Psi',
    'omega', 'Omega'
  ];
  for (const g of greekLetters) {
    const regex = new RegExp(`(?<!\\\\)\\b${g}\\b`, 'g');
    s = s.replace(regex, `\\${g}`);
  }

  // 10. Infinity
  s = s.replace(/(?<!\\)\b(?:infty|infinity|inf)\b/gi, '\\infty');

  // 11. Trigonometric & logarithmic
  const standardFns = [
    'arcsin', 'arccos', 'arctan',
    'sinh', 'cosh', 'tanh',
    'sin', 'cos', 'tan', 'sec', 'csc', 'cot',
    'ln', 'log', 'exp', 'det', 'gcd', 'lcm'
  ];
  for (const fn of standardFns) {
    const regex = new RegExp(`(?<!\\\\)\\b${fn}\\b`, 'gi');
    s = s.replace(regex, `\\${fn}`);
  }

  // 12. Calculus
  s = s.replace(/(?<!\\)\blim_\s*\{\s*([a-zA-Z0-9]+)\s*(?:->|-->|\\to|\bto\b)\s*([^{}]+)\}/g, '\\lim_{$1 \\to $2}');
  s = s.replace(/(?<!\\)\blim\b(?!\s*[_\{])/g, '\\lim ');

  s = s.replace(/(?<!\\)\bint_\s*([a-zA-Z0-9]+)\s*\^\s*([a-zA-Z0-9]+)/g, '\\int_{$1}^{$2}');
  s = s.replace(/(?<!\\)\bsum_\s*([a-zA-Z0-9]+)\s*\^\s*([a-zA-Z0-9]+)/g, '\\sum_{$1}^{$2}');
  s = s.replace(/(?<!\\)\bprod_\s*([a-zA-Z0-9]+)\s*\^\s*([a-zA-Z0-9]+)/g, '\\prod_{$1}^{$2}');
  s = s.replace(/(?<!\\)\bint\b(?!\s*[_\{])/g, '\\int ');
  s = s.replace(/(?<!\\)\boint\b(?!\s*[_\{])/g, '\\oint ');
  s = s.replace(/(?<!\\)\bsum\b(?!\s*[_\{])/g, '\\sum ');
  s = s.replace(/(?<!\\)\bprod\b(?!\s*[_\{])/g, '\\prod ');

  s = s.replace(/(?<!\\)\bdy\s*\/\s*dx\b/g, '\\frac{dy}{dx}');
  s = s.replace(/(?<!\\)\bd\s*\/\s*dx\b/g, '\\frac{d}{dx}');

  // 13. Comparison & relations
  s = s.replace(/<=|=</g, '\\le ');
  s = s.replace(/>=/g, '\\ge ');
  s = s.replace(/!=|<>/g, '\\ne ');
  s = s.replace(/~=|(?<!\\)\bapprox\b/g, '\\approx ');
  s = s.replace(/\+-/g, '\\pm ');
  s = s.replace(/-\+/g, '\\mp ');
  s = s.replace(/<->|<-->/g, '\\leftrightarrow ');
  s = s.replace(/->|-->|(?<!\\)\bto\b/g, '\\to ');
  s = s.replace(/=>|(?<!\\)\bimplies\b/g, '\\implies ');
  s = s.replace(/(?<!\\)\biff\b/g, '\\iff ');
  s = s.replace(/\s*\*\s*|(?<!\\)\bcdot\b/g, ' \\cdot ');
  s = s.replace(/(?<!\\)\b(?:xx|times)\b/g, '\\times ');

  // 14. Simple fractions: token/token (including powers, greeks, numbers)
  s = s.replace(
    /(?<![\\\/a-zA-Z0-9])([0-9]+|\\[a-zA-Z]+|[a-zA-Z](?:\^\{[^{}]+\}|\^[0-9a-zA-Z])?)\s*\/\s*([0-9]+|\\[a-zA-Z]+|[a-zA-Z](?:\^\{[^{}]+\}|\^[0-9a-zA-Z])?)(?![\\\/a-zA-Z0-9])/g,
    '\\frac{$1}{$2}'
  );

  return s;
}

/**
 * Splits plain text to isolate standalone shorthand functions like
 * sqrt(...), cbrt(...), nthroot(...), abs(...) so they can be rendered as math
 * even when the user hasn't explicitly wrapped them in dollar signs ($).
 */
export interface TextToken {
  type: 'text' | 'shorthand';
  value: string;
}

export function splitShorthandMathInPlainText(text: string): TextToken[] {
  const tokens: TextToken[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const sub = text.substring(cursor);
    const match = sub.match(/\b(sqrt|cbrt|nthroot|abs|frac)\s*\(/i);
    if (!match || match.index === undefined) {
      break;
    }

    const fnStart = cursor + match.index;
    const parenIdx = text.indexOf('(', fnStart);
    const res = extractBalanced(text, parenIdx);

    if (!res) {
      cursor = fnStart + 4;
      continue;
    }

    let fullEnd = res.endIndex;
    // Check for nthroot(n)(x)
    if (match[1].toLowerCase() === 'nthroot') {
      const after = text.substring(res.endIndex + 1).trimStart();
      if (after.startsWith('(')) {
        const nextParen = text.indexOf('(', res.endIndex + 1);
        const res2 = extractBalanced(text, nextParen);
        if (res2) {
          fullEnd = res2.endIndex;
        }
      }
    }

    if (fnStart > cursor) {
      tokens.push({ type: 'text', value: text.substring(cursor, fnStart) });
    }

    tokens.push({ type: 'shorthand', value: text.substring(fnStart, fullEnd + 1) });
    cursor = fullEnd + 1;
  }

  if (cursor < text.length) {
    tokens.push({ type: 'text', value: text.substring(cursor) });
  }

  return tokens;
}

/**
 * Formats an entire text document, expanding all shorthands inside math delimiters
 * and converting standalone shorthand functions into $ ... $ blocks.
 */
export function convertTextShorthandsToLatex(fullText: string): string {
  if (!fullText) return '';

  // Process display math \[ ... \] or $$ ... $$
  const displayRegex = /(\\\[[\s\S]*?\\\]|\$\$[\s\S]*?\$\$)/g;
  const parts = fullText.split(displayRegex);

  return parts
    .map((part) => {
      if (part.startsWith('\\[') && part.endsWith('\\]')) {
        const math = part.slice(2, -2);
        return `\\[\n${convertShorthandToLatex(math)}\n\\]`;
      }
      if (part.startsWith('$$') && part.endsWith('$$')) {
        const math = part.slice(2, -2);
        return `$$\n${convertShorthandToLatex(math)}\n$$`;
      }

      // Inline math: \( ... \) or $ ... $
      const inlineMathRegex = /(\\\([\s\S]*?\\\)|(?<!\\)\$([^\$\n]+?)(?<!\\)\$)/g;
      const subParts = part.split(inlineMathRegex);

      return subParts
        .map((sub) => {
          if (!sub) return '';
          if (sub.startsWith('\\(') && sub.endsWith('\\)')) {
            const math = sub.slice(2, -2);
            return `\\(${convertShorthandToLatex(math)}\\)`;
          }
          if (sub.startsWith('$') && sub.endsWith('$')) {
            const math = sub.slice(1, -1);
            return `$${convertShorthandToLatex(math)}$`;
          }

          // Outside math delimiters: convert explicit shorthand functions like sqrt(x) -> $\sqrt{x}$
          const tokens = splitShorthandMathInPlainText(sub);
          return tokens
            .map((t) => {
              if (t.type === 'shorthand') {
                return `$${convertShorthandToLatex(t.value)}$`;
              }
              return t.value;
            })
            .join('');
        })
        .join('');
    })
    .join('');
}
