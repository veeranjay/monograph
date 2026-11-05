# Monograph revamp review

Completed 5 November 2026.

**Follow-up:** the typography, navigation bug fix, neutral theme, lighter JavaScript payload, and new sidebar modes are documented in the [refinement report](REFINEMENT-REPORT.md). The visual and animation descriptions below describe the first version, before that refinement.

Monograph now has a new interface and frontend architecture built around organizing, studying, and reviewing. Existing study records and PDF files are preserved. GitHub publication is deferred, following your instruction to work on the app first.

## What changed visually

The attached references informed the quieter navigation, spacious cards, and clear hierarchy. The resulting design uses a warm white and lavender palette, frosted translucent surfaces, restrained gradients, soft borders, glass forms, and editorial typography. The layout and copy are specific to your study workspace.

| Area | New behavior |
| --- | --- |
| Application shell | Persistent labelled navigation, compact sidebar option, mobile drawer, global search, contextual creation |
| Home | A clear resume action, recent real resources, optional pinned resources, a configurable weekly goal |
| Library | Notes, PDFs, sheets, and existing workspace documents together, with type/notebook filters, search, sorting, and grid/list views |
| Notebooks | Visual notebook covers and a focused view of each notebook's resources |
| Practice | One current problem, space for working, a deliberate result choice, then save and advance |
| Writing | A quiet block editor, automatic saving, math support, focus mode, and a separate reading preview |
| Reading | Locally bundled PDF renderer and worker, zoom, pagination, selectable text, saved highlights, and thoughts attached to highlights |
| Review | One queue of explicitly flagged problems, with an understood action |
| Insights | Actual recorded attempts, result breakdown, recent history, and 14 days of activity |
| Settings | Personal name, weekly goal, light/dark/system appearance, compact spacing, and data export |

Motion is used for page transitions and card layout changes. Radix primitives provide keyboard-accessible dialogs and menus, with focus handling and Escape dismissal. Reduced-motion preferences disable page movement and use a static route container.

Preview images:

- [Desktop home](previews/home-desktop.png)
- [Library](previews/library-desktop.png)
- [Mobile home](previews/home-mobile.png)
- [Dark appearance](previews/home-dark.png)

## The main flows

**Organize:** create a notebook, then add notes, PDFs, or problem sheets in context. A new sheet can create its numbered problems in the same transaction. Move a sheet or note between notebooks without recreating it.

**Study:** choose a sheet or continue an existing session. A sheet reuses its existing active session. The current problem and working draft persist. Choose a result, save once, and advance. Extra reflection fields remain behind a disclosure instead of dominating the screen. Nothing assumes the attempt was solved before you choose a result.

**Review:** flag a problem while practicing or from its history. Both problem flags and historical attempt flags feed the queue. Marking it understood clears those flags atomically, so a historical flag cannot keep it stuck in the queue.

**Capture:** save a loose thought to the inbox. Convert it to a real note when ready. Note creation and inbox processing happen together in a transaction; a failed conversion leaves the thought in the inbox.

**Write:** start with a title and add text, headings, lists, equations, code, or dividers. Use Markdown and LaTeX, preview equations, reorder blocks, import LaTeX, and export Markdown or LaTeX. Changes save automatically, with an explicit saved/pending/error state and a recovery copy on the device.

**Recover:** move a resource or an entire notebook to trash without deleting its data. Restore it later. No permanent-delete or automatic-expiry flow was added to the new UI.

## Added features and robustness work

- Persistent pinning and recoverable trash, including whole-notebook restoration.
- Unified resource search and keyboard shortcuts: `Ctrl/Command K` for search, `Ctrl/Command Shift N` for a new note, and `Ctrl/Command S` inside the editor.
- Serialized note/draft saving, immediate navigation flush, local recovery, and retry feedback.
- Transactional attempt saving and session advancement, with retry-safe attempt identifiers.
- Transactional sheet creation and numbered-problem creation.
- Completed-session history, including unfinished working notes that were not counted as attempts.
- Searchable math and formatting completions, with keyboard navigation and editable placeholders.
- Full JSON database export and a separate complete backup command including PDF files.
- Portable PDF lookup inside the current workspace's uploads directory, rather than relying on another computer's absolute paths.
- Upload size and PDF signature checks; invalid notebook references are rejected before writing an uploaded file.
- A backend that binds to the local machine by default.
- New isolated browser tests against the production bundle, with independent temporary database and PDF storage.

The interface uses your actual notebook and resource names. There is no fabricated user profile, artificial storage quota, invented streak, or demo content added to the live workspace.

## Architecture decisions

The old frontend combined route parsing, navigation state, fetching, large forms, and screen-specific behavior across oversized components. Twenty-two obsolete components were removed from the active frontend after retaining a local archive.

The replacement separates routes, the application shell, reusable controls, query state, saving, rendering helpers, and focused page modules. React Router replaces the manual hash switch. TanStack Query replaces repeated independent fetch loops with shared data and invalidation. Radix handles modal/menu interaction. Motion handles navigation and layout animation. Sonner provides action feedback.

