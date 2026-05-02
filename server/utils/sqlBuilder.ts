/**
 * Safe SQL UPDATE clause builder that validates column names against a whitelist.
 * Prevents SQL injection by ensuring only whitelisted columns can be used.
 */

interface UpdateClause {
  sql: string;
  params: any[];
}

/**
 * Build a safe UPDATE SET clause with parameterized values.
 * Column names must be in the allowedColumns whitelist.
 *
 * @param clauses Array of { column, value } pairs
 * @param allowedColumns Whitelist of permitted column names
 * @returns { sql: "column1 = ?, column2 = ?, ...", params: [value1, value2, ...] }
 * @throws Error if any column is not in the whitelist
 */
export function buildSafeUpdateClauses(
  clauses: Array<{ column: string; value: any }>,
  allowedColumns: string[]
): UpdateClause {
  const allowedSet = new Set(allowedColumns);
  const sql: string[] = [];
  const params: any[] = [];

  for (const clause of clauses) {
    if (!allowedSet.has(clause.column)) {
      throw new Error(`Column "${clause.column}" is not allowed. Allowed columns: ${allowedColumns.join(", ")}`);
    }
    sql.push(`${clause.column} = ?`);
    params.push(clause.value);
  }

  return {
    sql: sql.join(", "),
    params,
  };
}
