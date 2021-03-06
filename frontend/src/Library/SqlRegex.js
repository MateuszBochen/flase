import sqlParser from 'js-sql-parser';

class SqlRegex {

    setLimitToSql = (sqlString, start, limit) => {
        const ast = sqlParser.parse(sqlString);

        if (!ast) {
            return sqlString;
        }

        ast.value.limit = {
            type: 'Limit',
            value: [start, limit],
        };

        return sqlParser.stringify(ast);
    }

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
        return sqlParser.stringify(ast);
    }

    getLimitOfQuery = (sqlString) => {
        try {
            const ast = sqlParser.parse(sqlString);

            if (ast && ast.value && ast.value.limit && ast.value.limit.value) {
                if (ast.value.limit.value.length === 1) {
                    return {
                        offset: 0,
                        limit: +ast.value.limit.value[0]
                    };
                }

                return {
                    offset: +ast.value.limit.value[0],
                    limit: +ast.value.limit.value[1]
                };
            }
        } catch (e) {
            return {
                offset: 0,
                limit: 50,
            }
        }

        return {
            offset: 0,
            limit: 50,
        }

    }
}

export default SqlRegex;
