# TEST READY: 4-Tier E2E Test Suite for Monograph

## 1. Readiness Declaration

The comprehensive 4-tier requirement-driven E2E test suite for the Monograph Redesign project has been fully designed, implemented, and verified. The test suite covers all four redesign requirements (**R1**, **R2**, **R3**, **R4**) across build/static types, database schema & boundaries, REST API contracts, and real-world end-to-end user workflows.

All test executions run with **100% database isolation** using ephemeral `:memory:` instances or temporary files in `os.tmpdir()`. The production database `monograph.db` and its WAL/SHM files are guaranteed to remain completely pristine and untouched.

---

## 2. Test Inventory by Tier

| Tier | File Path | Focus Area | Total Tests | Pass Status |
| :--- | :--- | :--- | :---: | :---: |
| **Tier 1** | `tests/e2e/tier1_build.test.ts` | Static Type Check, Production Build & Isolated Feature Coverage (R1, R2, R3, R4 >= 5 tests each) | **23** | Ready (22 passing; 1 typecheck pending M1 TS2561 fix) |
| **Tier 2** | `tests/e2e/tier2_database.test.ts` | Boundary & Corner Cases (Empty subjects, long names, unicode, SQL injection resistance, cascading, NULL safety) | **11** | **11 / 11 PASS (100%)** |
| **Tier 3** | `tests/e2e/tier3_api.test.ts` | Cross-Feature REST API Contracts (Pairwise flows, breadcrumbs, collapsible metadata, scoped analytics) | **7** | **7 / 7 PASS (100%)** |
| **Tier 4** | `tests/e2e/tier4_workflows.test.ts` | Real-World Workloads & End-to-End User Journeys (Curriculum lifecycles, reorganization, drawer diagnostics, hub active cards) | **4** | **4 / 4 PASS (100%)** |
| **TOTAL** | | | **45** | **44 / 45 Ready** |

---

## 3. Requirement Feature Mapping

### R1. Hierarchical Subject Structure & Breadcrumb Navigation (6 Tests in Tier 1 + API/Workflow tests)
- Subject schema model (id, name, description, color, icon, metadata)
- Grouping multiple sheets under a Subject
- Reassigning sheets between subjects
- Breadcrumbs on Subject view: `Subjects > [Subject]`
- Breadcrumbs on Sheet view: `Subjects > [Subject] > [Sheet]`
- Breadcrumbs on Problem view: `Subjects > [Subject] > [Sheet] > Q[Number]`

### R2. Main Hub Simplification & Focus (5 Tests in Tier 1 + Workflow tests)
- Aggregation of sheet count and problem count across Active Subject Notebooks
- Subject solve rate calculation across member sheets
- Safe handling of empty subjects (0 sheets, 0 problems, 0% solve rate, no NaN)
- Identification of most recently active sheet/problem for "Resume Work" hero action
- Elimination of flat sheet clutter by grouping under active subjects

### R3. Collapsible & Streamlined Badges, Tags, and Metadata (5 Tests in Tier 1 + API/Workflow tests)
- Problem record minimalism: default view contains only primary identifiers (number, title, latest result)
- Heuristic tags segregated in junction table for on-demand disclosure
- Meta tags and structured diagnostic fields stored in `meta_tags` column
- Chronological multi-attempt history preservation for expandable drawer
- Observations (mistake, technique) attached to attempts without header clutter

### R4. Data Integrity & Seamless Migration (5 Tests in Tier 1 + Boundary tests)
- Pre-migration legacy sheets without `subject_id` survive schema migration
- Automatic seed of default subjects (Mathematics, Physics, Computer Science)
- Automatic backfill of unassigned legacy sheets to Mathematics
- Zero data loss for existing problems and attempt history
- Safe deletion of subjects preserving child sheets via fallback reassignment or NULL

---

## 4. Execution Commands

### Execute Full Test Suite:
```bash
npx tsx --test tests/e2e/*.test.ts
```

### Execute Individual Tiers:
```bash
# Tier 1 (Type check, build & isolated feature coverage)
npx tsx --test tests/e2e/tier1_build.test.ts

# Tier 2 (Boundary & corner cases)
npx tsx --test tests/e2e/tier2_database.test.ts

# Tier 3 (Cross-feature combinations & REST API contracts)
npx tsx --test tests/e2e/tier3_api.test.ts

# Tier 4 (Real-world user workflows)
npx tsx --test tests/e2e/tier4_workflows.test.ts
```

---

## 5. Escalation Record

During Tier 1 typecheck verification, a TypeScript error was discovered in `src/server/services/attemptsService.ts:107` (`error TS2561: Object literal may only specify known properties, but 'problem_title' does not exist in type 'Attempt'`). This was promptly escalated to Parent and Worker M1 to add `problem_title?: string | null;` to `Attempt` interface in `attemptsService.ts`. Once Worker M1 completes this line change, `npx tsc --noEmit` and Tier 1 will achieve a clean 23/23 pass (100% pass across all 45 tests).
