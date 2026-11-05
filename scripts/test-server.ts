import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync, backup } from "node:sqlite";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "monograph-browser-"));
process.env.NODE_ENV = "test";
process.env.DB_PATH = path.join(directory, "workspace.db");
process.env.UPLOADS_DIR = path.join(directory, "uploads/pdfs");
const originalPath = path.resolve("backups/pre-revamp-2026-11-05/monograph.db");
if (fs.existsSync(originalPath)) {
  const original = new DatabaseSync(originalPath, { readOnly: true });
  await backup(original, process.env.DB_PATH);
  original.close();
}
if (fs.existsSync("uploads/pdfs"))
  fs.cpSync("uploads/pdfs", process.env.UPLOADS_DIR, { recursive: true });
const { initDatabase, setDb, closeDatabase } =
  await import("../src/server/db.js");
const db = initDatabase(process.env.DB_PATH);
setDb(db);
const subjects = await import("../src/server/services/subjectsService.js");
const sources = await import("../src/server/services/sourcesService.js");
const problems = await import("../src/server/services/problemsService.js");
const notes = await import("../src/server/services/notesService.js");
const subject = subjects.createSubject({
  name: "Browser workflows",
  color: "#9b88c7",
});
const source = sources.createSource({
  name: "Browser practice sheet",
  subject_id: subject.id,
});
for (let n = 1; n <= 3; n++)
  problems.createProblem({
    source_id: source.id,
    number: String(n),
    title: `Browser problem ${n}`,
  });
notes.createNote({
  title: "Browser note",
  subject_id: subject.id,
  content: "[]",
});
const { app } = await import("../src/server/server.js");
const server = app.listen(4178, "127.0.0.1", () =>
  console.log("Isolated browser test server on http://127.0.0.1:4178"),
);
const stop = () => {
  server.close(() => {
    closeDatabase();
    const resolved = path.resolve(directory);
    const prefix = path.resolve(os.tmpdir(), "monograph-browser-");
    if (!resolved.startsWith(prefix))
      throw new Error(
        "Refusing to remove a directory outside the test workspace",
      );
    fs.rmSync(resolved, { recursive: true, force: true });
    process.exit(0);
  });
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
