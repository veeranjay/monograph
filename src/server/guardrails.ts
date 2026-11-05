import path from 'node:path';

/**
 * Data Guardrail System
 * Protects user production database (monograph.db) against unapproved agent manipulations,
 * test environment leaks, and unintended mock data seeding.
 */

export function isProdDb(dbPath: string): boolean {
  const resolved = path.resolve(dbPath);
  const prodPath = path.resolve(process.env.DEFAULT_DB_PATH || path.resolve(process.cwd(), 'monograph.db'));
  return resolved === prodPath;
}

/**
 * Validates that test suites run only on isolated test databases.
 * Throws immediately if a test process attempts to open or mutate monograph.db.
 */
export function assertTestIsolation(dbPath: string): void {
  if (process.env.NODE_ENV === 'test' && isProdDb(dbPath)) {
    throw new Error(
      `[GUARDRAIL VIOLATION] Test attempted to open production database (${dbPath}). Tests must run in isolated databases (:memory: or temporary files).`
    );
  }
}

/**
 * Validates whether automated agent scripts are authorized to mutate user production data.
 * Agents are permitted to perform schema/DDL migrations, but direct data manipulation
 * on monograph.db is strictly forbidden unless explicitly requested by the user.
 */
export function assertAgentDataMutationAllowed(dbPath: string, operationDescription: string): void {
  if (isProdDb(dbPath)) {
    if (process.env.ALLOW_PROD_DATA_MUTATION !== 'true') {
      throw new Error(
        `[GUARDRAIL VIOLATION] Unauthorized agent data mutation on production database: "${operationDescription}". Production data is immutable by agents; only schema migrations and user-initiated API operations are allowed.`
      );
    }
  }
}
