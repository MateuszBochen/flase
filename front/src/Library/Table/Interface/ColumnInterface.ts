import TableInterface from './TableInterface';
import ReferenceTableInterface from './ReferenceTableInterface';


interface ColumnInterface {
    table: TableInterface,
    alias?: string
    autoIncrement: boolean;
    defaultValue: any;
    name: string;
    nullable: boolean;
    primaryKey: boolean;
    reference?: ReferenceTableInterface,
}

export default ColumnInterface;
