import Column from '../DataTypes/Column';

class TableData {

    prepareColumnsDataType = (columns) => {
        return columns.map((item) => {
           if (typeof item  === 'string') {
               const column = new Column();
               column.name = item;
               return column;
           } else {
               return Object.assign(new Column, item);
           }
        });
    }

    addFunctionsToColumns(columns, func) {
        return columns.map((item) => {
            if (item instanceof Column) {
                item.function = func;
            }

            return item;
        });
    }
}

export default TableData;
