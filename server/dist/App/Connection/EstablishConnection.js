"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const DriverFactory_1 = __importDefault(require("../Driver/DriverFactory"));
const JWT_1 = __importDefault(require("../JWT/JWT"));
/** */
class EstablishConnection {
    constructor() {
        this.driverFactory = new DriverFactory_1.default();
    }
    connect(connectionData) {
        const driver = this.driverFactory.getDriver(connectionData);
        return driver.connect().then(() => {
            return {
                driver: driver,
                userData: {
                    token: JWT_1.default.getJwtToken({ username: connectionData.userData.username }),
                    username: connectionData.userData.username,
                }
            };
        }).catch(() => {
            return {
                driver: null,
                userData: null,
            };
        });
    }
}
exports.default = EstablishConnection;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRXN0YWJsaXNoQ29ubmVjdGlvbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9BcHAvQ29ubmVjdGlvbi9Fc3RhYmxpc2hDb25uZWN0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7O0FBQ0EsNEVBQW9EO0FBRXBELHFEQUE2QjtBQUU3QixNQUFNO0FBQ04sTUFBTSxtQkFBbUI7SUFFdkI7UUFDRSxJQUFJLENBQUMsYUFBYSxHQUFHLElBQUksdUJBQWEsRUFBRSxDQUFDO0lBQzNDLENBQUM7SUFFRCxPQUFPLENBQUMsY0FBMEM7UUFDaEQsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxTQUFTLENBQUMsY0FBYyxDQUFDLENBQUM7UUFDNUQsT0FBTyxNQUFNLENBQUMsT0FBTyxFQUFFLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRTtZQUNoQyxPQUFPO2dCQUNMLE1BQU0sRUFBRSxNQUFNO2dCQUNkLFFBQVEsRUFBRTtvQkFDUixLQUFLLEVBQUUsYUFBRyxDQUFDLFdBQVcsQ0FBQyxFQUFDLFFBQVEsRUFBRSxjQUFjLENBQUMsUUFBUSxDQUFDLFFBQVEsRUFBQyxDQUFDO29CQUNwRSxRQUFRLEVBQUUsY0FBYyxDQUFDLFFBQVEsQ0FBQyxRQUFRO2lCQUMzQzthQUNGLENBQUM7UUFDSixDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFO1lBQ1osT0FBTztnQkFDTCxNQUFNLEVBQUUsSUFBSTtnQkFDWixRQUFRLEVBQUUsSUFBSTthQUNmLENBQUM7UUFDSixDQUFDLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQUVELGtCQUFlLG1CQUFtQixDQUFDIn0=