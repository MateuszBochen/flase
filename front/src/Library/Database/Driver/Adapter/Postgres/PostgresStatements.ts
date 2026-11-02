import {DatabaseRoutineInterface, ObjectRefInterface} from '../../../Interface/DatabaseObjectsInterface';
import {MaintenanceActionType} from '../../DriverFeaturesInterface';
import {RoutineValueType} from '../../RoutineCallInterface';
import SqlLiteralInterface from '../../SqlLiteralInterface';

/** EXPLAIN (ANALYZE) executes the query */
export const postgresPlanStatements = (query: string, analyze: boolean): string[] => [analyze
  ? `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`
  : `EXPLAIN (FORMAT JSON) ${query}`];

/** values are cast to parameter types (overloaded functions), OUT parameters of procedure get NULL */
export const postgresRoutineStatements = (sql: SqlLiteralInterface, database: string, routine: DatabaseRoutineInterface, values: RoutineValueType[]): string[] => {
  const name = `${sql.identifier(database)}.${sql.identifier(routine.name)}`;
  const literal = (index: number) => values[index]?.isNull ? 'NULL' : sql.value(values[index]?.value ?? '');
  const args = routine.parameters
    .map((parameter, index) => ({parameter, index}))
    .filter(({parameter}) => routine.kind === 'PROCEDURE' || parameter.mode !== 'OUT')
    .map(({parameter, index}) => parameter.mode === 'OUT' ? `NULL::${parameter.type}` : `${literal(index)}::${parameter.type}`);
  return routine.kind === 'FUNCTION'
    ? [`SELECT * FROM ${name}(${args.join(', ')})`]
    : [`CALL ${name}(${args.join(', ')})`];
};

/** CREATE statements of new objects - user changes names and body */
export const postgresObjectTemplate = (type: ObjectRefInterface['type'], table: string): string => {
  switch (type) {
    case 'VIEW':
      return `CREATE VIEW new_view AS\nSELECT *\nFROM ${table}`;
    case 'PROCEDURE':
      return "CREATE PROCEDURE new_procedure(p_id integer)\nLANGUAGE plpgsql\nAS $$\nBEGIN\n  RAISE NOTICE 'id %', p_id;\nEND\n$$";
    case 'FUNCTION':
      return 'CREATE FUNCTION new_function(p_value integer)\nRETURNS integer\nLANGUAGE sql\nAS $$\n  SELECT p_value * 2;\n$$';
    case 'TRIGGER':
      return `-- trigger calls function returning trigger, e.g.\n-- CREATE FUNCTION set_created() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.created := now(); RETURN NEW; END $$\nCREATE TRIGGER new_trigger\nBEFORE INSERT ON ${table}\nFOR EACH ROW\nEXECUTE FUNCTION set_created()`;
    default:
      return '';
  }
};

export const POSTGRES_MAINTENANCE: MaintenanceActionType[] = [
  {action: 'vacuum', label: 'Vacuum', hint: 'VACUUM - reclaim space of dead rows'},
  {action: 'vacuumAnalyze', label: 'Vacuum analyze', hint: 'VACUUM (ANALYZE) - vacuum and refresh statistics'},
  {action: 'vacuumFull', label: 'Vacuum full', hint: 'VACUUM FULL - rewrite table (locks it)'},
  {action: 'analyze', label: 'Analyze', hint: 'ANALYZE - refresh statistics'},
  {action: 'reindex', label: 'Reindex', hint: 'REINDEX TABLE - rebuild indexes'},
];
