import type { NoteBlock } from "../types/index.js";
import katex from "katex";
import { KATEX_ACADEMIC_MACROS } from "./katex.js";

export function cleanLatexMath(raw: string): string {
  if (!raw) return "";
  let str = raw.trim();

  // Strip outer $$ ... $$
  if (str.startsWith("$$") && str.endsWith("$$") && str.length >= 4) {
    str = str.slice(2, -2).trim();
  }
  // Strip outer \[ ... \]
  if (str.startsWith("\\[") && str.endsWith("\\]") && str.length >= 4) {
    str = str.slice(2, -2).trim();
  }
  // Strip outer $ ... $
  if (str.startsWith("$") && str.endsWith("$") && str.length >= 2) {
    str = str.slice(1, -1).trim();
  }

  // Convert align* or align to aligned
  str = str
    .replace(/\\begin\{align\*?\}/gi, "\\begin{aligned}")
    .replace(/\\end\{align\*?\}/gi, "\\end{aligned}")
    .replace(/\\label\{[^}]*\}/gi, "")
    .replace(/\\tag\{[^}]*\}/gi, "")
    .replace(/\\nonumber/gi, "");

  // Strip outer \begin{equation*?} ... \end{equation*?}
  str = str
    .replace(/\\begin\{equation\*?\}/gi, "")
    .replace(/\\end\{equation\*?\}/gi, "")
    .trim();

  // If the math contains alignment '&' and is not already wrapped in aligned/matrix/cases/array, wrap it in aligned
  if (
    str.includes("&") &&
    !/\\begin\{(aligned|matrix|bmatrix|pmatrix|vmatrix|cases|array)\}/.test(str)
  ) {
    str = `\\begin{aligned}\n${str}\n\\end{aligned}`;
  }

  return str;
}

export function renderKaTeXToString(
  raw: string,
  displayMode = true,
  extraMacros?: Record<string, string>,
): string {
  const cleaned = cleanLatexMath(raw);
  if (!cleaned) {
    return '<span class="text-outline/40 italic font-sans text-xs">Empty math formula</span>';
  }
  try {
    return katex.renderToString(cleaned, {
      displayMode,
      throwOnError: false,
      strict: false,
      trust: false,
      macros: { ...KATEX_ACADEMIC_MACROS, ...extraMacros },
    });
  } catch (e: any) {
    return `<div class="text-red-500 font-mono text-xs p-2 bg-red-500/10 rounded-lg">Math syntax error: ${e.message}</div>`;
  }
}

/**
 * Robust Overleaf & LaTeX importer.
 * - Skips preamble before \begin{document}
 * - Collects custom \newcommand and \DeclareMathOperator
 * - Normalizes align*, equation, and display math
 * - Preserves theorems, definitions, and proofs
 * - Joins paragraph lines cleanly so text flows without forced breaks
 */
