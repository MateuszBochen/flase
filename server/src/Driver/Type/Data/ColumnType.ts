import TableType from './TableType';
import ReferenceTableType from './ReferenceTableType';


type ColumnType = {
    table: TableType,
    alias?: string
    autoIncrement: boolean;
    defaultValue: any;
    name: string;
    nullable: boolean;
    primaryKey: boolean;
    reference?: ReferenceTableType,
}

export default ColumnType;
