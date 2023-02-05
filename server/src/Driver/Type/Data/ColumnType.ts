import TableNameType from './TableNameType';


type ColumnType = {
    table: TableNameType,
    alias?: string
    autoIncrement: boolean;
    defaultValue: any;
    name: string;
    nullable: boolean;
    primaryKey: boolean;
    referenceColumn: string;
    referenceTable: string;
}

export default ColumnType;
