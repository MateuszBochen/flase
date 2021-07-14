import sqlParser from 'js-sql-parser';

class SqlRegex {

    setLimitToSql = (sqlString, start, limit) => {
        const regexOffsetAndLimit = /LIMIT (\d+), ?(\d+)/gm;
        const regexOnlyLimit = /LIMIT (\d+)/gm;

        if (regexOffsetAndLimit.test(sqlString)) {
            return sqlString.replace(regexOffsetAndLimit, `LIMIT ${start}, ${limit}`);
        }

        if (regexOnlyLimit.test(sqlString)) {
            return sqlString.replace(regexOnlyLimit, `LIMIT ${start}, ${limit}`);
        }

        return sqlString;
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
}

export default SqlRegex;
