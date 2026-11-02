import {DatabaseRoutineInterface, ObjectRefInterface} from '../../../Interface/DatabaseObjectsInterface';
import {MaintenanceActionType} from '../../DriverFeaturesInterface';
import {RoutineValueType} from '../../RoutineCallInterface';
import SqlLiteralInterface from '../../SqlLiteralInterface';

/** variable of OUT / INOUT parameter of procedure */
const variable = (name: string, index: number) => `@${(name || `p${index + 1}`).replace(/[^A-Za-z0-9_$]/g, '_')}`;

/** MariaDB ANALYZE FORMAT=JSON, MySQL EXPLAIN ANALYZE (text tree, used when MariaDB syntax fails) */
export const mysqlPlanStatements = (query: string, analyze: boolean): string[] => analyze
  ? [`ANALYZE FORMAT=JSON ${query}`, `EXPLAIN ANALYZE ${query}`]
  : [`EXPLAIN FORMAT=JSON ${query}`];

/** SELECT of function, CALL of procedure - OUT parameters are read from variables */
export const mysqlRoutineStatements = (sql: SqlLiteralInterface, database: string, routine: DatabaseRoutineInterface, values: RoutineValueType[]): string[] => {
  const name = `${sql.identifier(database)}.${sql.identifier(routine.name)}`;
  const parameters = routine.parameters;
  const literal = (index: number) => values[index]?.isNull ? 'NULL' : sql.value(values[index]?.value ?? '');
  if (routine.kind === 'FUNCTION') {
    return [`SELECT ${name}(${parameters.map((parameter, index) => literal(index)).join(', ')}) AS ${sql.identifier('result')}`];
  }
  const statements: string[] = [];
  const args = parameters.map((parameter, index) => {
    if (parameter.mode === 'IN') return literal(index);
    if (parameter.mode === 'INOUT') statements.push(`SET ${variable(parameter.name, index)} = ${literal(index)}`);
    return variable(parameter.name, index);
  });
  statements.push(`CALL ${name}(${args.join(', ')})`);
  const outputs = parameters.map((parameter, index) => ({parameter, index})).filter(({parameter}) => parameter.mode !== 'IN');
  if (outputs.length) {
    statements.push(`SELECT ${outputs.map(({parameter, index}) => `${variable(parameter.name, index)} AS ${sql.identifier(parameter.name || `p${index + 1}`)}`).join(', ')}`);
  }
  return statements;
};

/** CREATE statements of new objects - user changes names and body */
export const mysqlObjectTemplate = (type: ObjectRefInterface['type'], table: string): string => {
  switch (type) {
    case 'VIEW':
      return `CREATE VIEW new_view AS\nSELECT *\nFROM ${table}`;
    case 'PROCEDURE':
      return 'CREATE PROCEDURE new_procedure(IN p_id INT)\nBEGIN\n  SELECT p_id;\nEND';
    case 'FUNCTION':
      return 'CREATE FUNCTION new_function(p_value INT) RETURNS INT\nDETERMINISTIC\nRETURN p_value * 2';
    case 'TRIGGER':
      return `CREATE TRIGGER new_trigger\nBEFORE INSERT ON ${table}\nFOR EACH ROW\nBEGIN\n  -- SET NEW.created = NOW();\nEND`;
    case 'EVENT':
      return `CREATE EVENT new_event\nON SCHEDULE EVERY 1 DAY\nDO\n  DELETE FROM ${table} WHERE 0`;
    default:
      return '';
  }
};

export const MYSQL_MAINTENANCE: MaintenanceActionType[] = [
  {action: 'optimize', label: 'Optimize', hint: 'OPTIMIZE TABLE - rebuild, free unused space'},
  {action: 'analyze', label: 'Analyze', hint: 'ANALYZE TABLE - refresh statistics of indexes'},
  {action: 'check', label: 'Check', hint: 'CHECK TABLE - look for errors'},
  {action: 'repair', label: 'Repair', hint: 'REPAIR TABLE - MyISAM, Aria, ARCHIVE, CSV'},
];
