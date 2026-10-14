import DriverInterface from '../Driver/DriverInterface';
import JWT from '../JWT/JWT';
import Settings from '../Settings/Settings';
import EstablishedUser from '../Connection/Interface/EstablishedUser';
import ConnectionRequestInterface from '../Connection/Interface/ConnectionRequestInterface';
const uuid = require('uuid');

/** close code of websocket when session does not exist or expired - client must log in again */
export const CLOSE_SESSION_NOT_FOUND = 4001;

type SessionType = {
  driver: DriverInterface;
  username: string;
  /** read only enforced by server (predefined connection), browser cannot turn it off */
  readOnly: boolean;
  /** expiration of the newest token, ms */
  expiresAt: number;
  /** websockets of browser tabs - closed with the session, otherwise they would keep closed database driver */
  websockets: Set<WebSocket>;
  /** login of session - other database of PostgreSQL server is opened with it */
  request?: ConnectionRequestInterface;
  releaseTimer?: ReturnType<typeof setTimeout>;
};

/**
 * Logged in database connections. Session lives as long as its newest token is valid,
 * token can be refreshed without losing the database connection.
 * @author Mateusz Bochen
 */
class SessionStore {
  private readonly sessions: {[sessionId: string]: SessionType} = {};

  private static cancelRelease(session: SessionType): void {
    if (session.releaseTimer) {
      clearTimeout(session.releaseTimer);
      session.releaseTimer = undefined;
    }
  }

  /** new session for connected driver, returns token for client */
  create(driver: DriverInterface, username: string, options: {readOnly?: boolean, request?: ConnectionRequestInterface} = {}): EstablishedUser {
    const sessionId = uuid.v4();
    const token = JWT.getJwtToken({username, sessionId});
    this.sessions[sessionId] = {driver, username, readOnly: !!options.readOnly, expiresAt: SessionStore.expiresAt(token), websockets: new Set(), request: options.request};

    // released if client never opens websocket
    this.scheduleRelease(sessionId);
    return {token, username};
  }

  /** session of valid token */
  findByToken(token: string): {sessionId: string, session: SessionType} | null {
    const payload = JWT.verify(token);
    if (!payload?.sessionId || !this.sessions[payload.sessionId]) {
      return null;
    }
    return {sessionId: payload.sessionId, session: this.sessions[payload.sessionId]};
  }

  /** new token for the same session, null when token is invalid / expired or session does not exist */
  refresh(token: string): EstablishedUser | null {
    const found = this.findByToken(token);
    if (!found) {
      return null;
    }
    const newToken = JWT.getJwtToken({username: found.session.username, sessionId: found.sessionId});
    found.session.expiresAt = SessionStore.expiresAt(newToken);
    return {token: newToken, username: found.session.username};
  }

  /** close session of token, also of expired one */
  closeByToken(token: string): void {
    const payload = JWT.verifyIgnoringExpiration(token);
    if (payload?.sessionId) {
      this.close(payload.sessionId);
    }
  }

  close(sessionId: string): void {
    const session = this.sessions[sessionId];
    if (!session) {
      return;
    }
    SessionStore.cancelRelease(session);
    session.driver.disconnect();
    delete this.sessions[sessionId];
    // open tabs are told to log in again (token expired while computer slept, logout in other tab)
    session.websockets.forEach((websocket) => {
      try {
        websocket.close(CLOSE_SESSION_NOT_FOUND, 'Session expired or does not exist, log in again');
      } catch (e) {
        // already closed
      }
    });
    session.websockets.clear();
  }

  websocketOpened(sessionId: string, websocket: WebSocket): void {
    const session = this.sessions[sessionId];
    if (session) {
      SessionStore.cancelRelease(session);
      session.websockets.add(websocket);
    }
  }

  /** browser tab closed - keep login, but do not hold database connections */
  websocketClosed(sessionId: string, websocket: WebSocket): void {
    const session = this.sessions[sessionId];
    if (session) {
      session.websockets.delete(websocket);
      if (session.websockets.size === 0) {
        this.scheduleRelease(sessionId);
      }
    }
  }

  /** close sessions which tokens expired, returns number of active sessions */
  removeExpired(): number {
    const now = Date.now();
    Object.keys(this.sessions)
      .filter((sessionId) => this.sessions[sessionId].expiresAt <= now)
      .forEach((sessionId) => this.close(sessionId));
    return Object.keys(this.sessions).length;
  }

  private scheduleRelease(sessionId: string): void {
    const session = this.sessions[sessionId];
    SessionStore.cancelRelease(session);
    session.releaseTimer = setTimeout(() => {
      if (this.sessions[sessionId] && session.websockets.size === 0) {
        session.driver.releaseConnections();
      }
    }, Settings.getIdleConnectionReleaseMs());
  }

  private static expiresAt(token: string): number {
    const exp = JWT.verify(token)?.exp;
    return exp ? exp * 1000 : Date.now();
  }
}

export default SessionStore;
