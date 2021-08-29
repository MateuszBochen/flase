

type TableIndexType = {
    Table: string,
    Non_unique: number,
    Key_name: string,
    Seq_in_index: number,
    Column_name: string,
    Collation: string,
    Cardinality: number,
    Sub_part?: string,
    Packed?: string,
    Null?: string,
    Index_type?: string,
    Comment?: string,
    Index_comment?: string,
    Visible?: string,
    Expression?: string,
}

export default TableIndexType;
