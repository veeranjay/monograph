import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const baselinePath = path.resolve(
  process.argv[2] || "backups/pre-revamp-2026-11-05/monograph.db",
);
const currentPath = path.resolve(process.env.DB_PATH || "monograph.db");
const baseline = new DatabaseSync(baselinePath, { readOnly: true });
const current = new DatabaseSync(currentPath, { readOnly: true });
const names = baseline
  .prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
  )
  .all() as { name: string }[];
const results = names.map(({ name }) => {
  const rows = baseline.prepare(`SELECT * FROM "${name}"`).all();
  const now = current.prepare(`SELECT * FROM "${name}"`).all();
  const stable = (values: unknown[]) =>
    crypto
      .createHash("sha256")
      .update(
        values
          .map((v) => JSON.stringify(v))
          .sort()
          .join("\n"),
      )
      .digest("hex");
  const currentRows = new Set(now.map((row) => JSON.stringify(row)));
  const originalRowsPreserved = rows.every((row) =>
    currentRows.has(JSON.stringify(row)),
  );
  const allowedBackfill = ["objects", "relations"].includes(name);
  return {
    table: name,
    before: rows.length,
    after: now.length,
    unchanged: stable(rows) === stable(now),
    originalRowsPreserved,
    addedRows: now.length - rows.length,
    passed:
      originalRowsPreserved && (rows.length === now.length || allowedBackfill),
  };
});
const pdfs = baseline.prepare("SELECT filename, file_path FROM pdfs").all() as {
  filename: string;
  file_path: string;
}[];
const pdfResults = pdfs.map((pdf) => {
  const filename = path.basename(pdf.file_path.replaceAll("\\", "/"));
  const original = path.resolve(
    path.dirname(baselinePath),
    "uploads/pdfs",
    filename,
  );
  const currentFile = path.resolve(
    process.env.UPLOADS_DIR || "uploads/pdfs",
    filename,
  );
  const hash = (file: string) =>
    crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  return {
    filename: pdf.filename,
    unchanged:
      fs.existsSync(original) &&
      fs.existsSync(currentFile) &&
      hash(original) === hash(currentFile),
  };
});
const integrity = current.prepare("PRAGMA integrity_check").get()!
  .integrity_check;
const foreignKeys = current.prepare("PRAGMA foreign_key_check").all();
const passed =
  results.every((r) => r.passed) &&
  pdfResults.every((r) => r.unchanged) &&
  integrity === "ok" &&
  foreignKeys.length === 0;
const report = {
  verifiedAt: new Date().toISOString(),
  baseline: baselinePath,
  current: currentPath,
  passed,
  integrity,
  foreignKeyViolations: foreignKeys.length,
  tables: results,
  pdfs: pdfResults,
};
fs.mkdirSync("docs", { recursive: true });
fs.writeFileSync(
  "docs/MIGRATION-VERIFICATION.json",
  JSON.stringify(report, null, 2) + "\n",
);
baseline.close();
current.close();
console.log(JSON.stringify(report, null, 2));
if (!passed) process.exitCode = 1;
