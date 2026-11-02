/** functions of PostgreSQL which compatible engines (CockroachDB, YugabyteDB...) may not have */
const OPTIONAL_FUNCTIONS = [
  'pg_relation_size', 'pg_table_size', 'pg_indexes_size', 'pg_database_size', 'pg_postmaster_start_time', 'pg_get_triggerdef',
];

/**
 * Optional functions available on the server - found once after login in pg_proc, statements call a missing one
 * as its fallback (NULL size, empty definition) instead of failing on the whole query.
 * @author Mateusz Bochen
 */
class PostgresFunctions {
  constructor(private readonly available: Set<string> = new Set(OPTIONAL_FUNCTIONS)) {
  }

  static async detect(query: (sql: string, params: any[]) => Promise<{rows: any[]}>): Promise<PostgresFunctions> {
    const {rows} = await query('SELECT DISTINCT proname FROM pg_catalog.pg_proc WHERE proname = ANY($1)', [OPTIONAL_FUNCTIONS]);
    return new PostgresFunctions(new Set(rows.map((row) => row.proname)));
  }

  has(name: string): boolean {
    return this.available.has(name);
  }

  /** SQL call of the function, fallback expression when the server does not have it */
  call(name: string, args: string, fallback: string = 'NULL'): string {
    return this.available.has(name) ? `${name}(${args})` : fallback;
  }
}

export default PostgresFunctions;
