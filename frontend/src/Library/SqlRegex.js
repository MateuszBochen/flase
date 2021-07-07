

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
}

export default SqlRegex;
