import ColumnType from './ColumnType';


type TableInformationType = {
  tableName: string,
  dataBaseName: string,
  preload: boolean,
  columns: ColumnType[],
  primaryColumns: ColumnType[],
  uniqueColumns: ColumnType[],
}

export default TableInformationType;
