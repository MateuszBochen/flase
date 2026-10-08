"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const CommandType_1 = __importDefault(require("../../Websocket/Enum/CommandType"));
/**
 * Read only connection (e.g. production) - protection against mistakes, not against the user himself.
 * Changes are refused here, sessions of console and data grid are also read only in database
 * (statements missed here fail there).
 * @author Mateusz Bochen
 */
class ReadOnlyGuard {
    static isReadOnly(command) {
        var _a, _b;
        return !!((_b = (_a = command.connectionData) === null || _a === void 0 ? void 0 : _a.connection) === null || _b === void 0 ? void 0 : _b.readOnly);
    }
    /** reason why command is refused on read only connection, null when it is allowed */
    static refuseCommand(command) {
        var _a;
        if (!ReadOnlyGuard.isReadOnly(command)) {
            return null;
        }
        const payload = command.payload || {};
        switch (command.command) {
            case CommandType_1.default.APPLY_ROW_CHANGES:
            case CommandType_1.default.CHANGE_STRUCTURE:
            case CommandType_1.default.CHANGE_USER:
                // preview of SQL is allowed
                return payload.dryRun ? null : 'Connection is read only - changes are not allowed';
            case CommandType_1.default.KILL_PROCESS:
                return 'Connection is read only - processes cannot be stopped';
            case CommandType_1.default.CREATE_TRANSFER:
                return ((_a = payload.transfer) === null || _a === void 0 ? void 0 : _a.kind) === 'dump' ? null : 'Connection is read only - import is not allowed';
            case CommandType_1.default.EXECUTE_STATEMENTS: {
                const statements = Array.isArray(payload.statements) ? payload.statements : [];
                for (const sql of statements) {
                    const reason = ReadOnlyGuard.refuseStatement(sql);
                    if (reason)
                        return reason;
                }
                return null;
            }
            case CommandType_1.default.SEND_SELECT_QUERY:
                return ReadOnlyGuard.refuseStatement(String(payload.query || ''));
            default:
                return null;
        }
    }
    /** statements which would switch read only mode off or work outside of transaction */
    static refuseStatement(sql) {
        const text = sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(--|#)[^\n]*/g, ' ');
        const rules = [
            [/\bread\s+write\b|\b(default_)?transaction_read_only\b|\btx_read_only\b|\bsession\s+characteristics\b/i, 'read only mode cannot be changed'],
            [/^\s*(reset|discard)\b/i, 'session settings cannot be reset'],
            [/^\s*kill\b|\bpg_(terminate|cancel)_backend\b/i, 'processes cannot be stopped'],
            [/\binto\s+(outfile|dumpfile)\b|\bto\s+program\b|\blo_(export|import)\b/i, 'files cannot be written'],
        ];
        const rule = rules.find(([pattern]) => pattern.test(text));
        return rule ? `Connection is read only - ${rule[1]}: ${sql.trim().slice(0, 100)}` : null;
    }
}
exports.default = ReadOnlyGuard;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiUmVhZE9ubHlHdWFyZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9BcHAvRHJpdmVyL1F1ZXJ5L1JlYWRPbmx5R3VhcmQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFDQSxtRkFBMkQ7QUFFM0Q7Ozs7O0dBS0c7QUFDSCxNQUFNLGFBQWE7SUFDakIsTUFBTSxDQUFDLFVBQVUsQ0FBQyxPQUF5Qjs7UUFDekMsT0FBTyxDQUFDLENBQUMsQ0FBQSxNQUFBLE1BQUEsT0FBTyxDQUFDLGNBQWMsMENBQUUsVUFBVSwwQ0FBRSxRQUFRLENBQUEsQ0FBQztJQUN4RCxDQUFDO0lBRUQscUZBQXFGO0lBQ3JGLE1BQU0sQ0FBQyxhQUFhLENBQUMsT0FBeUI7O1FBQzVDLElBQUksQ0FBQyxhQUFhLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxFQUFFO1lBQ3RDLE9BQU8sSUFBSSxDQUFDO1NBQ2I7UUFDRCxNQUFNLE9BQU8sR0FBRyxPQUFPLENBQUMsT0FBTyxJQUFJLEVBQUUsQ0FBQztRQUN0QyxRQUFRLE9BQU8sQ0FBQyxPQUFPLEVBQUU7WUFDdkIsS0FBSyxxQkFBVyxDQUFDLGlCQUFpQixDQUFDO1lBQ25DLEtBQUsscUJBQVcsQ0FBQyxnQkFBZ0IsQ0FBQztZQUNsQyxLQUFLLHFCQUFXLENBQUMsV0FBVztnQkFDMUIsNEJBQTRCO2dCQUM1QixPQUFPLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsbURBQW1ELENBQUM7WUFDckYsS0FBSyxxQkFBVyxDQUFDLFlBQVk7Z0JBQzNCLE9BQU8sdURBQXVELENBQUM7WUFDakUsS0FBSyxxQkFBVyxDQUFDLGVBQWU7Z0JBQzlCLE9BQU8sQ0FBQSxNQUFBLE9BQU8sQ0FBQyxRQUFRLDBDQUFFLElBQUksTUFBSyxNQUFNLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsaURBQWlELENBQUM7WUFDdEcsS0FBSyxxQkFBVyxDQUFDLGtCQUFrQixDQUFDLENBQUM7Z0JBQ25DLE1BQU0sVUFBVSxHQUFhLEtBQUssQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7Z0JBQ3pGLEtBQUssTUFBTSxHQUFHLElBQUksVUFBVSxFQUFFO29CQUM1QixNQUFNLE1BQU0sR0FBRyxhQUFhLENBQUMsZUFBZSxDQUFDLEdBQUcsQ0FBQyxDQUFDO29CQUNsRCxJQUFJLE1BQU07d0JBQUUsT0FBTyxNQUFNLENBQUM7aUJBQzNCO2dCQUNELE9BQU8sSUFBSSxDQUFDO2FBQ2I7WUFDRCxLQUFLLHFCQUFXLENBQUMsaUJBQWlCO2dCQUNoQyxPQUFPLGFBQWEsQ0FBQyxlQUFlLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxLQUFLLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztZQUNwRTtnQkFDRSxPQUFPLElBQUksQ0FBQztTQUNmO0lBQ0gsQ0FBQztJQUVELHNGQUFzRjtJQUN0RixNQUFNLENBQUMsZUFBZSxDQUFDLEdBQVc7UUFDaEMsTUFBTSxJQUFJLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FBQyxtQkFBbUIsRUFBRSxHQUFHLENBQUMsQ0FBQyxPQUFPLENBQUMsZUFBZSxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBQ2pGLE1BQU0sS0FBSyxHQUF1QjtZQUNoQyxDQUFDLHVHQUF1RyxFQUFFLGtDQUFrQyxDQUFDO1lBQzdJLENBQUMsd0JBQXdCLEVBQUUsa0NBQWtDLENBQUM7WUFDOUQsQ0FBQywrQ0FBK0MsRUFBRSw2QkFBNkIsQ0FBQztZQUNoRixDQUFDLHdFQUF3RSxFQUFFLHlCQUF5QixDQUFDO1NBQ3RHLENBQUM7UUFDRixNQUFNLElBQUksR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsRUFBRSxFQUFFLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQzNELE9BQU8sSUFBSSxDQUFDLENBQUMsQ0FBQyw2QkFBNkIsSUFBSSxDQUFDLENBQUMsQ0FBQyxLQUFLLEdBQUcsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQztJQUMzRixDQUFDO0NBQ0Y7QUFFRCxrQkFBZSxhQUFhLENBQUMifQ==