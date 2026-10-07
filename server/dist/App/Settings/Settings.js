"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class Settings {
    static getJWTSecret() {
        if (process.env.JWT_SECRET) {
            return process.env.JWT_SECRET;
        }
        return 'SAMPLE_JWT_SECRET';
    }
    /** database connections of login without open websocket are closed after this time */
    static getIdleConnectionReleaseMs() {
        const seconds = Number(process.env.IDLE_CONNECTION_RELEASE_SECONDS);
        return (Number.isFinite(seconds) && seconds > 0 ? seconds : 30) * 1000;
    }
    static getJWTTokenExpire() {
        if (process.env.JWT_TOKEN_EXPIRE) {
            return process.env.JWT_TOKEN_EXPIRE;
        }
        return '1h';
    }
}
exports.default = Settings;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU2V0dGluZ3MuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvQXBwL1NldHRpbmdzL1NldHRpbmdzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBRUEsTUFBTSxRQUFRO0lBRUwsTUFBTSxDQUFDLFlBQVk7UUFDeEIsSUFBSSxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsRUFBRTtZQUMxQixPQUFPLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDO1NBQy9CO1FBQ0QsT0FBTyxtQkFBbUIsQ0FBQztJQUM3QixDQUFDO0lBRUQsc0ZBQXNGO0lBQy9FLE1BQU0sQ0FBQywwQkFBMEI7UUFDdEMsTUFBTSxPQUFPLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsK0JBQStCLENBQUMsQ0FBQztRQUNwRSxPQUFPLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsSUFBSSxPQUFPLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFHLElBQUksQ0FBQztJQUN6RSxDQUFDO0lBRU0sTUFBTSxDQUFDLGlCQUFpQjtRQUM3QixJQUFJLE9BQU8sQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLEVBQUU7WUFDaEMsT0FBTyxPQUFPLENBQUMsR0FBRyxDQUFDLGdCQUFnQixDQUFDO1NBQ3JDO1FBQ0QsT0FBTyxJQUFJLENBQUM7SUFDZCxDQUFDO0NBRUY7QUFDRCxrQkFBZSxRQUFRLENBQUMifQ==