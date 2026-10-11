import TableInterface from './TableInterface';


interface ReferenceTableInterface {
  table: TableInterface,
  columnName: string,
  originColumnName: string,
  /** name of foreign key constraint */
  constraintName?: string,
}

export default ReferenceTableInterface;
