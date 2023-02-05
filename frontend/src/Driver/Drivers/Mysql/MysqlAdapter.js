import sqlParser from 'js-sql-parser';


class MysqlAdapter {
    simpleSelectQuery(from, limit) {
        return `SELECT * FROM \`${from}\` WHERE 1 LIMIT ${limit}`;
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

export default MysqlAdapter;
