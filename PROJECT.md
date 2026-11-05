# Monograph 2 architecture

The active frontend lives under `src/client/workspace`. The original components were replaced, and a local archive is retained under the ignored `backups/legacy-client-components-2026-11-05` directory.

## Code map

```text
src/client/
  App.tsx                  Providers, error boundary, lazy routes, route aliases
  main.tsx                 Entry point and old bookmark normalization
  workspace/
    Shell.tsx              Persistent shell, loading/error boundaries, dialog orchestration
    Sidebar.tsx            Expanded / Compact rail / Focus navigation
    useSidebarMode.ts      Validated per-browser layout preference
    dialogs/               Lazy search and creation dialogs
    ui.tsx                 Buttons, accessible dialogs/menus, cards, form fields
    data.ts                Typed workspace queries, mutations, library projection
    useDraft.ts            Serialized autosave and local draft recovery
    MathInput.tsx          Markdown controls and searchable math completions
    pages/
      Home.tsx             Resume, recent resources, pinned resources, weekly goal
      Library.tsx          Search/filter/sort, grid/list, trash and restoration
      Notebooks.tsx        Notebook gallery and notebook contents
      Sheet.tsx            Filterable problem list and sheet management
      Practice.tsx         Session hub, study workspace, completed history
      Problem.tsx          Attempt history, reflections, review flags
      Editor.tsx           Block editor, preview, focus mode, import/export
      Reader.tsx           Local PDF renderer, selection, highlights, annotations
      Review.tsx           Problems needing another look
      Insights.tsx         Practice metrics, daily activity, recent history
      Inbox.tsx            Quick capture and transactional conversion to notes
      Settings.tsx         Personal preferences, appearance, export
  lib/
    api.ts                 Existing typed domain API client
    katex.tsx              Shared Markdown and math rendering
    latex.ts               Extracted LaTeX import/export helpers
    mathCommands.ts        Extracted, searchable math/formatting command catalog
  styles/
    index.css              Tailwind utilities
    workspace.css          Neutral theme tokens, shared controls, responsive pages
    shell.css              Floating navigation modes and simplified home
src/server/
  server.ts                Express setup and preserved compatibility API routes
  db.ts                    Existing schema, lazy database connection, bridge
  guardrails.ts            Test isolation protections
  routes/workspace.ts      New workspace routes and transactional workflows
  services/
    workspaceService.ts    Workspace projection, item state, preferences, export
    ...                    Existing domain and compatibility services
scripts/
  backup.ts                Consistent SQLite snapshot and PDF backup
  verify-migration.ts      Original-row preservation and PDF verification
  test-server.ts           Disposable workspace for production browser tests
tests/
  workspace.test.ts        New API and transactional behavior tests
  browser/workflows.spec.ts Real browser workflows and accessibility checks
```

## State boundaries

React Router owns navigation and preserves old route aliases. TanStack Query owns remote data and cache invalidation. Components own transient UI state. Radix owns modal focus, keyboard dismissal, and menu behavior. Routes render in a normal visible container; short native CSS transitions never gate rendering or fade the whole page to zero. Reduced motion disables page movement. Secondary pages, dialogs, math, and PDFs load when opened.

Notes and practice drafts use a serialized save queue. A browser recovery copy is retained until the matching revision is acknowledged by the server. Leaving a page flushes pending changes. Saving a practice attempt and advancing the session happens in one SQLite transaction, using a client-generated attempt ID so network retries do not create duplicates.

## Persistence

The typed study tables remain authoritative: notebooks are `subjects`, sheets are `sources`, and attempts, notes, PDFs, highlights, and sessions retain their existing identifiers and content formats. This avoids a risky rewrite of 497 problem records and their history.

Two additive tables store the new experience:

- `workspace_state`: pin status and a recoverable trash timestamp per resource.
- `workspace_settings`: validated personal preferences as JSON values.

The old generic object, relation, document, and view tables remain available through the compatibility API. Their existing bridge migration fills missing mirrors on startup. The new UI reads canonical study tables directly and shows existing standalone workspace documents separately, avoiding reliance on stale generic copies. Generic graph/view builders are not exposed as new product navigation.

Trash does not delete content or cascade through a notebook. A trashed notebook hides its resources from ordinary library views; restoring the notebook restores visibility. Individual resources can also be restored. Existing permanent-delete API routes are retained for compatibility, but are not used by the new library UI.

## Scope boundaries

This remains a single-user, local Express/SQLite application. It is not a cloud service or multi-user collaborative editor. The domain APIs were retained deliberately; this change replaces the frontend architecture and adds focused workflow routes rather than rewriting all backend services.
