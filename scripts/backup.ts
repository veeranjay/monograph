import { DatabaseSync, backup } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const databasePath = path.resolve(process.env.DB_PATH || "monograph.db");
if (!fs.existsSync(databasePath))
  throw new Error(`Database does not exist: ${databasePath}`);
const directory = path.resolve(
  "backups",
  new Date().toISOString().replace(/[:.]/g, "-"),
);
fs.mkdirSync(directory, { recursive: true });
const db = new DatabaseSync(databasePath, { readOnly: true });
await backup(db, path.join(directory, "monograph.db"));
db.close();
const snapshot = new DatabaseSync(path.join(directory, "monograph.db"), {
  readOnly: true,
});
if (snapshot.prepare("PRAGMA integrity_check").get()!.integrity_check !== "ok")
  throw new Error("Backup integrity check failed");
const uploads = path.resolve(process.env.UPLOADS_DIR || "uploads/pdfs");
if (fs.existsSync(uploads))
  fs.cpSync(uploads, path.join(directory, "uploads/pdfs"), { recursive: true });
const tables = snapshot
  .prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
  )
  .all() as { name: string }[];
const counts = Object.fromEntries(
  tables.map((t) => [
    t.name,
    snapshot.prepare(`SELECT COUNT(*) AS n FROM "${t.name}"`).get()!.n,
  ]),
);
const sha256 = crypto
  .createHash("sha256")
  .update(fs.readFileSync(path.join(directory, "monograph.db")))
  .digest("hex");
fs.writeFileSync(
  path.join(directory, "manifest.json"),
  JSON.stringify(
    { createdAt: new Date().toISOString(), sha256, counts },
    null,
    2,
  ),
);
snapshot.close();
console.log(`Verified SQLite snapshot and PDF files saved to ${directory}`);
