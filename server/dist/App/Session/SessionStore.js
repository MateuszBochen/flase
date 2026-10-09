"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const JWT_1 = __importDefault(require("../JWT/JWT"));
const Settings_1 = __importDefault(require("../Settings/Settings"));
const uuid = require('uuid');
/**
 * Logged in database connections. Session lives as long as its newest token is valid,
 * token can be refreshed without losing the database connection.
 * @author Mateusz Bochen
 */
class SessionStore {
    constructor() {
        this.sessions = {};
    }
    static cancelRelease(session) {
        if (session.releaseTimer) {
            clearTimeout(session.releaseTimer);
            session.releaseTimer = undefined;
        }
    }
    /** new session for connected driver, returns token for client */
    create(driver, username, options = {}) {
        const sessionId = uuid.v4();
        const token = JWT_1.default.getJwtToken({ username, sessionId });
        this.sessions[sessionId] = { driver, username, readOnly: !!options.readOnly, expiresAt: SessionStore.expiresAt(token), openWebsockets: 0 };
        // released if client never opens websocket
        this.scheduleRelease(sessionId);
        return { token, username };
    }
    /** session of valid token */
    findByToken(token) {
        const payload = JWT_1.default.verify(token);
        if (!(payload === null || payload === void 0 ? void 0 : payload.sessionId) || !this.sessions[payload.sessionId]) {
            return null;
        }
        return { sessionId: payload.sessionId, session: this.sessions[payload.sessionId] };
    }
    /** new token for the same session, null when token is invalid / expired or session does not exist */
    refresh(token) {
        const found = this.findByToken(token);
        if (!found) {
            return null;
        }
        const newToken = JWT_1.default.getJwtToken({ username: found.session.username, sessionId: found.sessionId });
        found.session.expiresAt = SessionStore.expiresAt(newToken);
        return { token: newToken, username: found.session.username };
    }
    /** close session of token, also of expired one */
    closeByToken(token) {
        const payload = JWT_1.default.verifyIgnoringExpiration(token);
        if (payload === null || payload === void 0 ? void 0 : payload.sessionId) {
            this.close(payload.sessionId);
        }
    }
    close(sessionId) {
        const session = this.sessions[sessionId];
        if (!session) {
            return;
        }
        SessionStore.cancelRelease(session);
        session.driver.disconnect();
        delete this.sessions[sessionId];
    }
    websocketOpened(sessionId) {
        const session = this.sessions[sessionId];
        if (session) {
            SessionStore.cancelRelease(session);
            session.openWebsockets++;
        }
    }
    /** browser tab closed - keep login, but do not hold database connections */
    websocketClosed(sessionId) {
        const session = this.sessions[sessionId];
        if (session) {
            session.openWebsockets = Math.max(0, session.openWebsockets - 1);
            if (session.openWebsockets === 0) {
                this.scheduleRelease(sessionId);
            }
        }
    }
    /** close sessions which tokens expired, returns number of active sessions */
    removeExpired() {
        const now = Date.now();
        Object.keys(this.sessions)
            .filter((sessionId) => this.sessions[sessionId].expiresAt <= now)
            .forEach((sessionId) => this.close(sessionId));
        return Object.keys(this.sessions).length;
    }
    scheduleRelease(sessionId) {
        const session = this.sessions[sessionId];
        SessionStore.cancelRelease(session);
        session.releaseTimer = setTimeout(() => {
            if (this.sessions[sessionId] && session.openWebsockets === 0) {
                session.driver.releaseConnections();
            }
        }, Settings_1.default.getIdleConnectionReleaseMs());
    }
    static expiresAt(token) {
        var _a;
        const exp = (_a = JWT_1.default.verify(token)) === null || _a === void 0 ? void 0 : _a.exp;
        return exp ? exp * 1000 : Date.now();
    }
}
exports.default = SessionStore;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU2Vzc2lvblN0b3JlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL0FwcC9TZXNzaW9uL1Nlc3Npb25TdG9yZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7OztBQUNBLHFEQUE2QjtBQUM3QixvRUFBNEM7QUFFNUMsTUFBTSxJQUFJLEdBQUcsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0FBYTdCOzs7O0dBSUc7QUFDSCxNQUFNLFlBQVk7SUFBbEI7UUFDbUIsYUFBUSxHQUF1QyxFQUFFLENBQUM7SUFvR3JFLENBQUM7SUFsR1MsTUFBTSxDQUFDLGFBQWEsQ0FBQyxPQUFvQjtRQUMvQyxJQUFJLE9BQU8sQ0FBQyxZQUFZLEVBQUU7WUFDeEIsWUFBWSxDQUFDLE9BQU8sQ0FBQyxZQUFZLENBQUMsQ0FBQztZQUNuQyxPQUFPLENBQUMsWUFBWSxHQUFHLFNBQVMsQ0FBQztTQUNsQztJQUNILENBQUM7SUFFRCxpRUFBaUU7SUFDakUsTUFBTSxDQUFDLE1BQXVCLEVBQUUsUUFBZ0IsRUFBRSxVQUFnQyxFQUFFO1FBQ2xGLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxFQUFFLEVBQUUsQ0FBQztRQUM1QixNQUFNLEtBQUssR0FBRyxhQUFHLENBQUMsV0FBVyxDQUFDLEVBQUMsUUFBUSxFQUFFLFNBQVMsRUFBQyxDQUFDLENBQUM7UUFDckQsSUFBSSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsR0FBRyxFQUFDLE1BQU0sRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsUUFBUSxFQUFFLFNBQVMsRUFBRSxZQUFZLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxFQUFFLGNBQWMsRUFBRSxDQUFDLEVBQUMsQ0FBQztRQUV6SSwyQ0FBMkM7UUFDM0MsSUFBSSxDQUFDLGVBQWUsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUNoQyxPQUFPLEVBQUMsS0FBSyxFQUFFLFFBQVEsRUFBQyxDQUFDO0lBQzNCLENB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