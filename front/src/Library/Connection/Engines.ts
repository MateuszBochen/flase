import SqlDialectType from '../Database/Driver/SqlDialectType';

export interface EngineInterface {
  /** scheme of DSN - the first of schemes is the main one, written to built DSN */
  schemes: string[];
  label: string;
  /** family of SQL - driver, syntax and features */
  dialect: SqlDialectType;
  port: string;
  /** versions / services shown in connection form */
  hint: string;
}

/**
 * Engines Flase connects to - compatible engines use driver of their family (the same list is in server, Engines.ts).
 * Cloud services (Supabase, Neon, RDS, Aurora, PlanetScale) are MySQL / PostgreSQL servers.
 */
export const ENGINES: EngineInterface[] = [
  {schemes: ['mysql'], label: 'MySQL', dialect: 'mysql', port: '3306', hint: '5.7, 8.x, Percona, RDS, Aurora'},
  {schemes: ['mariadb'], label: 'MariaDB', dialect: 'mysql', port: '3306', hint: '10.x, 11.x'},
  {schemes: ['tidb'], label: 'TiDB', dialect: 'mysql', port: '4000', hint: 'MySQL compatible'},
  {schemes: ['postgresql', 'postgres', 'pgsql'], label: 'PostgreSQL', dialect: 'postgresql', port: '5432', hint: '12+, Supabase, Neon, RDS'},
  {schemes: ['cockroachdb', 'cockroach'], label: 'CockroachDB', dialect: 'postgresql', port: '26257', hint: 'PostgreSQL compatible'},
  {schemes: ['yugabytedb', 'yugabyte'], label: 'YugabyteDB', dialect: 'postgresql', port: '5433', hint: 'PostgreSQL compatible'},
];

export const engineOfScheme = (scheme: string | undefined): EngineInterface | undefined => {
  const lower = String(scheme || '').toLowerCase();
  return ENGINES.find((engine) => engine.schemes.includes(lower));
};

/** schemes of all engines for patterns of DSN */
export const ENGINE_SCHEMES = ENGINES.flatMap((engine) => engine.schemes);
