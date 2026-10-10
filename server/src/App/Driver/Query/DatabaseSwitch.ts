
/**
 * Database (MySQL) or schema (PostgreSQL) selected by statement, null when statement does not change it.
 * USE db, USE `db`, SET search_path TO "schema", other
 */
export const selectedDatabaseOf = (sql: string): string | null => {
  const use = /^\s*use\s+(`([^`]+)`|"([^"]+)"|([^`";\s]+))/i.exec(sql);
  if (use) {
    return use[2] ?? use[3] ?? use[4];
  }
  const searchPath = /^\s*set\s+(?:session\s+|local\s+)?search_path\s*(?:to|=)\s*("((?:[^"]|"")+)"|'([^']+)'|([^\s,;]+))/i.exec(sql);
  if (searchPath) {
    return searchPath[2]?.replace(/""/g, '"') ?? searchPath[3] ?? searchPath[4].toLowerCase();
  }
  return null;
};