export function parseLatexToBlocks(tex: string): NoteBlock[] {
  const blocks: NoteBlock[] = [];
  const lines = tex.split(/\r?\n/);
  let currentPara: string[] = [];
  let inPreamble = tex.includes("\\begin{document}");
  let inMathEnv: "align" | "equation" | "gather" | "bracket" | "dollar" | null =
    null;
  let mathBuffer: string[] = [];
  let inList: "bullet" | "numbered" | null = null;

  const flushPara = () => {
    if (currentPara.length > 0) {
      const text = currentPara.join(" ").trim();
      if (text) {
        blocks.push({
          id: crypto.randomUUID(),
          type: "paragraph",
          content: text,
        });
      }
      currentPara = [];
    }
  };

  const flushMath = () => {
    if (mathBuffer.length > 0) {
      const content = mathBuffer.join("\n").trim();
      if (content) {
        blocks.push({
          id: crypto.randomUUID(),
          type: "math",
          content: cleanLatexMath(content),
        });
      }
      mathBuffer = [];
      inMathEnv = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    // Check document boundary
    if (line.includes("\\begin{document}")) {
      inPreamble = false;
      continue;
    }
    if (line.includes("\\end{document}")) {
      break;
    }
    if (inPreamble) {
      continue;
    }

    // Skip comment lines
    if (line.startsWith("%")) continue;

    // Check if inside multi-line display math environment
    if (inMathEnv) {
      if (
        (inMathEnv === "align" &&
          (line.includes("\\end{align}") ||
            line.includes("\\end{align*}") ||
            line.includes("\\end{aligned}"))) ||
        (inMathEnv === "equation" &&
          (line.includes("\\end{equation}") ||
            line.includes("\\end{equation*}"))) ||
        (inMathEnv === "gather" &&
          (line.includes("\\end{gather}") ||
            line.includes("\\end{gather*}"))) ||
        (inMathEnv === "bracket" && line.includes("\\]")) ||
        (inMathEnv === "dollar" && line.includes("$$"))
      ) {
        let beforeClose = line.replace(
          /\\end\{(?:align\*?|aligned|equation\*?|gather\*?)\}|\\\]|\$\$/g,
          "",
        );
        if (beforeClose.trim()) mathBuffer.push(beforeClose.trim());
        if (inMathEnv === "align") mathBuffer.push("\\end{aligned}");
        flushMath();
        continue;
      } else {
        mathBuffer.push(rawLine);
        continue;
      }
    }

    // Check start of display math environment
    if (/\\begin\{(align\*?|aligned)\}/.test(line)) {
      flushPara();
      inMathEnv = "align";
      const after = line
        .replace(/.*\\begin\{(?:align\*?|aligned)\}/, "")
        .trim();
      if (after.includes("\\end{align") || after.includes("\\end{aligned")) {
        const content = after
          .replace(/\\end\{(?:align\*?|aligned)\}.*/, "")
          .trim();
        blocks.push({
          id: crypto.randomUUID(),
          type: "math",
          content: `\\begin{aligned}\n${content}\n\\end{aligned}`,
        });
        inMathEnv = null;
      } else {
        mathBuffer.push("\\begin{aligned}");
        if (after) mathBuffer.push(after);
      }
      continue;
    }

    if (/\\begin\{equation\*?\}/.test(line)) {
      flushPara();
      inMathEnv = "equation";
      const after = line.replace(/.*\\begin\{equation\*?\}/, "").trim();
      if (after.includes("\\end{equation")) {
        const content = after.replace(/\\end\{equation\*?\}.*/, "").trim();
        blocks.push({
          id: crypto.randomUUID(),
          type: "math",
          content,
        });
        inMathEnv = null;
      } else if (after) {
        mathBuffer.push(after);
      }
      continue;
    }

    if (/\\begin\{gather\*?\}/.test(line)) {
      flushPara();
      inMathEnv = "gather";
      const after = line.replace(/.*\\begin\{gather\*?\}/, "").trim();
      if (after.includes("\\end{gather")) {
        const content = after.replace(/\\end\{gather\*?\}.*/, "").trim();
        blocks.push({
          id: crypto.randomUUID(),
          type: "math",
          content,
        });
        inMathEnv = null;
      } else if (after) {
        mathBuffer.push(after);
      }
      continue;
    }

    if (line.startsWith("\\[") || line === "$$") {
      flushPara();
      inMathEnv = line.startsWith("\\[") ? "bracket" : "dollar";
      const after = line.slice(2).trim();
      if (after.endsWith("\\]") || after.endsWith("$$")) {
        const content = after.slice(0, -2).trim();
        blocks.push({
          id: crypto.randomUUID(),
          type: "math",
          content,
        });
        inMathEnv = null;
      } else if (after) {
        mathBuffer.push(after);
      }
      continue;
    }

    // Empty lines flush paragraphs
    if (!line) {
      flushPara();
      continue;
    }

    // Skip preamble or metadata commands
    if (
      /^\\(title|author|date|maketitle|documentclass|usepackage|geometry|hypersetup|pagestyle|thispagestyle|newcommand|DeclareMathOperator)/.test(
        line,
      )
    ) {
      continue;
    }

    // Section Headings
    if (/^\\section\*?\{/.test(line)) {
      flushPara();
      const m = line.match(/^\\section\*?\{([^}]+)\}/);
      if (m)
        blocks.push({
          id: crypto.randomUUID(),
          type: "h1",
          content: cleanLatexText(m[1]),
        });
      continue;
    }
    if (/^\\subsection\*?\{/.test(line)) {
      flushPara();
      const m = line.match(/^\\subsection\*?\{([^}]+)\}/);
      if (m)
        blocks.push({
          id: crypto.randomUUID(),
          type: "h2",
          content: cleanLatexText(m[1]),
        });
      continue;
    }
    if (/^\\subsubsection\*?\{/.test(line)) {
      flushPara();
      const m = line.match(/^\\subsubsection\*?\{([^}]+)\}/);
      if (m)
        blocks.push({
          id: crypto.randomUUID(),
          type: "h3",
          content: cleanLatexText(m[1]),
        });
      continue;
    }

    // Horizontal Dividers
    if (
      line.includes("\\hline") ||
      line.includes("\\hrule") ||
      line.includes("\\hrulefill")
    ) {
      flushPara();
      blocks.push({ id: crypto.randomUUID(), type: "divider", content: "" });
      continue;
    }

    // Theorem environments
    const thmMatch = line.match(
      /^\\begin\{(theorem|lemma|proposition|corollary|definition|example|proof)\}(?:\[(.*?)\])?/i,
    );
    if (thmMatch) {
      flushPara();
      const envName =
        thmMatch[1].charAt(0).toUpperCase() + thmMatch[1].slice(1);
      const optTitle = thmMatch[2] ? ` (${cleanLatexText(thmMatch[2])})` : "";
      blocks.push({
        id: crypto.randomUUID(),
        type: "h3",
        content: `**${envName}${optTitle}**`,
      });
      continue;
    }
    if (
      /^\\end\{(theorem|lemma|proposition|corollary|definition|example|proof)\}/i.test(
        line,
      )
    ) {
      flushPara();
      continue;
    }

    // Lists (itemize / enumerate)
    if (line.includes("\\begin{itemize}")) {
      flushPara();
      inList = "bullet";
      continue;
    }
    if (line.includes("\\begin{enumerate}")) {
      flushPara();
      inList = "numbered";
      continue;
    }
    if (line.includes("\\end{itemize}") || line.includes("\\end{enumerate}")) {
      flushPara();
      inList = null;
      continue;
    }
    if (inList && line.startsWith("\\item")) {
      flushPara();
      const itemContent = cleanLatexText(line.replace(/^\\item\s*/, ""));
      blocks.push({
        id: crypto.randomUUID(),
        type: inList,
        content: itemContent,
      });
      continue;
    }

    // Normal paragraph text — join with space so words flow seamlessly
    currentPara.push(cleanLatexText(line));
  }

  flushPara();
  flushMath();
  return blocks;
}

