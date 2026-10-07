"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const DriverFactory_1 = __importDefault(require("../Driver/DriverFactory"));
const JWT_1 = __importDefault(require("../JWT/JWT"));
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
                userData: {
                    token: JWT_1.default.getJwtToken({ username: connectionData.userData.username }),
                    username: connectionData.userData.username,
                },
                error: null,
            };
        }).catch((e) => EstablishConnection.failed(e));
    }
    static failed(error) {
        return {
            driver: null,
            userData: null,
            error: AbstractCommandHandler_1.default.errorToString(error),
        };
    }
}
exports.default = EstablishConnection;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRXN0YWJsaXNoQ29ubmVjdGlvbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9BcHAvQ29ubmVjdGlvbi9Fc3RhYmxpc2hDb25uZWN0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7O0FBQ0EsNEVBQW9EO0FBRXBELHFEQUE2QjtBQUM3QixnSEFBd0Y7QUFHeEYsTUFBTTtBQUNOLE1BQU0sbUJBQW1CO0lBRXZCO1FBQ0UsSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLHVCQUFhLEVBQUUsQ0FBQztJQUMzQyxDQUFDO0lBRUQsd0ZBQXdGO0lBQ3hGLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBUzs7UUFDdkIsSUFBSSxDQUFDLElBQUksSUFBSSxPQUFPLElBQUksS0FBSyxRQUFRLEVBQUU7WUFDckMsT0FBTyxzQkFBc0IsQ0FBQztTQUMvQjtRQUNELElBQUksT0FBTyxDQUFBLE1BQUEsSUFBSSxDQUFDLFFBQVEsMENBQUUsUUFBUSxDQUFBLEtBQUssUUFBUSxJQUFJLE9BQU8sQ0FBQSxNQUFBLElBQUksQ0FBQyxRQUFRLDBDQUFFLFFBQVEsQ0FBQSxLQUFLLFFBQVEsRUFBRTtZQUM5RixPQUFPLHNEQUFzRCxDQUFDO1NBQy9EO1FBQ0QsSUFBSSxPQUFPLENBQUEsTUFBQSxJQUFJLENBQUMsY0FBYywwQ0FBRSxHQUFHLENBQUEsS0FBSyxRQUFRLElBQUksQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLEdBQUcsRUFBRTtZQUM1RSxPQUFPLGdDQUFnQyxDQUFDO1NBQ3pDO1FBQ0QsT0FBTyxJQUFJLENBQUM7SUFDZCxDQUFDO0lBRUQsT0FBTyxDQUFDLGNBQTBDO1FBQ2hELElBQUksTUFBdUIsQ0FBQztRQUM1QixJQUFJO1lBQ0YsaURBQWlEO1lBQ2pELE1BQU0sR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLFNBQVMsQ0FBQyxjQUFjLENBQUMsQ0FBQztTQUN2RDtRQUFDLE9BQU8sQ0FBQyxFQUFFO1lBQ1YsT0FBTyxPQUFPLENBQUMsT0FBTyxDQUFDLG1CQUFtQixDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1NBQ3ZEO1FBRUQsT0FBTyxNQUFNLENBQUMsT0FBTyxFQUFFLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRTtZQUNoQyxPQUFPO2dCQUNMLE1BQU0sRUFBRSxNQUFNO2dCQUNkLFFBQVEsRUFBRTtvQkFDUixLQUFLLEVBQUUsYUFBRyxDQUFDLFdBQVcsQ0FBQyxFQUFDLFFBQVEsRUFBRSxjQUFjLENBQUMsUUFBUSxDQUFDLFFBQVEsRUFBQyxDQUFDO29CQUNwRSxRQUFRLEVBQUUsY0FBYyxDQUFDLFFBQVEsQ0FBQyxRQUFRO2lCQUMzQztnQkFDRCxLQUFLLEVBQUUsSUFBSTthQUNaLENBQUM7UUFDSixDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLG1CQUFtQixDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2pELENBQUM7SUFFTyxNQUFNLENBQUMsTUFBTSxDQUFDLEtBQVU7UUFDOUIsT0FBTztZQUNMLE1BQU0sRUFBRSxJQUFJO1lBQ1osUUFBUSxFQUFFLElBQUk7WUFDZCxLQUFLLEVBQUUsZ0NBQXNCLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQztTQUNuRCxDQUFDO0lBQ0osQ0FBQztDQUNGO0FBRUQsa0JBQWUsbUJBQW1CLENBQUMifQ==