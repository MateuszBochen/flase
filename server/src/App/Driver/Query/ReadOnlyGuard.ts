import CommandInterface from '../../Websocket/Interface/CommandInterface';
import CommandType from '../../Websocket/Enum/CommandType';
import DriverInterface from '../DriverInterface';
import {SqlSyntaxInterface} from './SqlSyntax';

/** rule of statement refused on read only connection - pattern and reason */
export type ReadOnlyRuleType = [RegExp, string];

/** rules of every database - read only mode itself and settings of session */
const COMMON_RULES: ReadOnlyRuleType[] = [
  [/\bread\s+write\b|\b(default_)?transaction_read_only\b|\btx_read_only\b|\bsession\s+characteristics\b/i, 'read only mode cannot be changed'],
  [/^\s*(reset|discard)\b/i, 'session settings cannot be reset'],
];

/**
 * Read only connection (e.g. production) - protection against mistakes, not against the user himself.
 * Changes are refused here, sessions of console and data grid are also read only in database
 * (statements missed here fail there). Rules of statements are in drivers (driver.refuseOnReadOnly).
 * @author Mateusz Bochen
 */
class ReadOnlyGuard {
  static isReadOnly(command: CommandInterface): boolean {
    return !!command.connectionData?.connection?.readOnly;
  }

  /** reason why command is refused on read only connection, null when it is allowed */
  static refuseCommand(command: CommandInterface, driver: DriverInterface): string | null {
    if (!ReadOnlyGuard.isReadOnly(command)) {
      return null;
    }
    const payload = command.payload || {};
    switch (command.command) {
      case CommandType.APPLY_ROW_CHANGES:
      case CommandType.CHANGE_STRUCTURE:
      case CommandType.CHANGE_USER:
      case CommandType.DATABASE_OPERATION:
      case CommandType.SET_SERVER_VARIABLE:
      case CommandType.REPLICATION_ACTION:
      case CommandType.FIND_REPLACE:
        // preview of SQL is allowed
        return payload.dryRun ? null : 'Connection is read only - changes are not allowed';
      case CommandType.KILL_PROCESS:
        return 'Connection is read only - processes cannot be stopped';
      case CommandType.CREATE_TRANSFER:
        return payload.transfer?.kind === 'dump' ? null : 'Connection is read only - import is not allowed';
      case CommandType.EXECUTE_STATEMENTS: {
        const statements: string[] = Array.isArray(payload.statements) ? payload.statements : [];
        for (const sql of statements) {
          const reason = driver.refuseOnReadOnly(sql);
          if (reason) return reason;
        }
        return null;
      }
      case CommandType.SEND_SELECT_QUERY:
        return driver.refuseOnReadOnly(String(payload.query || ''));
      default:
        return null;
    }
  }

  /**
   * statement matching a rule of the database or a common rule - comments are left out by rules of syntax,
   * executable comments (/*! ... *\/ of MySQL) are executed, so they are checked as statement
   */
  static refuseStatement(sql: string, syntax: SqlSyntaxInterface, rules: ReadOnlyRuleType[]): string | null {
    const text = sql
      .replace(syntax.executableComments ? /\/\*(?!!|M!)[\s\S]*?\*\//g : /\/\*[\s\S]*?\*\//g, ' ')
      .replace(syntax.hashComments ? /(--|#)[^\n]*/g : /--[^\n]*/g, ' ');
    const rule = [...rules, ...COMMON_RULES].find(([pattern]) => pattern.test(text));
    return rule ? `Connection is read only - ${rule[1]}: ${sql.trim().slice(0, 100)}` : null;
  }
}

export default ReadOnlyGuard;
