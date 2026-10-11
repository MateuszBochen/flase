import {AlterOperationType} from '../Interface/Data/StructureChangeInterface';

const ACTIONS = ['RESTRICT', 'CASCADE', 'SET NULL', 'NO ACTION', 'SET DEFAULT'];

/** checked parts of foreign key - the same columns count, known referential actions */
export const foreignKeyParts = (operation: Extract<AlterOperationType, {op: 'addForeignKey'}>) => {
  const names = (list: string[], label: string): string[] => {
    if (!Array.isArray(list) || !list.length || list.some((item) => typeof item !== 'string' || !item.trim())) {
      throw new Error(`${label} are required`);
    }
    return list.map((item) => item.trim());
  };
  const columns = names(operation.columns, 'Columns of foreign key');
  const referenced = names(operation.referencedColumns, 'Referenced columns');
  if (columns.length !== referenced.length) {
    throw new Error('Foreign key needs the same number of columns and referenced columns');
  }
  if (!operation.referencedTable?.name || !operation.referencedTable?.databaseName) {
    throw new Error('Referenced table is required');
  }
  const action = (value: string, label: string): string => {
    const upper = String(value || 'RESTRICT').trim().toUpperCase();
    if (!ACTIONS.includes(upper)) {
      throw new Error(`Invalid ${label} action ${value}`);
    }
    return upper;
  };
  return {columns, referenced, onDelete: action(operation.onDelete, 'ON DELETE'), onUpdate: action(operation.onUpdate, 'ON UPDATE')};
};
