"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.selectedDatabaseOf = void 0;
/**
 * Database (MySQL) or schema (PostgreSQL) selected by statement, null when statement does not change it.
 * USE db, USE `db`, SET search_path TO "schema", other
 */
const selectedDatabaseOf = (sql) => {
    var _a, _b, _c, _d, _e;
    const use = /^\s*use\s+(`([^`]+)`|"([^"]+)"|([^`";\s]+))/i.exec(sql);
    if (use) {
        return (_b = (_a = use[2]) !== null && _a !== void 0 ? _a : use[3]) !== null && _b !== void 0 ? _b : use[4];
    }
    const searchPath = /^\s*set\s+(?:session\s+|local\s+)?search_path\s*(?:to|=)\s*("((?:[^"]|"")+)"|'([^']+)'|([^\s,;]+))/i.exec(sql);
    if (searchPath) {
        return (_e = (_d = (_c = searchPath[2]) === null || _c === void 0 ? void 0 : _c.replace(/""/g, '"')) !== null && _d !== void 0 ? _d : searchPath[3]) !== null && _e !== void 0 ? _e : searchPath[4].toLowerCase();
    }
    return null;
};
exports.selectedDatabaseOf = selectedDatabaseOf;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRGF0YWJhc2VTd2l0Y2guanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvQXBwL0RyaXZlci9RdWVyeS9EYXRhYmFzZVN3aXRjaC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFDQTs7O0dBR0c7QUFDSSxNQUFNLGtCQUFrQixHQUFHLENBQUMsR0FBVyxFQUFpQixFQUFFOztJQUMvRCxNQUFNLEdBQUcsR0FBRyw4Q0FBOEMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDckUsSUFBSSxHQUFHLEVBQUU7UUFDUCxPQUFPLE1BQUEsTUFBQSxHQUFHLENBQUMsQ0FBQyxDQUFDLG1DQUFJLEdBQUcsQ0FBQyxDQUFDLENBQUMsbUNBQUksR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO0tBQ25DO0lBQ0QsTUFBTSxVQUFVLEdBQUcscUdBQXFHLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQ25JLElBQUksVUFBVSxFQUFFO1FBQ2QsT0FBTyxNQUFBLE1BQUEsTUFBQSxVQUFVLENBQUMsQ0FBQyxDQUFDLDBDQUFFLE9BQU8sQ0FBQyxLQUFLLEVBQUUsR0FBRyxDQUFDLG1DQUFJLFVBQVUsQ0FBQyxDQUFDLENBQUMsbUNBQUksVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDLFdBQVcsRUFBRSxDQUFDO0tBQzNGO0lBQ0QsT0FBTyxJQUFJLENBQUM7QUFDZCxDQUFDLENBQUM7QUFWVyxRQUFBLGtCQUFrQixzQkFVN0IifQ==