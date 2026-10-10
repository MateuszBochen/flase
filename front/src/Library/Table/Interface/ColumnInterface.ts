import TableInterface from './TableInterface';
import ReferenceTableInterface from './ReferenceTableInterface';


interface ColumnInterface {
    table: TableInterface,
    alias?: string
    autoIncrement: boolean;
    defaultValue: any;
    /** name of column in result (alias if query uses `AS`) */
    name: string;
    /** unique key of value in result row - name, or `table.name` when name is not unique (JOIN) */
    key: string;
    /** name of column in table, empty for expressions */
    orgName?: string;
    /** database type, e.g. varchar(191), int unsigned, enum('a','b') */
    type?: string;
    enumValues?: string[];
    /** value can be changed by row editing */
    editable?: boolean;
    nullable: boolean;
    primaryKey: boolean;
    reference?: ReferenceTableInterface,
}

export default ColumnInterface;
