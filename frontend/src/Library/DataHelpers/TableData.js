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

    addFunctionsToColumns(columns, functionName) {

    }

}

export default TableData;