function cleanLatexText(str: string): string {
  return str
    .replace(/\\&/g, "&")
    .replace(/\\textbf\{([^}]+)\}/g, "**$1**")
    .replace(/\\textit\{([^}]+)\}/g, "*$1*")
    .replace(/\\emph\{([^}]+)\}/g, "*$1*")
    .replace(/\\underline\{([^}]+)\}/g, "<u>$1</u>")
    .replace(/\\texttt\{([^}]+)\}/g, "`$1`")
    .replace(/\\url\{([^}]+)\}/g, "[$1]($1)")
    .replace(/\\href\{([^}]+)\}\{([^}]+)\}/g, "[$2]($1)")
    .replace(/\\%/g, "%")
    .replace(/\\#/g, "#")
    .replace(/\\_/g, "_")
    .replace(/\\quad/g, "  ")
    .replace(/\\qquad/g, "    ");
}

export function blocksToLatex(title: string, blocks: NoteBlock[]): string {
  let tex = `% Generated by Monograph Academic Suite\n\\documentclass[11pt]{article}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amsmath,amssymb,amsfonts,amsthm}\n\\usepackage{geometry}\n\\geometry{a4paper, margin=1in}\n\n`;
  tex += `\\title{${title || "Untitled Manuscript"}}\n\\date{\\today}\n\n\\begin{document}\n\\maketitle\n\n`;

  for (const block of blocks) {
    if (block.type === "h1") {
      tex += `\\section{${block.content}}\n\n`;
    } else if (block.type === "h2") {
      tex += `\\subsection{${block.content}}\n\n`;
    } else if (block.type === "h3") {
      tex += `\\subsubsection{${block.content}}\n\n`;
    } else if (block.type === "math") {
      const math = cleanLatexMath(block.content);
      if (math.includes("\\begin{aligned}")) {
        tex += `${math.replace(/aligned/g, "align*")}\n\n`;
      } else {
        tex += `\\begin{equation}\n${math}\n\\end{equation}\n\n`;
      }
    } else if (block.type === "code") {
      tex += `\\begin{verbatim}\n${block.content}\n\\end{verbatim}\n\n`;
    } else if (block.type === "bullet") {
      tex += `\\begin{itemize}\n  \\item ${block.content}\n\\end{itemize}\n\n`;
    } else if (block.type === "numbered") {
      tex += `\\begin{enumerate}\n  \\item ${block.content}\n\\end{enumerate}\n\n`;
    } else if (block.type === "divider") {
      tex += `\\vspace{1em}\\hrulefill\\vspace{1em}\n\n`;
    } else {
      tex += `${block.content}\n\n`;
    }
  }

  tex += `\\end{document}\n`;
  return tex;
}

export function blocksToText(blocks: NoteBlock[]): string {
  const text = blocks
    .filter((b) => b.type !== "divider")
    .map((b) => b.content)
    .join(" ");
  return text.substring(0, 150) + (text.length > 150 ? "..." : "");
}
