import CommandInterface from '../../Websocket/Interface/CommandInterface';
import CommandType from '../../Websocket/Enum/CommandType';

/**
 * Read only connection (e.g. production) - protection against mistakes, not against the user himself.
 * Changes are refused here, sessions of console and data grid are also read only in database
 * (statements missed here fail there).
 * @author Mateusz Bochen
 */
class ReadOnlyGuard {
  static isReadOnly(command: CommandInterface): boolean {
    return !!command.connectionData?.connection?.readOnly;
  }

  /** reason why command is refused on read only connection, null when it is allowed */
  static refuseCommand(command: CommandInterface): string | null {
    if (!ReadOnlyGuard.isReadOnly(command)) {
      return null;
    }
    const payload = command.payload || {};
    switch (command.command) {
      case CommandType.APPLY_ROW_CHANGES:
      case CommandType.CHANGE_STRUCTURE:
      case CommandType.CHANGE_USER:
        // preview of SQL is allowed
        return payload.dryRun ? null : 'Connection is read only - changes are not allowed';
      case CommandType.KILL_PROCESS:
        return 'Connection is read only - processes cannot be stopped';
      case CommandType.CREATE_TRANSFER:
        return payload.transfer?.kind === 'dump' ? null : 'Connection is read only - import is not allowed';
      case CommandType.EXECUTE_STATEMENTS: {
        const statements: string[] = Array.isArray(payload.statements) ? payload.statements : [];
        for (const sql of statements) {
          const reason = ReadOnlyGuard.refuseStatement(sql);
          if (reason) return reason;
        }
        return null;
      }
      case CommandType.SEND_SELECT_QUERY:
        return ReadOnlyGuard.refuseStatement(String(payload.query || ''));
      default:
        return null;
    }
  }

  /** statements which would switch read only mode off or work outside of transaction */
  static refuseStatement(sql: string): string | null {
    const text = sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(--|#)[^\n]*/g, ' ');
    const rules: [RegExp, string][] = [
      [/\bread\s+write\b|\b(default_)?transaction_read_only\b|\btx_read_only\b|\bsession\s+characteristics\b/i, 'read only mode cannot be changed'],
      [/^\s*(reset|discard)\b/i, 'session settings cannot be reset'],
      [/^\s*kill\b|\bpg_(terminate|cancel)_backend\b/i, 'processes cannot be stopped'],
      [/\binto\s+(outfile|dumpfile)\b|\bto\s+program\b|\blo_(export|import)\b/i, 'files cannot be written'],
    ];
    const rule = rules.find(([pattern]) => pattern.test(text));
    return rule ? `Connection is read only - ${rule[1]}: ${sql.trim().slice(0, 100)}` : null;
  }
}

export default ReadOnlyGuard;
