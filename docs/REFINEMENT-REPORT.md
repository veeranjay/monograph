# Monograph refinement — 5 November 2026

This update addresses the four immediate issues: small/crowded typography, blank notebook pages, the purple theme, and the sidebar.

## Blank notebook pages and related fixes

The SAT notebook data loaded successfully during reproduction: six sheets, 497 problems, and the associated notes and PDFs were present. The route container was left at `opacity: 0` and translated upward after an exit animation. This was a frontend navigation bug, rather than missing migrated records.

Page rendering no longer waits for an animation lifecycle. Routes render in a normal visible container, with a short native CSS movement transition that never fades the entire page to zero. Reduced motion disables that movement. Lazy pages load inside the existing shell, so navigation remains available during loading.

Additional hardening:

- Page-specific errors are contained inside the content area, keeping navigation available.
- Malformed legacy block arrays fall back to their original text instead of crashing the resource list or editor. Merely opening them does not rewrite their saved content.
- New routes reset the actual window scroll position instead of trying to scroll a non-scrolling content element.
- Notebook resources can be filtered by sheets, notes, and PDFs.
- Repeated notebook drill-down, browser back/forward, rapid navigation, and delayed module loading are now covered by regression tests.

The earlier tests checked whether headings existed and were considered visible by the browser automation API. Those checks did not exclude an ancestor with zero opacity. The regression suite now asserts the route's computed opacity as well as the expected page content.

## Typography and crowding

- Removed the remote Hanken Grotesk and Newsreader font downloads. The UI uses the device's system sans-serif stack.
- Main titles, resource names, descriptions, form fields, and navigation have a clearer size hierarchy. Resource titles are 14–15 px, secondary resource text 13 px, and the base text size is 16 px. Compact metadata stays at 12 px.
- Replaced the decorative home hero, three quick-action cards, weekly side panel, quote, and repeated captions with one resume panel and four recent resources.
- Library and notebook resources default to readable rows. The library still offers a grid view.
- Notebook actions are grouped in the existing contextual menu.
- Resource names display underscores as spaces for readability; original stored names remain unchanged.
- Removed 186 obsolete decorative CSS rules while retaining the editor, reader, practice, and accessibility styling.

## Neutral glass theme

The main light and dark themes now use black, white, and gray. Surfaces retain translucent layers, frosted blur, subtle gradients, soft boundaries, and restrained shadows. Notebook covers and resource icons are neutral.

Color remains limited to small user-defined notebook dots, status indicators, results, and document highlights. Existing notebook colors and PDF highlight data have not been changed.

## Sidebar modes

The navigation is now a detached glass panel with a stronger active-page treatment and three modes, available from **Workspace layout** in the top bar:

| Mode | Behavior |
| --- | --- |
| Expanded | Labelled navigation, notebooks, quick capture, and utility links |
| Compact rail | A narrow floating icon rail with accessible names and hover titles |
| Focus | Hides the sidebar and gives the content more space; the top-bar layout control remains available |

The choice persists in this browser and can be reversed without navigating away or resetting an editor. On mobile, opening navigation shows the full labelled drawer even when Compact rail was selected. Escape dismisses it.

## JavaScript reduction

The comparison uses the built HTML entry module and its static module preloads, measured the same way before and after. These numbers describe initial JavaScript payload, not an asserted loading-time improvement.

| Initial JavaScript | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| Uncompressed | 834,645 bytes | 385,947 bytes | 53.8% |
| Gzip | 260,808 bytes | 123,590 bytes | 52.6% |

The animation runtime was removed. Secondary pages, search, and creation dialogs load on demand. Math styling was moved out of the global entry point so it no longer brings the math engine into the initial module preloads. Math and PDF rendering remain available when those features are opened.

React Router, TanStack Query, and Radix remain because they provide routing, shared server state, and accessible controls. See [the recorded bundle comparison](REFINEMENT-BUNDLE-COMPARISON.json).

## Data verification

A separate snapshot was taken at the start of this refinement in `backups/refinement-2026-11-05`, alongside an archive of the prior source files.

All rows in all **27 current database tables** match that snapshot. All **five PDF files** match their snapshot checksums. SQLite integrity is `ok`, with zero foreign-key violations. No new schema or data migration was needed for these fixes.

This comparison uses the workspace as it stood when this follow-up began, so it preserves any legitimate changes made after the first revamp. The original migration verification report has not been replaced.

See [the data verification](REFINEMENT-VERIFICATION.json).

## Validation

- Production build and strict TypeScript check passed.
- 19 workspace/API tests passed.
- 78 existing backend regression tests passed.
- 34 existing formatting tests passed.
- 21 production browser tests passed, including eight new regression scenarios.
- Accessibility checks passed for the tested pages, dark appearance, reduced motion, and all three navigation modes.
- The mobile layout was checked at 390 px without horizontal page overflow.
- The dependency audit reports zero known vulnerabilities.

That is **152 passing tests**. Browser mutations use a disposable database and PDF directory, not the live workspace.

## Previews

- [Expanded home](refinement-previews/home.png)
- [SAT notebook](refinement-previews/notebook-sat.png)
- [Compact rail](refinement-previews/rail.png)
- [Focus mode](refinement-previews/focus.png)
- [Mobile](refinement-previews/mobile.png)
- [Dark appearance](refinement-previews/dark.png)

The app remains local and single-user, with the existing limitations on simultaneous edits and cloud synchronization. Full PDF and math rendering still require their optional larger modules when opened. GitHub publication remains deferred.
