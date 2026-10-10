import TableInterface from './TableInterface';

/** result of select can be edited - rows come from this table */
interface EditableResultInterface {
  table: TableInterface;
  /** result column keys identifying the row, empty when table has no primary key */
  primaryKey: string[];
}

export default EditableResultInterface;
