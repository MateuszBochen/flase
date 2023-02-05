import sqlParser from 'js-sql-parser';

class SqlRegex {

    /**
     * @deprecated
     */
    setLimitToSql = (sqlString, start, limit) => {
        const ast = sqlParser.parse(sqlString);

        if (!ast) {
            return sqlString;
        }

        ast.value.limit = {
            type: 'Limit',
            value: [start, limit],
        };

        return sqlParser.stringify(ast).trim();
    }

    /**
     * @deprecated
     */
    setOrderByToSql = (sqlString, column, direction) => {

        const ast = sqlParser.parse(sqlString);

        ast.value.orderBy = {};
        ast.value.orderBy.type = 'OrderBy';
        ast.value.orderBy.value = [];
        ast.value.orderBy.value.push({
            value: {
                type: 'Identifier',
                value: column,
            },
            type: 'GroupByOrderByItem',
            sortOpt: direction,
        });
        return sqlParser.stringify(ast).trim();
    }
}

export default SqlRegex;
