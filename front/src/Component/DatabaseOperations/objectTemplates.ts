import {ObjectRefInterface} from '../../Library/Database/Interface/DatabaseObjectsInterface';

export type ObjectTypeType = ObjectRefInterface['type'];

export const OBJECT_LABELS: {[type in ObjectTypeType]: string} = {
  VIEW: 'view',
  PROCEDURE: 'procedure',
  FUNCTION: 'function',
  TRIGGER: 'trigger',
  EVENT: 'event',
};

