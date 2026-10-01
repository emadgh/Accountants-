import type { SqlStatement } from './database';

export function revisionAdvanceStatement(expectedRevision: number, nextRevision: number): SqlStatement {
  return {
    sql: "INSERT INTO app_meta(key, value) VALUES ('accounting-state-revision', CASE WHEN CAST(COALESCE((SELECT value FROM app_meta WHERE key = 'accounting-state-revision'), '0') AS INTEGER) = ? THEN ? ELSE NULL END) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    bind: [expectedRevision, String(nextRevision)],
  };
}
