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
  /** database of DSN in connection form - note of field and placeholder */
  database: {note: string, placeholder: string};
  /** DSN without database shows databases of server with their schemas (like pgAdmin) */
  catalogs: boolean;
}

const OPTIONAL_DATABASE = {note: 'optional', placeholder: 'all databases'};
const DEFAULT_POSTGRES = {note: 'default postgres', placeholder: 'postgres'};

/**
 * Engines Flase connects to - compatible engines use driver of their family (the same list is in server, Engines.ts).
 * Cloud services (Supabase, Neon, RDS, Aurora, PlanetScale) are MySQL / PostgreSQL servers.
 */
export const ENGINES: EngineInterface[] = [
  {schemes: ['mysql'], label: 'MySQL', dialect: 'mysql', port: '3306', hint: '5.7, 8.x, Percona, RDS, Aurora', database: OPTIONAL_DATABASE, catalogs: false},
  {schemes: ['mariadb'], label: 'MariaDB', dialect: 'mysql', port: '3306', hint: '10.x, 11.x', database: OPTIONAL_DATABASE, catalogs: false},
  {schemes: ['tidb'], label: 'TiDB', dialect: 'mysql', port: '4000', hint: 'MySQL compatible', database: OPTIONAL_DATABASE, catalogs: false},
  {schemes: ['postgresql', 'postgres', 'pgsql'], label: 'PostgreSQL', dialect: 'postgresql', port: '5432', hint: '12+, Supabase, Neon, RDS', database: DEFAULT_POSTGRES, catalogs: true},
  {schemes: ['cockroachdb', 'cockroach'], label: 'CockroachDB', dialect: 'postgresql', port: '26257', hint: 'PostgreSQL compatible', database: DEFAULT_POSTGRES, catalogs: false},
  {schemes: ['yugabytedb', 'yugabyte'], label: 'YugabyteDB', dialect: 'postgresql', port: '5433', hint: 'PostgreSQL compatible', database: DEFAULT_POSTGRES, catalogs: false},
];

export const engineOfScheme = (scheme: string | undefined): EngineInterface | undefined => {
  const lower = String(scheme || '').toLowerCase();
  return ENGINES.find((engine) => engine.schemes.includes(lower));
};

/** schemes of all engines for patterns of DSN */
export const ENGINE_SCHEMES = ENGINES.flatMap((engine) => engine.schemes);
