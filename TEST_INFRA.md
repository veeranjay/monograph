# Monograph E2E Test Infrastructure & Test Architecture

## 1. Overview & Core Principles

The Monograph test infrastructure provides a comprehensive, automated, 4-tier requirement-driven verification suite engineered specifically for the problem-logging interface redesign.

### Core Guarantees:
1. **Zero Database Corruption / Zero Mutation Guarantee**:
   All test suites execute against ephemeral in-memory SQLite instances (`:memory:`) or isolated temporary database files allocated in `os.tmpdir()` (`monograph_test_<uuid>.db`). The production SQLite database (`monograph.db`), along with its WAL/SHM files (`monograph.db-wal`, `monograph.db-shm`), is strictly protected by assertion guards in `tests/test_harness.ts` and is never accessed or mutated during test runs.
2. **Native Node.js 26 Test Runner**:
   Tests run using Node's built-in `node:test` and `node:assert/strict` modules via `npx tsx --test`, requiring zero third-party testing dependencies, zero native C++ compilation, and executing in milliseconds.
3. **Progressive Testability & Interface Contract Conformance**:
   Tests directly validate the architectural models and REST contracts defined in `PROJECT.md` and `ORIGINAL_REQUEST.md`.

---

## 2. Test Suite Architecture (4-Tier Requirement-Driven)

```
tests/
├── test_harness.ts                # Ephemeral test DB, Express app factory & HTTP server
└── e2e/
    ├── tier1_build.test.ts        # Tier 1: Type check, bundle build & R1-R4 feature coverage
    ├── tier2_database.test.ts     # Tier 2: Boundary & corner cases (schema, constraints, unicode)
    ├── tier3_api.test.ts          # Tier 3: REST API endpoint contracts & cross-feature combinations
    └── tier4_workflows.test.ts    # Tier 4: Real-world user journeys & end-to-end lifecycles
```

### 2.1 Tier 1: Static Type, Build & Isolated Feature Coverage (`tests/e2e/tier1_build.test.ts`)
- **Type & Build Verification**:
  - `npx tsc --noEmit` verifies strict TypeScript compilation with zero type errors.
  - Production client bundle verification (`npm run build`) confirms asset generation (`dist/client/index.html`, CSS, JS bundles).
- **R1 Feature Coverage (Hierarchical Subject Structure & Breadcrumbs)**:
  - R1-1: Subject model schema support (id, name, description, color, icon, metadata).
  - R1-2: Top-level Subject groups multiple sheets correctly.
  - R1-3: Reassigning sheet from one subject to another updates parent hierarchy.
  - R1-4: Breadcrumb trail resolution on Subject view (`Subjects > [Subject]`).
  - R1-5: Breadcrumb trail resolution on Sheet view (`Subjects > [Subject] > [Sheet]`).
  - R1-6: Breadcrumb trail resolution on Problem view (`Subjects > [Subject] > [Sheet] > Q[Number]`).
- **R2 Feature Coverage (Main Hub Simplification & Focus)**:
  - R2-1: Active subjects aggregate sheet count and problem count cleanly.
  - R2-2: Active subject calculates solve rate accurately across all member sheets.
  - R2-3: Empty subject handles 0 sheets without crashing or division-by-zero NaN.
  - R2-4: Quick actions / Resume work identifies most recent active sheet and problem.
  - R2-5: Main Hub declutters flat sheet list by categorizing under active subject notebooks.
- **R3 Feature Coverage (Collapsible Badges, Tags & Metadata)**:
  - R3-1: Problem record defaults contain essential primary indicators without tag clutter.
  - R3-2: Secondary heuristic tags stored cleanly in junction table for collapsible reveal.
  - R3-3: Meta tags and diagnostics stored in `meta_tags` column for expand-on-demand.
  - R3-4: Multi-attempt history records are preserved chronologically for drawer expansion.
  - R3-5: Qualitative observation logs attached cleanly to attempt without cluttering card header.
- **R4 Feature Coverage (Data Integrity & Seamless Migration)**:
  - R4-1: Pre-migration legacy sheets without `subject_id` survive schema creation intact.
  - R4-2: Default subjects seeded automatically when subjects table is empty (Mathematics, Physics, Computer Science).
  - R4-3: Backfill automatically maps legacy unassigned sheets to Mathematics subject.
  - R4-4: Legacy problems and attempt history retain 100% data fidelity post-migration.
  - R4-5: Deleting a subject preserves child sheets by setting `subject_id` to NULL / fallback.

