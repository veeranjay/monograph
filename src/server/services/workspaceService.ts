import { db } from "../db.js";
import * as subjects from "./subjectsService.js";
import * as sources from "./sourcesService.js";
import * as notes from "./notesService.js";
import * as pdfs from "./pdfService.js";
import * as logs from "./practiceLogsService.js";
import * as analytics from "./analyticsService.js";

export function initWorkspaceSchema() {
  db.exec(`CREATE TABLE IF NOT EXISTS workspace_state (
    item_id TEXT PRIMARY KEY, pinned INTEGER NOT NULL DEFAULT 0,
    trashed_at TEXT, updated_at TEXT NOT NULL
  ); CREATE TABLE IF NOT EXISTS workspace_settings (
    key TEXT PRIMARY KEY, value TEXT NOT NULL
  );`);
}

export function getWorkspace() {
  initWorkspaceSchema();
  return {
    subjects: subjects
      .getAllSubjects()
      .map((subject) => ({
        ...subject,
        note_count: (
          db
            .prepare("SELECT COUNT(*) AS n FROM notes WHERE subject_id = ?")
            .get(subject.id) as { n: number }
        ).n,
      })),
    sources: sources.getAllSources(),
    notes: notes.getAllNotes({ limit: 100000 }),
    pdfs: pdfs.getAllPdfs(),
    logs: logs.getAllLogs(),
    analytics: analytics.getAnalytics(),
    state: db.prepare("SELECT * FROM workspace_state").all(),
    settings: Object.fromEntries(
      (
        db.prepare("SELECT * FROM workspace_settings").all() as {
          key: string;
          value: string;
        }[]
      ).map((s) => [s.key, JSON.parse(s.value)]),
    ),
    documents: db
      .prepare(
        "SELECT id, object_id, title, blocks, created_at, updated_at FROM documents ORDER BY updated_at DESC",
      )
      .all(),
    review: db
      .prepare(
        `SELECT p.*, s.name AS source_name, sub.name AS subject_name,
      (SELECT result FROM attempts WHERE problem_id = p.id ORDER BY created_at DESC LIMIT 1) AS latest_result
      FROM problems p JOIN sources s ON s.id = p.source_id LEFT JOIN subjects sub ON sub.id = s.subject_id
      WHERE p.for_review = 1 OR EXISTS (SELECT 1 FROM attempts a WHERE a.problem_id = p.id AND a.for_review = 1)
      ORDER BY p.created_at DESC`,
      )
      .all(),
    activity: db
      .prepare(
        `SELECT a.id, a.problem_id, a.result, a.created_at, a.time_seconds,
      p.number, p.title, s.name AS source_name FROM attempts a
      JOIN problems p ON p.id = a.problem_id JOIN sources s ON s.id = p.source_id
      WHERE a.created_at >= datetime('now', '-15 days')
        OR a.id IN (SELECT id FROM attempts ORDER BY created_at DESC LIMIT 365)
      ORDER BY a.created_at DESC`,
      )
      .all(),
  };
}

export function updateItemState(
  id: string,
  changes: { pinned?: boolean; trashed?: boolean },
) {
  initWorkspaceSchema();
  const tables = [
    "notes",
    "sources",
    "subjects",
    "pdfs",
    "documents",
    "objects",
  ];
  if (
    !tables.some((table) =>
      db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(id),
    )
  ) {
    throw new Error("Item not found");
  }
  const existing = db
    .prepare("SELECT * FROM workspace_state WHERE item_id = ?")
    .get(id) as any;
  const pinned =
    changes.pinned === undefined
      ? (existing?.pinned ?? 0)
      : Number(changes.pinned);
  const trashed =
    changes.trashed === undefined
      ? (existing?.trashed_at ?? null)
      : changes.trashed
        ? new Date().toISOString()
        : null;
  db.prepare(
    `INSERT INTO workspace_state (item_id, pinned, trashed_at, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(item_id) DO UPDATE SET pinned = excluded.pinned, trashed_at = excluded.trashed_at, updated_at = excluded.updated_at`,
  ).run(id, pinned, trashed, new Date().toISOString());
  return { success: true };
}

export function setSettings(settings: Record<string, unknown>) {
  initWorkspaceSchema();
  const allowed = ["name", "appearance", "weeklyGoal", "compact"];
  if (Object.keys(settings).some((k) => !allowed.includes(k)))
    throw new Error("Unknown setting");
  if ("compact" in settings && typeof settings.compact !== "boolean")
    throw new Error("Compact spacing must be on or off");
  if (
    "name" in settings &&
    (typeof settings.name !== "string" || settings.name.length > 80)
  )
    throw new Error("Name must contain at most 80 characters");
  if (
    "appearance" in settings &&
    !["light", "dark", "system"].includes(String(settings.appearance))
  )
    throw new Error("Invalid appearance");
  if (
    "weeklyGoal" in settings &&
    (!Number.isInteger(settings.weeklyGoal) ||
      Number(settings.weeklyGoal) < 1 ||
      Number(settings.weeklyGoal) > 1000)
  )
    throw new Error("Weekly goal must be between 1 and 1000");
  const stmt = db.prepare(
    "INSERT INTO workspace_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  );
  db.exec("BEGIN");
  try {
    for (const [k, v] of Object.entries(settings))
      stmt.run(k, JSON.stringify(v));
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { success: true };
}

export function exportWorkspace() {
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
    )
    .all() as { name: string }[];
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    tables: Object.fromEntries(
      tables.map((t) => [
        t.name,
        db.prepare(`SELECT * FROM "${t.name}"`).all(),
      ]),
    ),
  };
}
