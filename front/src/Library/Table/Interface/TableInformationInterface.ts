import ColumnInterface from './ColumnInterface';


interface TableInformationInterface {
  tableName: string,
  dataBaseName: string,
  preload: boolean,
  columns: ColumnInterface[],
  primaryColumns: ColumnInterface[],
  uniqueColumns: ColumnInterface[],
}

export default TableInformationInterface;
