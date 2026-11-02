import SqlDialectType from './Query/SqlDialectType';

export interface EngineInterface {
  /** scheme of DSN - the first of schemes is the main one */
  schemes: string[];
  label: string;
  /** family of SQL - driver, syntax and features */
  dialect: SqlDialectType;
  /** port used when DSN has none */
  port: number;
}

/**
 * Engines Flase connects to - compatible engines use driver of their family (MySQL / PostgreSQL protocol and SQL),
 * differences are handled by the driver (e.g. functions missing in CockroachDB). The same list is in client.
 * @author Mateusz Bochen
 */
export const ENGINES: EngineInterface[] = [
  {schemes: ['mysql'], label: 'MySQL', dialect: 'mysql', port: 3306},
  {schemes: ['mariadb'], label: 'MariaDB', dialect: 'mysql', port: 3306},
  {schemes: ['tidb'], label: 'TiDB', dialect: 'mysql', port: 4000},
  {schemes: ['postgresql', 'postgres', 'pgsql'], label: 'PostgreSQL', dialect: 'postgresql', port: 5432},
  {schemes: ['cockroachdb', 'cockroach'], label: 'CockroachDB', dialect: 'postgresql', port: 26257},
  {schemes: ['yugabytedb', 'yugabyte'], label: 'YugabyteDB', dialect: 'postgresql', port: 5433},
];

export const engineOfScheme = (scheme: string | undefined): EngineInterface | undefined => {
  const lower = String(scheme || '').toLowerCase();
  return ENGINES.find((engine) => engine.schemes.includes(lower));
};

/** pattern of DSN of supported engines (validation of predefined connections) */
export const SUPPORTED_DSN = new RegExp(`^(${ENGINES.flatMap((engine) => engine.schemes).join('|')}):\\/\\/\\S+$`, 'i');

/**
 * name of server software from version and variables - the same protocol hides different engines
 * (MySQL: MariaDB, TiDB, Percona, Aurora; PostgreSQL: CockroachDB, YugabyteDB)
 */
export const productOfVersion = (version: string, comment: string = ''): string => {
  if (/TiDB/i.test(version)) return 'TiDB';
  if (/MariaDB/i.test(version)) return 'MariaDB';
  if (/CockroachDB/i.test(version)) return 'CockroachDB';
  if (/-YB-/i.test(version)) return 'YugabyteDB';
  if (/Percona/i.test(comment)) return 'Percona Server';
  if (/^PostgreSQL/i.test(version)) return 'PostgreSQL';
  return 'MySQL';
};
