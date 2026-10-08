"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const { types: pgTypes } = require('pg');
/**
 * Quoting of names and values for PostgreSQL, type parsers of results.
 * @author Mateusz Bochen
 */
class PostgresSql {
    static identifier(name) {
        return `"${String(name).replace(/"/g, '""')}"`;
    }
    /** "schema"."table" */
    static table(schema, name) {
        return `${PostgresSql.identifier(schema)}.${PostgresSql.identifier(name)}`;
    }
    /** string literal, correct with any standard_conforming_strings */
    static literal(value) {
        if (value === null || value === undefined) {
            return 'NULL';
        }
        if (typeof value === 'number' && Number.isFinite(value)) {
            return String(value);
        }
        if (typeof value === 'boolean') {
            return value ? 'TRUE' : 'FALSE';
        }
        if (Buffer.isBuffer(value)) {
            return `'\\x${value.toString('hex')}'::bytea`;
        }
        const text = String(value);
        const quoted = `'${text.replace(/'/g, "''")}'`;
        return text.includes('\\') ? `E${quoted.replace(/\\/g, '\\\\')}` : quoted;
    }
    /** "a", "b" */
    static identifiers(names) {
        return names.map((name) => PostgresSql.identifier(name)).join(', ');
    }
    /** shorter names of types as used in DDL - character varying(50) -> varchar(50) */
    static shortType(type) {
        return type
            .replace(/^character varying/, 'varchar')
            .replace(/^character\b/, 'char')
            .replace(/^timestamp(\(\d+\))? without time zone/, 'timestamp$1')
            .replace(/^timestamp(\(\d+\))? with time zone/, 'timestamptz$1')
            .replace(/^time(\(\d+\))? without time zone/, 'time$1')
            .replace(/^time(\(\d+\))? with time zone/, 'timetz$1')
            .replace(/^bit varying/, 'varbit');
    }
}
/**
 * Values stay as they are in database (dates without timezone shift, json as text, numbers without rounding).
 * bytea is Buffer (sent as binary value), small integers are numbers, booleans true / false.
 */
PostgresSql.types = {
    getTypeParser: (oid, format = 'text') => {
        switch (oid) {
            case 17:
                return pgTypes.getTypeParser(17, format);
            case 21:
            case 23:
            case 26:
                return (value) => Number(value);
            case 16:
                return (value) => value === 't' ? 'true' : 'false';
            default:
                return (value) => value;
        }
    },
};
exports.default = PostgresSql;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiUG9zdGdyZXNTcWwuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi9zcmMvQXBwL0RyaXZlci9Ecml2ZXJzL1Bvc3RncmVzL1Bvc3RncmVzU3FsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQUEsTUFBTSxFQUFDLEtBQUssRUFBRSxPQUFPLEVBQUMsR0FBRyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7QUFFdkM7OztHQUdHO0FBQ0gsTUFBTSxXQUFXO0lBQ2YsTUFBTSxDQUFDLFVBQVUsQ0FBQyxJQUFZO1FBQzVCLE9BQU8sSUFBSSxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDO0lBQ2pELENBQUM7SUFFRCx1QkFBdUI7SUFDdkIsTUFBTSxDQUFDLEtBQUssQ0FBQyxNQUFjLEVBQUUsSUFBWTtRQUN2QyxPQUFPLEdBQUcsV0FBVyxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsSUFBSSxXQUFXLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7SUFDN0UsQ0FBQztJQUVELG1FQUFtRTtJQUNuRSxNQUFNLENBQUMsT0FBTyxDQUFDLEtBQVU7UUFDdkIsSUFBSSxLQUFLLEtBQUssSUFBSSxJQUFJLEtBQUssS0FBSyxTQUFTLEVBQUU7WUFDekMsT0FBTyxNQUFNLENBQUM7U0FDZjtRQUNELElBQUksT0FBTyxLQUFLLEtBQUssUUFBUSxJQUFJLE1BQU0sQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLEVBQUU7WUFDdkQsT0FBTyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUM7U0FDdEI7UUFDRCxJQUFJLE9BQU8sS0FBSyxLQUFLLFNBQVMsRUFBRTtZQUM5QixPQUFPLEtBQUssQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUM7U0FDakM7UUFDRCxJQUFJLE1BQU0sQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLEVBQUU7WUFDMUIsT0FBTyxPQUFPLEtBQUssQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQztTQUMvQztRQUNELE1BQU0sSUFBSSxHQUFHLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUMzQixNQUFNLE1BQU0sR0FBRyxJQUFJLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUM7UUFDL0MsT0FBTyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLE1BQU0sQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQztJQUM1RSxDQUFDO0lBRUQsZUFBZTtJQUNmLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBZTtRQUNoQyxPQUFPLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDdEUsQ0FBQztJQUVELG1GQUFtRjtJQUNuRixNQUFNLENBQUMsU0FBUyxDQUFDLElBQVk7UUFDM0IsT0FBTyxJQUFJO2FBQ1IsT0FBTyxDQUFDLG9CQUFvQixFQUFFLFNBQVMsQ0FBQzthQUN4QyxPQUFPLENBQUMsY0FBYyxFQUFFLE1BQU0sQ0FBQzthQUMvQixPQUFPLENBQUMsd0NBQXdDLEVBQUUsYUFBYSxDQUFDO2FBQ2hFLE9BQU8sQ0FBQyxxQ0FBcUMsRUFBRSxlQUFlLENBQUM7YUFDL0QsT0FBTyxDQUFDLG1DQUFtQyxFQUFFLFFBQVEsQ0FBQzthQUN0RCxPQUFPLENBQUMsZ0NBQWdDLEVBQUUsVUFBVSxDQUFDO2FBQ3JELE9BQU8sQ0FBQyxjQUFjLEVBQUUsUUFBUSxDQUFDLENBQUM7SUFDdkMsQ0FBQzs7QUFFRDs7O0dBR0c7QUFDYSxpQkFBSyxHQUFHO0lBQ3RCLGFBQWEsRUFBRSxDQUFDLEdBQVcsRUFBRSxTQUFpQixNQUFNLEVBQTRCLEVBQUU7UUFDaEYsUUFBUSxHQUFHLEVBQUU7WUFDWCxLQUFLLEVBQUU7Z0JBQ0wsT0FBTyxPQUFPLENBQUMsYUFBYSxDQUFDLEVBQUUsRUFBRSxNQUFNLENBQUMsQ0FBQztZQUMzQyxLQUFLLEVBQUUsQ0FBQztZQUFDLEtBQUssRUFBRSxDQUFDO1lBQUMsS0FBSyxFQUFFO2dCQUN2QixPQUFPLENBQUMsS0FBYSxFQUFFLEVBQUUsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDMUMsS0FBSyxFQUFFO2dCQUNMLE9BQU8sQ0FBQyxLQUFhLEVBQUUsRUFBRSxDQUFDLEtBQUssS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDO1lBQzdEO2dCQUNFLE9BQU8sQ0FBQyxLQUFhLEVBQUUsRUFBRSxDQUFDLEtBQUssQ0FBQztTQUNuQztJQUNILENBQUM7Q0FDRixDQUFDO0FBR0osa0JBQWUsV0FBVyxDQUFDIn0=