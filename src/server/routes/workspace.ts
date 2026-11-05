import { Router } from "express";
import crypto from "node:crypto";
import { db } from "../db.js";
import * as workspace from "../services/workspaceService.js";
import * as sourcesService from "../services/sourcesService.js";
import * as practiceLogsService from "../services/practiceLogsService.js";
import * as attemptsService from "../services/attemptsService.js";
import * as notesService from "../services/notesService.js";
import * as problemsService from "../services/problemsService.js";

export const workspaceRouter = Router();

workspaceRouter.post("/workspace/sheets", (req, res) => {
  const { name, subject_id, problem_count = 0 } = req.body;
  if (typeof name !== "string" || !name.trim() || name.length > 250)
    return res.status(400).json({ error: "Give your sheet a name" });
  if (
    !Number.isInteger(problem_count) ||
    problem_count < 0 ||
    problem_count > 1000
  )
    return res
      .status(400)
      .json({ error: "Choose between 0 and 1000 problems" });
  db.exec("BEGIN");
  try {
    const sheet = sourcesService.createSource({
      name: name.trim(),
      subject_id: subject_id || null,
    });
    if (problem_count)
      problemsService.batchCreateProblems(sheet.id, 1, problem_count);
    db.exec("COMMIT");
    return res.status(201).json(sheet);
  } catch (error: any) {
    db.exec("ROLLBACK");
    return res.status(400).json({ error: error.message });
  }
});

workspaceRouter.get("/workspace", (_req, res) => {
  try {
    res.json(workspace.getWorkspace());
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
workspaceRouter.post("/workspace/sessions/start", (req, res) => {
  try {
    const { source_id, problem_id } = req.body;
    if (
      typeof source_id !== "string" ||
      !sourcesService.getSourceById(source_id)
    )
      return res.status(400).json({ error: "Choose an existing sheet" });
    if (
      problem_id &&
      (
        db
          .prepare("SELECT source_id FROM problems WHERE id = ?")
          .get(problem_id) as any
      )?.source_id !== source_id
    )
      return res
        .status(400)
        .json({ error: "Problem must belong to the selected sheet" });
    const existing = practiceLogsService.getActiveLog(source_id);
    if (existing) return res.json(existing);
    return res
      .status(201)
      .json(
        practiceLogsService.createLog({
          source_id,
          current_problem_id: problem_id,
        }),
      );
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
});
workspaceRouter.post("/workspace/sessions/:id/attempt", (req, res) => {
  const body = req.body;
  if (
    typeof body.id !== "string" ||
    !body.id ||
    !["solved", "partial", "failed", "skipped"].includes(body.result)
  )
    return res.status(400).json({ error: "Choose a result before saving" });
  for (const key of ["time_seconds", "session_time_seconds"])
    if (!Number.isFinite(body[key]) || body[key] < 0)
      return res
        .status(400)
        .json({ error: "Duration must be a positive number" });
  db.exec("BEGIN");
  try {
    const existing = db
      .prepare("SELECT id, log_id FROM attempts WHERE id = ?")
      .get(body.id) as any;
    if (existing) {
      db.exec("ROLLBACK");
      if (existing.log_id !== req.params.id)
        return res
          .status(409)
          .json({ error: "Attempt identifier already used" });
      return res.json({ success: true, id: existing.id });
    }
    const log = practiceLogsService.getLogById(req.params.id);
    if (!log || log.status === "completed")
      throw new Error("This session is no longer active");
    if (
      (
        db
          .prepare("SELECT source_id FROM problems WHERE id = ?")
          .get(body.problem_id) as any
      )?.source_id !== log.source_id
    )
      throw new Error("Problem must belong to this sheet");
    if (
      body.next_problem_id &&
      (
        db
          .prepare("SELECT source_id FROM problems WHERE id = ?")
          .get(body.next_problem_id) as any
      )?.source_id !== log.source_id
    )
      throw new Error("Next problem must belong to this sheet");
    const attempt = attemptsService.createAttempt({ ...body, log_id: log.id });
    practiceLogsService.updateLog(log.id, {
      current_problem_id: body.next_problem_id || body.problem_id,
      time_seconds: Math.max(
        log.time_seconds,
        Math.floor(body.session_time_seconds),
      ),
      notes_draft: null,
    });
    db.exec("COMMIT");
    return res.status(201).json({ success: true, id: attempt.id });
  } catch (error: any) {
    db.exec("ROLLBACK");
    return res.status(400).json({ error: error.message });
  }
});
workspaceRouter.put("/workspace/items/:id", (req, res) => {
  try {
    if (
      Object.entries(req.body).some(
        ([key, value]) =>
          !["pinned", "trashed"].includes(key) || typeof value !== "boolean",
      )
    )
      return res
        .status(400)
        .json({ error: "Expected pinned or trashed boolean" });
    res.json(workspace.updateItemState(req.params.id, req.body));
  } catch (error: any) {
    res
      .status(error.message === "Item not found" ? 404 : 400)
      .json({ error: error.message });
  }
});
workspaceRouter.put("/workspace/settings", (req, res) => {
  try {
    res.json(workspace.setSettings(req.body));
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});
workspaceRouter.get("/workspace/export", (_req, res) => {
  try {
    res
      .attachment("monograph-workspace.json")
      .json(workspace.exportWorkspace());
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
workspaceRouter.post("/workspace/inbox/:id/note", (req, res) => {
  import("../db.js")
    .then(({ db }) => {
      if (typeof req.body.title !== "string" || !req.body.title.trim())
        return res.status(400).json({ error: "A title is required" });
      db.exec("BEGIN");
      try {
        const item = db
          .prepare("SELECT * FROM inbox WHERE id = ? AND processed = 0")
          .get(req.params.id) as any;
        if (!item) {
          db.exec("ROLLBACK");
          return res.status(404).json({ error: "Captured thought not found" });
        }
        const note = notesService.createNote({
          title: req.body.title.trim(),
          subject_id: req.body.subject_id || null,
          content: JSON.stringify([
            {
              id: crypto.randomUUID(),
              type: "paragraph",
              content: item.content,
            },
          ]),
        });
        db.prepare("UPDATE inbox SET processed = 1 WHERE id = ?").run(
          req.params.id,
        );
        db.exec("COMMIT");
        return res.status(201).json(note);
      } catch (error: any) {
        db.exec("ROLLBACK");
        return res.status(400).json({ error: error.message });
      }
    })
    .catch((error) => res.status(500).json({ error: error.message }));
});

workspaceRouter.post("/problems/:id/reviewed", (req, res) => {
  // Clear both historical attempt flags and the problem flag atomically.
  import("../db.js")
    .then(({ db }) => {
      db.exec("BEGIN");
      try {
        if (
          !db.prepare("SELECT id FROM problems WHERE id = ?").get(req.params.id)
        ) {
          db.exec("ROLLBACK");
          res.status(404).json({ error: "Problem not found" });
          return;
        }
        db.prepare("UPDATE problems SET for_review = 0 WHERE id = ?").run(
          req.params.id,
        );
        db.prepare(
          "UPDATE attempts SET for_review = 0 WHERE problem_id = ?",
        ).run(req.params.id);
        db.exec("COMMIT");
        res.json({ success: true });
      } catch (error: any) {
        db.exec("ROLLBACK");
        res.status(500).json({ error: error.message });
      }
    })
    .catch((error) => res.status(500).json({ error: error.message }));
});
