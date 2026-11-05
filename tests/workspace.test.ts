import { before, after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { initDatabase, setDb, closeDatabase } from "../src/server/db.js";
import { app } from "../src/server/server.js";
import * as workspace from "../src/server/services/workspaceService.js";
import * as subjects from "../src/server/services/subjectsService.js";
import * as sources from "../src/server/services/sourcesService.js";
import * as problems from "../src/server/services/problemsService.js";
import * as notes from "../src/server/services/notesService.js";
import * as logs from "../src/server/services/practiceLogsService.js";
import { assertTestIsolation } from "../src/server/guardrails.js";

process.env.NODE_ENV = "test";
describe("Monograph workspace — migration and real API behavior", () => {
  let server: Server;
  let base: string;
  let db: DatabaseSync;
  let subject: any;
  let source: any;
  let problem: any;
  let second: any;
  let note: any;
  before(async () => {
    db = initDatabase(":memory:");
    setDb(db);
    subject = subjects.createSubject({ name: "Workspace test" });
    source = sources.createSource({
      name: "Practice sheet",
      subject_id: subject.id,
    });
    problem = problems.createProblem({ source_id: source.id, number: "1" });
    second = problems.createProblem({ source_id: source.id, number: "2" });
    note = notes.createNote({
      title: "A preserved note",
      subject_id: subject.id,
      content:
        '[{"id":"block-1","type":"paragraph","content":"Original content"}]',
    });
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  });
  after(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())),
    );
    closeDatabase();
  });
  async function call(
    url: string,
    body?: unknown,
    method = body ? "POST" : "GET",
  ) {
    const response = await fetch(base + url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, body: await response.json() };
  }
  it("refuses to run tests against the user database", () =>
    assert.throws(() => assertTestIsolation("monograph.db"), /GUARDRAIL/));
  it("keeps schema initialization idempotent and existing notes byte-for-byte intact", () => {
    const before = db.prepare("SELECT * FROM notes WHERE id = ?").get(note.id);
    workspace.initWorkspaceSchema();
    workspace.initWorkspaceSchema();
    assert.deepEqual(
      db.prepare("SELECT * FROM notes WHERE id = ?").get(note.id),
      before,
    );
    assert.equal(
      db.prepare("PRAGMA integrity_check").get()!.integrity_check,
      "ok",
    );
  });
  it("loads existing notes, sheets, notebooks, and analytics together", async () => {
    const { status, body } = await call("/workspace");
    assert.equal(status, 200);
    assert.ok(body.notes.some((n: any) => n.id === note.id));
    assert.ok(body.sources.some((s: any) => s.id === source.id));
    assert.equal(body.analytics.totalAttempts, 0);
  });
  it("pins and unpins items without rewriting their content", async () => {
    await call(`/workspace/items/${note.id}`, { pinned: true }, "PUT");
    assert.equal(
      (await call("/workspace")).body.state.find(
        (s: any) => s.item_id === note.id,
      ).pinned,
      1,
    );
    await call(`/workspace/items/${note.id}`, { pinned: false }, "PUT");
    assert.equal(notes.getNoteById(note.id)!.content, note.content);
  });
  it("trashes and restores a notebook without cascading deletes", async () => {
    await call(`/workspace/items/${subject.id}`, { trashed: true }, "PUT");
    assert.ok(
      (await call("/workspace")).body.state.find(
        (s: any) => s.item_id === subject.id,
      ).trashed_at,
    );
    assert.ok(sources.getSourceById(source.id));
    assert.ok(problems.getProblemById(problem.id));
    await call(`/workspace/items/${subject.id}`, { trashed: false }, "PUT");
    assert.equal(
      (await call("/workspace")).body.state.find(
        (s: any) => s.item_id === subject.id,
      ).trashed_at,
      null,
    );
  });
  it("validates state payloads and missing items", async () => {
    assert.equal(
      (await call(`/workspace/items/${note.id}`, { pinned: "yes" }, "PUT"))
        .status,
      400,
    );
    assert.equal(
      (await call("/workspace/items/missing", { pinned: true }, "PUT")).status,
      404,
    );
  });
  it("stores preferences and validates goals and appearance", async () => {
    assert.equal(
      (
        await call(
          "/workspace/settings",
          { name: "Asha", weeklyGoal: 12, appearance: "dark", compact: true },
          "PUT",
        )
      ).status,
      200,
    );
    assert.equal((await call("/workspace")).body.settings.weeklyGoal, 12);
    for (const body of [
      { weeklyGoal: -1 },
      { weeklyGoal: 1.5 },
      { appearance: "glitter" },
      { unknown: true },
    ])
      assert.equal(
        (await call("/workspace/settings", body, "PUT")).status,
        400,
      );
  });
  it("exports all tables, including legacy documents and relations", async () => {
    const { body } = await call("/workspace/export");
    assert.equal(body.version, 2);
    for (const name of [
      "notes",
      "pdfs",
      "pdf_highlights",
      "objects",
      "documents",
      "relations",
      "practice_logs",
      "workspace_settings",
    ])
      assert.ok(Array.isArray(body.tables[name]));
    assert.equal(
      body.tables.notes.find((n: any) => n.id === note.id).content,
      note.content,
    );
  });
  it("converts inbox thoughts to real notes in one transaction", async () => {
    const capture = await call("/inbox", {
      content: "Keep this original thought",
    });
    const converted = await call(`/workspace/inbox/${capture.body.id}/note`, {
      title: "A thought with a home",
      subject_id: subject.id,
    });
    assert.equal(converted.status, 201);
    assert.match(converted.body.content, /Keep this original thought/);
    assert.equal(
      db
        .prepare("SELECT processed FROM inbox WHERE id = ?")
        .get(capture.body.id)!.processed,
      1,
    );
    assert.equal(
      (
        await call(`/workspace/inbox/${capture.body.id}/note`, {
          title: "Duplicate",
        })
      ).status,
      404,
    );
  });
  it("rolls back failed inbox conversions", async () => {
    const capture = await call("/inbox", { content: "Do not lose me" });
    assert.equal(
      (
        await call(`/workspace/inbox/${capture.body.id}/note`, {
          title: "Invalid notebook",
          subject_id: "missing",
        })
      ).status,
      400,
    );
    assert.equal(
      db
        .prepare("SELECT processed FROM inbox WHERE id = ?")
        .get(capture.body.id)!.processed,
      0,
    );
  });
  it("starts a session once and resumes it on repeated requests", async () => {
    const first = await call("/workspace/sessions/start", {
      source_id: source.id,
    });
    const next = await call("/workspace/sessions/start", {
      source_id: source.id,
    });
    assert.equal(first.body.id, next.body.id);
    assert.equal(logs.getAllLogs().length, 1);
  });
  it("rejects unrelated problems when starting sessions", async () => {
    assert.equal(
      (
        await call("/workspace/sessions/start", {
          source_id: source.id,
          problem_id: "missing",
        })
      ).status,
      400,
    );
  });
  it("atomically saves an attempt and advances the session; retry does not duplicate", async () => {
    const log = logs.getActiveLog(source.id)!;
    const body = {
      id: "idempotent-attempt",
      problem_id: problem.id,
      result: "partial",
      notes: "A useful reflection",
      for_review: true,
      time_seconds: 34,
      session_time_seconds: 60,
      next_problem_id: second.id,
    };
    assert.equal(
      (await call(`/workspace/sessions/${log.id}/attempt`, body)).status,
      201,
    );
    assert.equal(
      (await call(`/workspace/sessions/${log.id}/attempt`, body)).status,
      200,
    );
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM attempts").get()!.n, 1);
    assert.equal(logs.getLogById(log.id)!.current_problem_id, second.id);
    assert.equal(logs.getLogById(log.id)!.time_seconds, 60);
    assert.ok(
      (await call("/workspace")).body.review.some(
        (p: any) => p.id === problem.id,
      ),
    );
  });
  it("rejects invalid results and durations without adding attempts", async () => {
    const log = logs.getActiveLog(source.id)!;
    for (const patch of [
      { result: "magic" },
      { time_seconds: -5 },
      { session_time_seconds: "60" },
    ]) {
      assert.equal(
        (
          await call(`/workspace/sessions/${log.id}/attempt`, {
            id: "invalid",
            problem_id: second.id,
            result: "solved",
            time_seconds: 5,
            session_time_seconds: 65,
            ...patch,
          })
        ).status,
        400,
      );
    }
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM attempts").get()!.n, 1);
  });
  it("rolls back the entire save when the next problem is invalid", async () => {
    const log = logs.getActiveLog(source.id)!;
    assert.equal(
      (
        await call(`/workspace/sessions/${log.id}/attempt`, {
          id: "rolled-back",
          problem_id: second.id,
          result: "solved",
          time_seconds: 9,
          session_time_seconds: 69,
          next_problem_id: "missing",
        })
      ).status,
      400,
    );
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM attempts").get()!.n, 1);
    assert.equal(logs.getLogById(log.id)!.time_seconds, 60);
  });
  it("clears historical and current flags when a problem is understood", async () => {
    assert.equal(
      (await call(`/problems/${problem.id}/reviewed`, {})).status,
      200,
    );
    assert.equal((await call("/workspace")).body.review.length, 0);
    assert.equal(
      db
        .prepare("SELECT for_review FROM attempts WHERE id = ?")
        .get("idempotent-attempt")!.for_review,
      0,
    );
  });
  it("creates a sheet and its numbered problems atomically", async () => {
    const response = await call("/workspace/sheets", {
      name: "Atomic sheet",
      subject_id: subject.id,
      problem_count: 4,
    });
    assert.equal(response.status, 201);
    assert.equal(sources.getSourceById(response.body.id)!.problems.length, 4);
    const before = db.prepare("SELECT COUNT(*) AS n FROM sources").get()!.n;
    assert.equal(
      (
        await call("/workspace/sheets", {
          name: "Invalid sheet",
          subject_id: "missing",
          problem_count: 4,
        })
      ).status,
      400,
    );
    assert.equal(
      db.prepare("SELECT COUNT(*) AS n FROM sources").get()!.n,
      before,
    );
  });
  it("rejects invalid batch sizes without creating partial sheets", async () => {
    for (const count of [-1, 1001, 2.5])
      assert.equal(
        (
          await call("/workspace/sheets", {
            name: "Bad batch",
            problem_count: count,
          })
        ).status,
        400,
      );
  });
  it("refuses attempts for completed sessions", async () => {
    const log = logs.getActiveLog(source.id)!;
    logs.completeLog(log.id);
    assert.equal(
      (
        await call(`/workspace/sessions/${log.id}/attempt`, {
          id: "too-late",
          problem_id: second.id,
          result: "solved",
          time_seconds: 5,
          session_time_seconds: 65,
        })
      ).status,
      400,
    );
  });
});
