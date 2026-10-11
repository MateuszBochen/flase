import {ObjectRefInterface} from '../../Library/Database/Interface/DatabaseObjectsInterface';

export type ObjectTypeType = ObjectRefInterface['type'];

/** CREATE statements of new objects - user changes names and body */
const objectTemplate = (type: ObjectTypeType, dialect: string, table: string = 'my_table'): string => {
  if (dialect === 'mysql') {
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
    }
  }
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

export const OBJECT_LABELS: {[type in ObjectTypeType]: string} = {
  VIEW: 'view',
  PROCEDURE: 'procedure',
  FUNCTION: 'function',
  TRIGGER: 'trigger',
  EVENT: 'event',
};

export default objectTemplate;
