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
    create(driver, username) {
        const sessionId = uuid.v4();
        const token = JWT_1.default.getJwtToken({ username, sessionId });
        this.sessions[sessionId] = { driver, username, expiresAt: SessionStore.expiresAt(token), openWebsockets: 0 };
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU2Vzc2lvblN0b3JlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL0FwcC9TZXNzaW9uL1Nlc3Npb25TdG9yZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7OztBQUNBLHFEQUE2QjtBQUM3QixvRUFBNEM7QUFFNUMsTUFBTSxJQUFJLEdBQUcsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0FBVzdCOzs7O0dBSUc7QUFDSCxNQUFNLFlBQVk7SUFBbEI7UUFDbUIsYUFBUSxHQUF1QyxFQUFFLENBQUM7SUFvR3JFLENBQUM7SUFsR1MsTUFBTSxDQUFDLGFBQWEsQ0FBQyxPQUFvQjtRQUMvQyxJQUFJLE9BQU8sQ0FBQyxZQUFZLEVBQUU7WUFDeEIsWUFBWSxDQUFDLE9BQU8sQ0FBQyxZQUFZLENBQUMsQ0FBQztZQUNuQyxPQUFPLENBQUMsWUFBWSxHQUFHLFNBQVMsQ0FBQztTQUNsQztJQUNILENBQUM7SUFFRCxpRUFBaUU7SUFDakUsTUFBTSxDQUFDLE1BQXVCLEVBQUUsUUFBZ0I7UUFDOUMsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLEVBQUUsRUFBRSxDQUFDO1FBQzVCLE1BQU0sS0FBSyxHQUFHLGFBQUcsQ0FBQyxXQUFXLENBQUMsRUFBQyxRQUFRLEVBQUUsU0FBUyxFQUFDLENBQUMsQ0FBQztRQUNyRCxJQUFJLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxHQUFHLEVBQUMsTUFBTSxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsWUFBWSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsRUFBRSxjQUFjLEVBQUUsQ0FBQyxFQUFDLENBQUM7UUFFM0csMkNBQTJDO1FBQzNDLElBQUksQ0FBQyxlQUFlLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDaEMsT0FBTyxFQUFDLEtBQUssRUFBRSxRQUFRLEVBQUMsQ0FBQztJQUMzQixDQUFDO0lBRUQsNkJBQTZCO0lBQzdCLFdBQVcsQ0FBQyxLQUFhO1FBQ3ZCLE1BQU0sT0FBTyxHQUFH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