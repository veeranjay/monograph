# Monograph

A calm, local workspace for notes, reading, practice, and reflection.

The latest refinement adds a neutral black/white/gray glass theme, larger system typography, a simpler home and library, and Expanded / Compact rail / Focus navigation modes. It fixes blank notebook navigation and reduces initial JavaScript by 53.8%. See [the refinement report](docs/REFINEMENT-REPORT.md).

Monograph 2 replaces the original interface with a responsive glass workspace, a unified library, automatic note saving, resumable practice, PDF highlights, and a focused review queue. Existing SQLite data is used in place, with an additive migration and no reset or demo seeding.

## Run

Requires Node.js 22.13 or newer and npm. This workspace was verified on Node.js 26.7.

```powershell
npm install
npm run dev
```

Open [Monograph](http://localhost:5173). The API runs on port 3001. Both servers are local by default.

For a production build served by one local process:

```powershell
npm run build
npm start
```

Then open [the built app](http://localhost:3001).

## Your data

The app reads `monograph.db` and the original PDFs in `uploads/pdfs`. Both are excluded from Git, together with backups and personal working files. Do not run the old demo seed command against your own database.

Create a complete SQLite snapshot with the PDF files:

```powershell
npm run backup
```

The timestamped folder in `backups` includes `monograph.db`, `uploads/pdfs`, and a manifest with record counts and a database checksum. Backup creation uses SQLite's backup API, including committed data in the write-ahead log, and checks the snapshot's integrity.

Settings also offers a JSON export of every database table. JSON export does not include the PDF binaries; use the full backup for those.

Optional environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `DB_PATH` | `./monograph.db` | Database location |
| `UPLOADS_DIR` | `./uploads/pdfs` | PDF storage location |
| `PORT` | `3001` | API / production app port |
| `HOST` | `127.0.0.1` | Server binding |

`DB_PATH` and `UPLOADS_DIR` should be set together when using a separate workspace. This is a personal local app; public deployment needs authentication and a separate hosting review.

## Checks

```powershell
npm run build
npm test
npm run test:legacy
npm run test:formatting
npm run test:browser
npm run verify:migration
npm audit
```

Install the test browser once with `npx playwright install chromium`. Browser tests use a temporary database and PDF directory, never the live workspace. Build before running them: the browser suite tests the production bundle. If the original migration snapshot is available, it is copied into the temporary test database; otherwise a fresh isolated workspace is created.

`verify:migration` compares the live data to `backups/pre-revamp-2026-11-05/monograph.db`. It is intended for verifying this migration before subsequent user edits. Legitimate later edits will change its result. Pass another baseline path as an argument when needed.

## Review and maintenance

- [Revamp report](docs/REVAMP-REPORT.md): design, flows, architecture, added features, test results, and limitations.
- [Migration verification](docs/MIGRATION-VERIFICATION.json): table-by-table preservation and PDF checksums.
- [Architecture](PROJECT.md): the current code map and persistence boundaries.
- [Previews](docs/previews): desktop, mobile, library, and dark appearance screenshots.

Source repository: [veeranjay/monograph](https://github.com/veeranjay/monograph).

The initial commit captures the revamped app and review reports. The live database, uploaded PDFs, backups, local working files, and unrelated output files remain on the device and are excluded from Git.