The editor, PDF reader, problem history, and practice workspace are loaded separately. PDF rendering and math rendering have their own bundles. The PDF engine remains a relatively large optional download; it is loaded when opening a PDF rather than on the home screen.

The SQLite study tables remain authoritative. Their identifiers and formats did not need to change to support the new app. This was a deliberate migration choice: use the existing records directly and add the two small state/preferences tables instead of copying the entire study history into a new schema.

The existing generic object/relation engine and compatibility API remain available. The new UI does not depend on their potentially stale mirrors. Existing workspace documents are shown separately so that similarly named legacy documents are preserved instead of silently merged with notes. See [the architecture map](../PROJECT.md).

## Data migration and preservation

Before the first app startup, a consistent SQLite backup was made using SQLite's backup API, including committed write-ahead-log data. All PDF files were copied with it.

Initial snapshot: `backups/pre-revamp-2026-11-05`.

| Existing data | Before | After |
| --- | ---: | ---: |
| Notebooks / subjects | 1 | 1 |
| Problem sheets | 6 | 6 |
| Problems | 497 | 497 |
| Attempts | 83 | 83 |
| Practice sessions | 6 | 6 |
| Notes | 1 | 1 |
| Workspace documents | 3 | 3 |
| PDF files | 5 | 5 |

Every original row in all 25 original tables is preserved with its original values. All five PDF files match their original SHA-256 checksums. SQLite reports `integrity_check = ok`, with zero foreign-key violations.

The pre-existing startup bridge also inserted 10 missing generic object mirrors and 20 missing relationships. These are additive compatibility records; no original object, relationship, or study record was replaced. The verification report distinguishes unchanged tables, preserved original rows, and these additions.

A fresh post-revamp backup was also created in `backups/2026-11-05T12-48-49-911Z`. The removed frontend components are archived in `backups/legacy-client-components-2026-11-05`.

See [the machine-readable verification](MIGRATION-VERIFICATION.json). `npm run verify:migration` reproduces the comparison before later legitimate user edits.

## Verification

| Check | Result |
| --- | --- |
| Strict TypeScript compilation and production build | Passed |
| New workspace/API tests | 19 passed |
| Existing backend regression tests | 78 passed |
| Existing formatting regression tests | 34 passed |
| Production browser workflows | 13 passed |
| Automated WCAG A/AA checks on Home, Library, Practice, Settings, and dark Home | No reported violations in the tested pages/states |
| Mobile navigation and horizontal overflow at 390 px | Passed |
| Database integrity, original-row preservation, and PDF checksums | Passed |
| Dependency audit | Zero reported vulnerabilities |

The 13 browser scenarios cover creation, autosaving, reloads, immediate navigation, pin/trash/restore, global search, inbox conversion, complete practice workflows, PDF rendering and highlights, math completion, notebook restoration, persistent preferences, mobile navigation, and reduced motion/accessibility.

Two legacy tests were corrected where their assertions no longer described valid behavior: decoded metadata is accepted as an object as well as a legacy JSON string, and SQLite record preservation is checked rather than physical file size, which may change after a WAL checkpoint. Production-data inspection in those tests was made read-only.

Automated accessibility checks complement visual review; they do not establish full accessibility conformance for every possible document or interaction.

## Remaining limitations and review points

- This is still a personal local app. It does not add account authentication, multi-user collaboration, or cloud synchronization. Public deployment needs a separate review.
- Simultaneous editing of the same note in multiple tabs uses the last completed save. Local recovery belongs to the browser/device where the draft was written.
- The editor uses Markdown/LaTeX blocks with a reading preview. It is not a full word processor or TeX compiler; complex imported LaTeX should be reviewed after conversion.
- JSON export includes database records, not PDF binaries. Complete backups include both. Restore/import is a documented file workflow, not a new in-app import wizard.
- Generic graph and saved-view APIs are retained for compatibility but do not have new dedicated visual builders.
- Existing PDF page-count metadata is preserved; the reader displays the actual loaded document's page count.
- Google Fonts is optional network-loaded typography. Core application assets and the PDF worker are served locally, with system-font fallbacks.
- Pin/trash state is shared in SQLite; the collapsed-sidebar toggle and temporary open panels are transient UI choices.
- GitHub has not been initialized or pushed. The folder originally had no Git history or remote, and you explicitly deferred that step. `.gitignore` excludes the live database, PDFs, backups, personal agent history, and generated test/build files from a future commit.

## Review locally

The development app is available at [localhost:5173](http://localhost:5173). Start it again later with `npm run dev`. Use `npm run build` and `npm start` for a single-process local production preview at [localhost:3001](http://localhost:3001).

Try continuing your existing session, opening an existing sheet or PDF, writing a new note, and restoring an item from trash. Your existing notebook is the starting point throughout.

Implementation references: [Motion](https://motion.dev/docs/react-animate-presence), [Radix Dialog](https://www.radix-ui.com/primitives/docs/components/dialog), [TanStack Query](https://tanstack.com/query/latest/docs/framework/react/overview), [PDF.js](https://mozilla.github.io/pdf.js/examples/), and [SQLite backup](https://sqlite.org/backup.html).