### 2.2 Tier 2: Boundary & Corner Cases (`tests/e2e/tier2_database.test.ts`)
- **T2-01**: Empty subjects handle 0 sheets and 0 problems without division-by-zero or null errors.
- **T2-02**: Subject names with extreme lengths (1000+ characters) persist and retrieve intact.
- **T2-03**: Subject names with Unicode, Greek, Math symbols, and Emojis store with full fidelity.
- **T2-04**: SQL injection and escape sequence attempts in names and notes are safely neutralized.
- **T2-05**: SQLite UNIQUE constraint violation prevents duplicate subject names.
- **T2-06**: Sheets with 0 problems compute 0% solve rate and empty problem lists safely.
- **T2-07**: Deleting a subject preserves child sheets by updating `subject_id` to fallback default.
- **T2-08**: Deleting a sheet cascades to delete problems and attempts (`ON DELETE CASCADE`).
- **T2-09**: Reassigning sheets between subjects immediately shifts problem count and solve rate.
- **T2-10**: Complex LaTeX math formulas in attempt notes preserve formatting without distortion.
- **T2-11**: Nullable fields in Subject, Source, and Attempt records handle undefined/null without error.

### 2.3 Tier 3: Cross-Feature Combinations & REST API Contracts (`tests/e2e/tier3_api.test.ts`)
- **T3-01**: Health check endpoint confirms test server isolation.
- **T3-02**: Subject Creation -> Sheet Assignment -> Batch Problems -> Attempt Logging -> Subject Analytics query.
- **T3-03**: Sheet Reassignment dynamically reflects in Breadcrumb resolution (`/api/breadcrumbs`).
- **T3-04**: Collapsible State Toggle Contract - Primary card is minimal, nested attempts carry rich diagnostics.
- **T3-05**: Deleting a subject reassigns its sheets to the default fallback subject.
- **T3-06**: Scoped Analytics Query Isolation (Subject A vs Subject B vs Global).
- **T3-07**: REST API error handling & status code contracts (400, 404, 409).

### 2.4 Tier 4: Real-World Workloads & End-to-End User Journeys (`tests/e2e/tier4_workflows.test.ts`)
- **Workflow 1**: Complete New Curriculum Lifecycle (CS -> Algorithms -> Problems -> Progression -> Analytics).
- **Workflow 2**: Curriculum Reorganization & Migration (Reassigning Sheets with Full History Preservation).
- **Workflow 3**: Focused Log Screen Workflow with Collapsible Secondary Diagnostics.
- **Workflow 4**: Active Subjects Dashboard & Quick Action Resume Work.

---

## 3. Test Runner Commands

### Run Entire E2E Test Suite (All 4 Tiers):
```bash
npx tsx --test tests/e2e/*.test.ts
```

### Run Specific Tiers:
```bash
# Tier 1: Build, Type Verification & Isolated Feature Coverage (R1-R4)
npx tsx --test tests/e2e/tier1_build.test.ts

# Tier 2: Boundary & Corner Cases
npx tsx --test tests/e2e/tier2_database.test.ts

# Tier 3: Cross-Feature Combinations & REST API Contracts
npx tsx --test tests/e2e/tier3_api.test.ts

# Tier 4: Real-World Workloads & User Journeys
npx tsx --test tests/e2e/tier4_workflows.test.ts
```

---

## 4. Test Inventory & Coverage Mapping

| Tier | Suite File | Requirement Scope | Tests Count | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Tier 1** | `tests/e2e/tier1_build.test.ts` | Build, R1, R2, R3, R4 | **23** tests | Ready |
| **Tier 2** | `tests/e2e/tier2_database.test.ts` | Edge cases, boundaries, invariants | **11** tests | Ready |
| **Tier 3** | `tests/e2e/tier3_api.test.ts` | REST API, breadcrumbs, combinations | **7** tests | Ready |
| **Tier 4** | `tests/e2e/tier4_workflows.test.ts` | Realistic end-to-end user journeys | **4** tests | Ready |
| **Total** | | | **45** tests | **100% Comprehensive** |

---

## 5. Pass Criteria & Quality Thresholds

- **Total Test Count**: Minimum >= 40 tests across all 4 tiers (Current: **45** tests).
- **Pass Rate**: 100% pass on all active tiers once implementation code compiles cleanly.
- **Flakiness Threshold**: 0% flakiness. All tests run deterministically in sub-second time.
- **Database Safety**: 100% zero modification to `monograph.db`.
