"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const DriverFactory_1 = __importDefault(require("../Driver/DriverFactory"));
const AbstractCommandHandler_1 = __importDefault(require("../Websocket/CommandHandler/AbstractCommandHandler"));
/** */
class EstablishConnection {
    constructor() {
        this.driverFactory = new DriverFactory_1.default();
    }
    /** returns null when request has invalid shape, otherwise description of the problem */
    static validate(data) {
        var _a, _b, _c;
        if (!data || typeof data !== 'object') {
            return 'Invalid request body';
        }
        if (typeof ((_a = data.userData) === null || _a === void 0 ? void 0 : _a.username) !== 'string' || typeof ((_b = data.userData) === null || _b === void 0 ? void 0 : _b.password) !== 'string') {
            return 'userData.username and userData.password are required';
        }
        if (typeof ((_c = data.connectionData) === null || _c === void 0 ? void 0 : _c.dsn) !== 'string' || !data.connectionData.dsn) {
            return 'connectionData.dsn is required';
        }
        return null;
    }
    connect(connectionData) {
        let driver;
        try {
            // throws for invalid dsn or not supported driver
            driver = this.driverFactory.getDriver(connectionData);
        }
        catch (e) {
            return Promise.resolve(EstablishConnection.failed(e));
        }
        return driver.connect().then(() => {
            return {
                driver: driver,
                username: connectionData.userData.username,
                error: null,
            };
        }).catch((e) => EstablishConnection.failed(e));
    }
    static failed(error) {
        return {
            driver: null,
            username: null,
            error: AbstractCommandHandler_1.default.errorToString(error),
        };
    }
}
exports.default = EstablishConnection;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRXN0YWJsaXNoQ29ubmVjdGlvbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9BcHAvQ29ubmVjdGlvbi9Fc3RhYmxpc2hDb25uZWN0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7O0FBQ0EsNEVBQW9EO0FBRXBELGdIQUF3RjtBQUd4RixNQUFNO0FBQ04sTUFBTSxtQkFBbUI7SUFFdkI7UUFDRSxJQUFJLENBQUMsYUFBYSxHQUFHLElBQUksdUJBQWEsRUFBRSxDQUFDO0lBQzNDLENBQUM7SUFFRCx3RkFBd0Y7SUFDeEYsTUFBTSxDQUFDLFFBQVEsQ0FBQyxJQUFTOztRQUN2QixJQUFJLENBQUMsSUFBSSxJQUFJLE9BQU8sSUFBSSxLQUFLLFFBQVEsRUFBRTtZQUNyQyxPQUFPLHNCQUFzQixDQUFDO1NBQy9CO1FBQ0QsSUFBSSxPQUFPLENBQUEsTUFBQSxJQUFJLENBQUMsUUFBUSwwQ0FBRSxRQUFRLENBQUEsS0FBSyxRQUFRLElBQUksT0FBTyxDQUFBLE1BQUEsSUFBSSxDQUFDLFFBQVEsMENBQUUsUUFBUSxDQUFBLEtBQUssUUFBUSxFQUFFO1lBQzlGLE9BQU8sc0RBQXNELENBQUM7U0FDL0Q7UUFDRCxJQUFJLE9BQU8sQ0FBQSxNQUFBLElBQUksQ0FBQyxjQUFjLDBDQUFFLEdBQUcsQ0FBQSxLQUFLLFFBQVEsSUFBSSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsR0FBRyxFQUFFO1lBQzVFLE9BQU8sZ0NBQWdDLENBQUM7U0FDekM7UUFDRCxPQUFPLElBQUksQ0FBQztJQUNkLENBQUM7SUFFRCxPQUFPLENBQUMsY0FBMEM7UUFDaEQsSUFBSSxNQUF1QixDQUFDO1FBQzVCLElBQUk7WUFDRixpREFBaUQ7WUFDakQsTUFBTSxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsU0FBUyxDQUFDLGNBQWMsQ0FBQyxDQUFDO1NBQ3ZEO1FBQUMsT0FBTyxDQUFDLEVBQUU7WUFDVixPQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUMsbUJBQW1CLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7U0FDdkQ7UUFFRCxPQUFPLE1BQU0sQ0FBQyxPQUFPLEVBQUUsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFO1lBQ2hDLE9BQU87Z0JBQ0wsTUFBTSxFQUFFLE1BQU07Z0JBQ2QsUUFBUSxFQUFFLGNBQWMsQ0FBQyxRQUFRLENBQUMsUUFBUTtnQkFDMUMsS0FBSyxFQUFFLElBQUk7YUFDWixDQUFDO1FBQ0osQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxtQkFBbUIsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNqRCxDQUFDO0lBRU8sTUFBTSxDQUFDLE1BQU0sQ0FBQyxLQUFVO1FBQzlCLE9BQU87WUFDTCxNQUFNLEVBQUUsSUFBSTtZQUNaLFFBQVEsRUFBRSxJQUFJO1lBQ2QsS0FBSyxFQUFFLGdDQUFzQixDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUM7U0FDbkQsQ0FBQztJQUNKLENBQUM7Q0FDRjtBQUVELGtCQUFlLG1CQUFtQixDQUFDIn0=